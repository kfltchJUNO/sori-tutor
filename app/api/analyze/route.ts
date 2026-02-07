import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 🔥 [설정] 시도할 모델 목록 (우선순위 순서대로)
const MODEL_CANDIDATES = [
  "gemini-2.0-flash",
  "gemini-2.5-flash", 
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash" 
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string; 
    const userNick = formData.get("userNick") as string || "학습자";

    // 1. 필수 데이터 확인
    if (!audioFile || !targetText) {
      return NextResponse.json({ error: "오디오 또는 목표 문장이 없습니다." }, { status: 400 });
    }

    // 2. API 키 확인
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY; 
    if (!apiKey) {
      console.error("❌ [Server] API Key 없음");
      throw new Error("API Key missing");
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);

    // 3. 오디오 변환
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");

    const prompt = `
      당신은 한국어 발음 교정 전문가입니다. 
      
      [할 일]
      1. 사용자의 오디오를 듣고, 목표 텍스트("${targetText}")와 비교하세요.
      2. 발음이 부정확하거나 뭉개지면 점수를 깎으세요.
      3. **반드시 아래 JSON 형식으로만 응답하세요.** 잡담 금지.

      {
        "score": 0~100 사이 숫자,
        "recognized": "들린 대로 받아적기 (예: 아녕하세요)",
        "correct": "정답 발음 (예: 안녕하세요)",
        "explanation": "${userNick}님, (피드백 내용)",
        "advice": "(조언 한마디)"
      }
    `;

    // 4. 🔥 [핵심] 모델 순차 시도 (Fallback) 로직
    let result = null;
    let finalError = null;
    let usedModelName = "";

    for (const modelName of MODEL_CANDIDATES) {
      try {
        console.log(`🤖 모델 시도 중: ${modelName}...`);
        
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        });

        // 생성 요청
        const response = await model.generateContent([
          prompt,
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);
        
        result = response;
        usedModelName = modelName;
        console.log(`✅ 성공! 사용된 모델: ${modelName}`);
        break; // 성공하면 루프 탈출

      } catch (error: any) {
        console.warn(`⚠️ 모델 실패 (${modelName}): ${error.message?.substring(0, 100)}...`);
        finalError = error;
        continue; // 실패하면 다음 모델 시도
      }
    }

    // 모든 모델이 실패했을 경우
    if (!result) {
      console.error("❌ 모든 모델 시도 실패");
      throw finalError || new Error("All models failed");
    }

    const responseText = result.response.text();
    console.log(`📝 [AI 응답 (${usedModelName})]:`, responseText);

    // 5. JSON 파싱 (안전장치)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("❌ JSON 파싱 실패:", responseText);
      return NextResponse.json({
        score: 0,
        recognized: "분석 실패",
        correct: targetText,
        explanation: "AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.",
        advice: "서버 연결이 불안정할 수 있습니다."
      });
    }

    const analysisData = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysisData);

  } catch (error: any) {
    console.error("🔥 [Server Error Detail]:", error);
    
    const errMsg = error.message || "";
    if (errMsg.includes("503") || errMsg.includes("overloaded")) {
        return NextResponse.json({ error: "AI 서버 혼잡. 잠시 후 시도해주세요." }, { status: 503 });
    }

    return NextResponse.json({ 
        error: `서버 오류 발생: ${errMsg.substring(0, 50)}...` 
    }, { status: 500 });
  }
}