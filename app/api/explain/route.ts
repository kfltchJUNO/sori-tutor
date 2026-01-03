import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// 🔥 [수정됨] 1.5 버전 제외하고 최신 2.0 모델 적용
// 'gemini-2.5'는 존재하지 않는 모델명이므로 'gemini-2.0-flash'로 변경해야 작동합니다.
const modelCandidates = [
  "gemini-2.0-flash", // 1순위: 최신, 고성능, 빠름
  // 만약 2.0-flash-lite가 출시되면 추가 가능, 현재는 2.0-flash가 가장 적합
];

export async function POST(req: Request) {
  try {
    const { text, type } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // 1. [서버 캐싱] 이미 분석한 문장이면 DB에서 가져오기
    // 문서 ID로 사용하기 위해 텍스트를 정리하거나 해싱하는 것이 좋으나, 여기서는 기존 로직 유지 (trim)
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
        
        // 🔥 [프롬프트 개선] 
        // 1. 한국어 학습자를 위해 "한국어"로 설명하도록 변경
        // 2. 발음 규칙뿐만 아니라 문법적 요소도 함께 설명하도록 지시
        const prompt = `
          당신은 한국어 교육 전문가입니다. 아래 텍스트에 대해 외국인 학습자가 이해하기 쉽게 분석해주세요.
          
          [분석 대상 텍스트]
          "${text}"

          [요청 사항]
          1. 이 텍스트에 적용된 **주요 발음 규칙**(연음, 경음화, 비음화 등)이 있다면 설명해주세요.
          2. **문법적 특징**이나 **표현의 뉘앙스**를 간단히 짚어주세요.
          3. 말투는 친절한 선생님처럼 해요체(~해요)를 사용하세요.
          4. 설명은 200자 이내로 핵심만 간결하게 작성하세요.
        `;
        
        const result = await model.generateContent(prompt);
        explanation = result.response.text();
        
        // 성공하면 루프 종료
        if (explanation) break; 

      } catch (e: any) {
        console.error(`${modelName} failed:`, e.message);
        errorLog += `[${modelName} failed] `;
      }
    }

    if (!explanation) {
      throw new Error(`All models failed. ${errorLog}`);
    }

    // 3. 결과 저장 (캐싱)
    // 다음번에 같은 문장을 요청하면 AI를 쓰지 않고 DB에서 바로 반환
    await setDoc(cacheRef, { 
      explanation,
      createdAt: new Date().toISOString() 
    });

    return NextResponse.json({ explanation });

  } catch (error: any) {
    console.error("Explanation Generation Error:", error);
    return NextResponse.json({ error: "Explanation failed", details: error.message }, { status: 500 });
  }
}