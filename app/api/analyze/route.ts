import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 1. 🔥 [핵심 수정] API 키를 찾는 범위를 넓혀서 "키 없음" 오류 원천 차단
// 사용자가 Vercel에 어떤 이름으로 등록했든(GEMINI_API_KEY, GOOGLE_API_KEY 등) 하나만 걸리면 작동합니다.
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// 2. 🔥 [모델 전략] 요청하신 순서대로 설정 (Fail-over System)
const modelCandidates = [
  "gemini-2.5-flash",       // 1순위: 성능과 속도 밸런스가 가장 좋은 최신 모델
  "gemini-2.5-flash-lite",  // 2순위: 1순위 실패 시 가성비 좋은 모델로 전환
  "gemini-1.5-flash"        // 3순위: 혹시 모를 베타 오류를 대비한 최후의 안정적인 모델
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string;

    // 디버깅 로그: 실제 어떤 키가 로드되었는지 확인 (값은 보안상 일부만 출력하거나 숨김)
    console.log("Analyze 요청 시작");
    console.log(`- API Key 상태: ${apiKey ? "✅ 로드됨" : "❌ 없음 (Vercel 환경변수 확인 필요)"}`);

    if (!apiKey) {
      return NextResponse.json({ 
        error: "API Key Missing", 
        details: "Vercel 환경변수에 GEMINI_API_KEY 또는 GOOGLE_API_KEY가 등록되지 않았습니다." 
      }, { status: 500 });
    }

    if (!audioFile) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    // Google AI 클라이언트 초기화
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 오디오 버퍼 변환
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const base64Audio = buffer.toString("base64");

    let finalResult = null;
    let errorLog = "";

    // 🔥 [핵심 로직] 모델 순차 시도
    for (const modelName of modelCandidates) {
      try {
        console.log(`Trying model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `
          Role: Strict Korean Pronunciation Coach.
          Target: "${targetText}"
          Context: "${context}"
          
          STEP 1: Check content (Most Important).
          - Listen carefully. Did the user say "${targetText}"?
          - If the user said different words or missed key parts:
            -> Set SCORE to 10.
            -> Set FEEDBACK to "다른 문장을 말씀하신 것 같아요. 문장을 다시 확인하고 읽어주세요!".
            -> Output JSON immediately.

          STEP 2: Analyze Pronunciation (Only if content matches).
          - Evaluate pitch, speed, and intonation naturally.
          - Score scale: 0 to 100.
          - Feedback: Keep it polite (해요-che), specific to the error.

          Output JSON ONLY: { "score": number, "feedback": "string" }
        `;

        const result = await model.generateContent([
          prompt,
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);

        const responseText = result.response.text();
        
        // JSON 파싱 (마크다운 ```json 제거)
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        finalResult = JSON.parse(cleanJson);
        
        console.log(`✅ Success with ${modelName}`);
        break; // 성공하면 루프 종료 (다음 모델 시도 안 함)

      } catch (e: any) {
        console.warn(`⚠️ Model ${modelName} failed:`, e.message);
        errorLog += `[${modelName}: ${e.message}] `;
        // 실패하면 catch에서 에러를 기록하고 다음 모델로 넘어감 (continue)
      }
    }

    // 모든 모델이 실패했을 경우
    if (!finalResult) {
      console.error("All models failed:", errorLog);
      throw new Error(`모든 AI 모델 응답 실패: ${errorLog}`);
    }

    return NextResponse.json(finalResult);

  } catch (error: any) {
    console.error("Final Critical Error:", error);
    return NextResponse.json({ 
      error: "Analysis failed", 
      details: error.message 
    }, { status: 500 });
  }
}