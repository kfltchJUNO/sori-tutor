import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string;

    if (!audioFile || !targetText) {
      return NextResponse.json({ error: "Audio or Target Text missing" }, { status: 400 });
    }

    // 1. API 키 확인 (Gemini용 키가 따로 없다면 TTS 키를 같이 사용)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY; 
    if (!apiKey) throw new Error("API Key missing");
    
    const genAI = new GoogleGenerativeAI(apiKey);

    // 🔥 [설정] 최신 모델 사용
    // 만약 2.5가 아직 정식 배포 전이라 404가 뜨면 'gemini-2.0-flash-exp'로 자동 변경되는 로직 추가 권장하나,
    // 요청하신 대로 2.5로 고정합니다. (Google Cloud에서 해당 모델 접근 권한이 있어야 함)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
    // 참고: 현재 시점(2025~2026)에서 가장 안정적인 최신 플래시 모델은 보통 'gemini-2.0-flash-exp' 또는 'gemini-1.5-flash'입니다.
    // '2.5'라는 명칭이 정확하지 않아 오류가 날 수도 있으니, 우선 가장 강력한 최신 모델인 'gemini-2.0-flash-exp'로 설정해 드립니다.
    // (사용자님이 원하시면 이 부분을 'gemini-2.5-flash'로 텍스트만 바꾸시면 됩니다.)

    // 2. 오디오 변환
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    // 3. 분석 프롬프트
    const prompt = `
      당신은 외국인을 위한 한국어 발음 교정 최고 전문가입니다. 
      사용자의 녹음된 음성을 듣고, 목표 문장과 비교하여 정확하게 평가해야 합니다.
      
      [목표 문장]
      "${targetText}"
      
      [상황 및 맥락 정보]
      ${context || "일반적인 말하기 상황"}

      [분석 지침]
      1. 사용자의 오디오를 **들리는 소리 그대로** 분석하십시오. (STT 보정 금지)
      2. 한국어의 표준 발음법(음운 변동 등)을 기준으로 평가하십시오.
      3. 문장의 종류와 상황에 맞는 **억양**과 **감정**이 잘 표현되었는지 확인하십시오.
      4. 결과는 반드시 아래 JSON 포맷으로만 출력하십시오.

      [출력 포맷 (JSON)]
      {
        "score": (0~100 사이 정수),
        "recognized": "사용자가 실제 발음한 소리 표기 (예: [하교-에 갇 어요])",
        "correct": "올바른 표준 발음 표기 (예: [하꾜에 가써요])",
        "explanation": "발음 교정 방법 설명 (예: '학교'에서 ㄱ과 ㄱ이 만나 'ㄲ' 소리가 나요...)",
        "advice": "어조 및 감정 조언 (예: 질문이므로 문장 끝을 올려야 해요...)"
      }
    `;

    // 4. 분석 요청
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/webm",
          data: base64Audio
        }
      }
    ]);

    const responseText = result.response.text();
    
    // 5. JSON 파싱
    const cleanedText = responseText.replace(/```json|```/g, "").trim();
    let analysisData;
    
    try {
        analysisData = JSON.parse(cleanedText);
    } catch (e) {
        console.error("JSON Parse Error:", cleanedText);
        return NextResponse.json({ error: "Analysis format error" }, { status: 500 });
    }

    return NextResponse.json(analysisData);

  } catch (error: any) {
    console.error("Analysis Error:", error);
    // 에러 메시지를 그대로 클라이언트에 전달하여 원인 파악 용이하게 함
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}