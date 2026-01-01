// app/api/analyze/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 🔥 gemini-2.5-flash 사용 (이전 스크린샷 기반)
const MODELS_TO_TRY = ["gemini-2.5-flash"];

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY_FREE || process.env.GEMINI_API_KEY_PAID;
    if (!apiKey) throw new Error("API 키 설정 필요");

    const genAI = new GoogleGenerativeAI(apiKey);
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const type = formData.get("type") as string || "sentence"; 
    const context = formData.get("context") as string || "";

    if (!audioFile) return NextResponse.json({ error: "No audio" }, { status: 400 });

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    // 🎭 페르소나 수정: '연기 선생님' 제거 -> '엄격한 회화 코치'
    let prompt = "";
    if (type === "dialogue") {
      prompt = `
        역할: 한국어 회화 코치 (Korean Conversation Coach).
        상황: ${context}
        대사: "${targetText}"
        
        평가 기준:
        1. 자연스러움: 한국인처럼 자연스러운 흐름인가? (로봇 같은 억양은 감점)
        2. 감정 표현: 상황에 어울리는 말투인가? (예: 사과할 때는 미안한 말투)
        3. 정확성: 발음이 정확한가?

        출력 형식 (JSON):
        {
          "transcription": "들린 소리",
          "score": "점수(0~100)",
          "feedback": "피드백은 2줄 이내. **로봇처럼 딱딱하면 '🤖 억양이 너무 딱딱해요. 감정을 넣어보세요.'라고 조언할 것.** 그 외엔 자연스럽게 조언."
        }
      `;
    } else {
      prompt = `
        역할: 친절한 한국어 선생님.
        문장: "${targetText}"
        평가: 냉정하게 채점하되, 설명은 초등학생도 이해하게 쉽고 친절하게(2줄 이내).
        출력 형식 (JSON):
        {
          "transcription": "들린 소리",
          "score": "점수(0~100)",
          "feedback": "피드백 내용"
        }
      `;
    }

    let finalResult = null;
    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          prompt,
          { inlineData: { mimeType: "audio/webm", data: base64Audio } },
        ]);
        finalResult = result.response.text();
        break; 
      } catch (e: any) { 
        console.error(`❌ ${modelName} 실패:`, e.message);
        lastError = e;
      }
    }

    if (!finalResult) {
       if (lastError?.message?.includes("429")) return NextResponse.json({ error: "이용량 많음 (429)" }, { status: 429 });
       throw new Error("분석 실패");
    }

    const cleanedText = finalResult.replace(/```json|```/g, "").trim();
    return NextResponse.json(JSON.parse(cleanedText));

  } catch (error: any) {
    console.error("서버 오류:", error);
    return NextResponse.json({ error: "서버 오류", details: error.message }, { status: 500 });
  }
}