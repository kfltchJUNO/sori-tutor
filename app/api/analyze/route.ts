import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// 🔥 모델: 성능 좋은 2.5 시리즈 유지
const modelCandidates = [
  "gemini-2.5-flash-lite", 
  "gemini-2.5-flash", 
  "gemini-2.5-pro"
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const targetText = formData.get("targetText") as string;
    const context = formData.get("context") as string;

    if (!audioFile) return NextResponse.json({ error: "No audio" });

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const base64Audio = buffer.toString("base64");

    let finalResult = null;
    let errorLog = "";

    for (const modelName of modelCandidates) {
      try {
        console.log(`Trying model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });

        // 🔥 [프롬프트 대폭 강화] 내용 확인 절차 추가
        const prompt = `
          Role: Strict Korean Pronunciation Coach.
          
          Your Task is to evaluate the user's audio against the target text: "${targetText}".
          Context: "${context}".

          🚨 **STEP 1: CONTENT VERIFICATION (Most Important)**
          - First, listen to what the user actually said.
          - IF the user said something completely different from "${targetText}" (e.g., different words, missed key parts):
            -> **SCORE MUST BE 10-20.**
            -> **FEEDBACK MUST BE:** "다른 문장을 말씀하신 것 같아요. 제대로 보고 읽은 게 맞는지 확인해보세요!"
            -> STOP HERE. Do not praise pronunciation if the content is wrong.

          🚨 **STEP 2: PRONUNCIATION ANALYSIS (Only if content matches)**
          - If content is correct, analyze pitch, speed, and intonation.
          - Grading Scale:
            * 95-100: Perfect Native level.
            * 90-94: Natural, but tiny flaws.
            * 80-89: Understandable, foreigner accent.
            * 70-79: Awkward intonation or pronunciation errors.
            * Below 70: Hard to understand.

          Output JSON ONLY: { "score": number, "feedback": "Korean text(max 20 words, polite '해요' style)" }
        `;

        const result = await model.generateContent([
          prompt,
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);

        const responseText = result.response.text();
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        finalResult = JSON.parse(cleanJson);
        
        break; 

      } catch (e: any) {
        console.error(`Model ${modelName} failed:`, e.message);
        errorLog += `[${modelName} failed] `;
      }
    }

    if (!finalResult) {
      throw new Error(`All models failed. Details: ${errorLog}`);
    }

    return NextResponse.json(finalResult);

  } catch (error) {
    console.error("Final Error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again later." });
  }
}