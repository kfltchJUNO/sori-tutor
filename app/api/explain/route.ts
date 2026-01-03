import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc } from "firebase/firestore";

// 🔥 API Key 로드 우선순위: 서버 환경변수 -> NEXT_PUBLIC 변수
const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(apiKey!);

// 🔥 [사진 기반] 가성비(Lite) -> 고성능(Flash) 순서 배치
// 1.5 버전은 제외하고, 최신 2.x 라인업으로 구성했습니다.
const modelCandidates = [
  "gemini-2.5-flash-lite", // 1순위: 최신 초경량 모델 (가성비 Best)
  "gemini-2.0-flash-lite", // 2순위: 2.0 경량화
  "gemini-2.5-flash",      // 3순위: 2.5 표준
  "gemini-2.0-flash",      // 4순위: 2.0 표준
];

export async function POST(req: Request) {
  try {
    // 0. API 키 유효성 사전 체크
    if (!apiKey) {
      console.error("❌ [Server Error] API Key가 설정되지 않았습니다.");
      return NextResponse.json({ error: "Server Configuration Error: API Key missing" }, { status: 500 });
    }

    const { text, type } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // 1. [서버 캐싱] DB에 이미 분석된 내용이 있다면 AI 호출 없이 반환
    const cacheRef = doc(db, "grammar_cache", text.trim());
    const cacheSnap = await getDoc(cacheRef);

    if (cacheSnap.exists()) {
      return NextResponse.json({ explanation: cacheSnap.data().explanation });
    }

    // 2. [이어달리기] 가성비 모델부터 순차적으로 시도
    let explanation = "";
    let errorLog = "";
    
    for (const modelName of modelCandidates) {
      try {
        // console.log(`🔄 모델 시도 중: ${modelName}...`); 
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = `
          당신은 한국어 교육 전문가입니다. 아래 문장을 외국인 학습자가 이해하기 쉽게 분석해주세요.
          
          [분석 대상 텍스트]
          "${text}"

          [요청 사항]
          1. **발음 규칙**: 이 텍스트를 읽을 때 적용되는 주요 발음 규칙(연음, 경음화, 비음화 등)을 소리나는 대로 표기하고 설명해주세요.
          2. **문법 및 뉘앙스**: 중요한 문법적 특징이나 표현의 뉘앙스를 간단히 짚어주세요.
          3. **말투**: 친절한 한국어 선생님처럼 해요체(~해요)를 사용하세요.
          4. 설명은 300자 이내로 핵심만 간결하게 작성하세요.
        `;
        
        const result = await model.generateContent(prompt);
        explanation = result.response.text();
        
        if (explanation) {
            // 성공 시 루프 종료
            break; 
        }

      } catch (e: any) {
        console.warn(`⚠️ [${modelName}] 실패:`, e.message);
        errorLog += `[${modelName} Error] `;
        
        // 🚨 API 키 자체가 틀린 경우(400 Bad Request)는 재시도해도 소용없으므로 루프 중단
        if (e.message.includes("API key not valid") || e.message.includes("400")) {
             console.error("🚨 치명적 오류: 유효하지 않은 API Key입니다. .env 파일을 확인해주세요.");
             throw new Error("Invalid API Key");
        }
      }
    }

    if (!explanation) {
      throw new Error(`모든 모델이 실패했습니다. (Logs: ${errorLog})`);
    }

    // 3. 결과 저장 (캐싱) 및 반환
    await setDoc(cacheRef, { 
      explanation,
      createdAt: new Date().toISOString() 
    });

    return NextResponse.json({ explanation });

  } catch (error: any) {
    console.error("❌ Final Explanation Error:", error.message);
    return NextResponse.json({ 
        error: "Explanation failed", 
        details: error.message 
    }, { status: 500 });
  }
}