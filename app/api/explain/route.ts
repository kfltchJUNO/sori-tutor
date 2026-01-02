import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// 🔥 "무료 버전" 느낌으로 쓸 수 있는 가장 싼 모델 (2.5 Flash) 적용
const modelCandidates = [
  "gemini-2.5-flash", // 1순위: 초경량/초저가
  "gemini-2.5-flash-lite",    // 2순위
];

export async function POST(req: Request) {
  try {
    const { text, type } = await req.json();

    // 1. [서버 캐싱]
    const cacheRef = doc(db, "grammar_cache", text.trim());
    const cacheSnap = await getDoc(cacheRef);

    if (cacheSnap.exists()) {
      return NextResponse.json({ explanation: cacheSnap.data().explanation });
    }

    // 2. [이어달리기] AI 호출
    let explanation = "";
    let errorLog = "";
    
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Explain Korean pronunciation rule for "${text}". Simple English(max 100 chars).`;
        
        const result = await model.generateContent(prompt);
        explanation = result.response.text();
        break; 
      } catch (e: any) {
        console.error(`${modelName} failed, trying next...`);
        errorLog += `[${modelName} failed] `;
      }
    }

    if (!explanation) throw new Error(`All models failed. ${errorLog}`);

    // 3. 결과 저장
    await setDoc(cacheRef, { explanation });

    return NextResponse.json({ explanation });

  } catch (error) {
    return NextResponse.json({ error: "Explanation failed" });
  }
}