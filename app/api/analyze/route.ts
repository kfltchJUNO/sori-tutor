import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string;

    if (!audioFile || !targetText) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY; 
    if (!apiKey) throw new Error("API Key missing");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

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

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "audio/webm", data: base64Audio } }
    ]);

    const responseText = result.response.text();
    const cleanedText = responseText.replace(/```json|```/g, "").trim();
    
    return NextResponse.json(JSON.parse(cleanedText));

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}