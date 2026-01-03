import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc } from "firebase/firestore";

const modelCandidates = [
  "gemini-2.0-flash-lite", // 1순위: 최신 가성비
  "gemini-2.5-flash",      // 2순위: 최신 고성능
  "gemini-2.0-flash",      // 3순위: 안정형 (fallback)
];

export async function POST(req: Request) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });

    const cacheRef = doc(db, "grammar_cache", text.trim());
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) return NextResponse.json({ explanation: cacheSnap.data().explanation });

    const genAI = new GoogleGenerativeAI(apiKey);
    let explanation = "";
    
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(`
          당신은 한국어 교육 전문가입니다.
          문장: "${text}"
          
          [분석]
          1. 발음 규칙 (소리나는 대로 표기 필수)
          2. 핵심 문법 및 뉘앙스
          3. 친절한 해요체 사용
          4. 300자 이내 요약
        `);
        explanation = result.response.text();
        if (explanation) break;
      } catch (e: any) {
        if (e.message.includes("API key not valid")) throw new Error("Invalid API Key");
        console.warn(`${modelName} failed, trying next...`);
      }
    }

    if (!explanation) throw new Error("All models failed");

    await setDoc(cacheRef, { explanation, createdAt: new Date().toISOString() });
    return NextResponse.json({ explanation });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}