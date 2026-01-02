import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 1. API 키 로드 (Vercel 환경변수 이름 확인)
const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// 2. Google AI 클라이언트 초기화
const genAI = new GoogleGenerativeAI(apiKey!);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string;

    // 키 확인 로그
    console.log("Analyze 요청 시작");
    console.log("- Key 존재 여부:", apiKey ? "있음" : "없음");

    if (!apiKey) {
      return NextResponse.json({ error: "API Key가 설정되지 않았습니다." }, { status: 500 });
    }

    if (!audioFile) {
      return NextResponse.json({ error: "오디오 파일이 없습니다." }, { status: 400 });
    }

    // 오디오 변환
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const base64Audio = buffer.toString("base64");

    // 🔥 [수정됨] 확실하게 작동하는 모델명으로 고정
    // 2.5는 아직 API로 접근 불가능하여 Key Error를 유발합니다.
    const modelName = "gemini-1.5-flash"; 

    console.log(`Trying model: ${modelName}...`);
    
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      Role: Strict Korean Pronunciation Coach.
      
      Your Task is to evaluate the user's audio against the target text: "${targetText}".
      Context: "${context}".

      🚨 **STEP 1: CONTENT VERIFICATION**
      - Listen to what the user actually said.
      - IF the user said something completely different from "${targetText}":
        -> SCORE: 10
        -> FEEDBACK: "다른 문장을 말씀하신 것 같아요. 다시 확인해보세요!"
        -> Output JSON and STOP.

      🚨 **STEP 2: PRONUNCIATION ANALYSIS**
      - Analyze pitch, speed, and intonation.
      - Grading Scale: 0-100.

      Output JSON ONLY: { "score": number, "feedback": "Korean text(polite '해요' style)" }
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "audio/webm", data: base64Audio } }
    ]);

    const responseText = result.response.text();
    console.log("Gemini Response:", responseText);

    // JSON 정제
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    const finalResult = JSON.parse(cleanJson);

    return NextResponse.json(finalResult);

  } catch (error: any) {
    console.error("🔥 Analysis Error:", error);
    
    // 에러 원인을 명확히 전달
    return NextResponse.json({ 
        error: "AI 분석 실패", 
        details: error.message 
    }, { status: 500 });
  }
}