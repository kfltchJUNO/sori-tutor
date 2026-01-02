import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// 🔥 [최종] 2.5 Flash-Lite (가성비) -> 2.5 Flash (안정성) -> 2.5 Pro (고성능)
// 이미지에 등재된 정확한 모델명을 사용했습니다.
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

        const prompt = `
          Role: Friendly & encouraging Korean tutor.
          Task: Analyze pronunciation. Target: "${targetText}". Context: "${context}".
          Tone: Polite, casual (해요체). Be kind and praise effort.
          Output JSON: { "score": number(0-100), "feedback": "Warm advice in Korean(max 15 words)" }
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