import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string; 
    // 사용자 닉네임 받기
    const userNick = formData.get("userNick") as string || "학습자";

    if (!audioFile || !targetText) {
      return NextResponse.json({ error: "오디오 또는 목표 문장이 없습니다." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY; 
    if (!apiKey) throw new Error("API Key missing");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `
      당신은 한국어 국립국어원 표준 발음법에 정통한 언어학 교수이자 발음 교정 전문가입니다.
      
      [분석 대상]
      - 목표 텍스트: "${targetText}"
      - 문맥/상황: ${context || "일반적인 말하기 상황"}

      [🔥 중요: 출력 형식 엄수]
      1. **오직 JSON 데이터만 출력하세요.** (인사말이나 잡담을 JSON 바깥에 적지 마십시오.)
      2. 대신, **'explanation'(설명) 필드의 내용**을 작성할 때 "${userNick}님,"으로 시작하여 다정하게 이름을 불러주세요.
      
      [필수 수행 절차]
      1. **정답 소리 변환(Phonetic)**: 목표 텍스트를 반드시 '표준 발음법'에 의거하여 **소리 나는 대로** 표기하십시오.
      2. **사용자 발음 분석**: 오디오를 듣고 사용자가 실제로 낸 소리를 그대로 받아적으십시오.
      3. **음운 규칙 설명**: 사용자가 틀린 부분을 음운 변동 규칙을 들어 쉽게 설명하십시오.
      4. **어조/억양 코칭**: 문장의 종류와 감정에 따른 억양을 조언하십시오.

      [출력 포맷 (JSON Only)]
      {
        "score": 0~100 사이 정수,
        "recognized": "사용자 실제 발음 (예: [하교에 가씀니다])",
        "correct": "표준 발음 (예: [학꾜에 가씀니다])",
        "explanation": "${userNick}님, (여기에 구체적인 교정 내용을 적으세요)",
        "advice": "억양 및 감정 조언"
      }
    `;

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
    
    // 🔥 [오류 수정] JSON 파싱 강화 로직
    // AI가 앞뒤로 잡담을 붙여도 JSON 객체 부분({ ... })만 정확히 추출
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("AI 응답에서 JSON을 찾을 수 없음:", responseText);
      throw new Error("AI 응답 형식이 올바르지 않습니다.");
    }

    const analysisData = JSON.parse(jsonMatch[0]);

    return NextResponse.json(analysisData);

  } catch (error: any) {
    console.error("Analysis Error:", error);
    
    const errMsg = error.message || "";
    if (errMsg.includes("503") || errMsg.includes("overloaded")) {
        return NextResponse.json({ 
            error: "현재 이용자가 많아 AI가 잠시 바빠요 😵‍💫\n30초 뒤에 다시 시도해 주세요!" 
        }, { status: 503 });
    }

    return NextResponse.json({ 
        error: "분석 중 문제가 발생했습니다. 다시 시도해 주세요." 
    }, { status: 500 });
  }
}