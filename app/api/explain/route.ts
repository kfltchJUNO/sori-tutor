// app/api/explain/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const modelCandidates = [
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });

    const cleanText = text.trim();
    const cacheRef = adminDb.collection("grammar_cache").doc(cleanText);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      return NextResponse.json({ explanation: cacheSnap.data()?.explanation });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let explanation = "";

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(`
          당신은 한국어 교육 전문가입니다.
          문장: "${cleanText}"
          
          [분석]
          1. 발음 규칙 (소리나는 대로 표기 필수)
          2. 핵심 문법 및 뉘앙스
          3. 친절한 해요체 사용
          4. 300자 이내 요약
        `);
        explanation = result.response.text();
        if (explanation) break;
      } catch (e: any) {
        if (e.message?.includes("API key not valid")) throw new Error("Invalid API Key");
        console.warn(`${modelName} failed, trying next...`);
      }
    }

    if (!explanation) throw new Error("All models failed");

    await cacheRef.set({ explanation, createdAt: new Date().toISOString() });
    return NextResponse.json({ explanation });

  } catch (error: any) {
    console.error("Explain route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}