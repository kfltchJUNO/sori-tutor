// app/api/explain/route.ts (새로 생성)
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY_FREE || ""; 
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { text, type } = await req.json();

    // 무료 모델 사용 (실패해도 부담 없음)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
    
    const prompt = `
      한국어 학습자가 "${text}" 라는 ${type === 'word' ? '단어' : '문장'}을 공부하고 있습니다.
      이 내용에 포함된 핵심 문법이나 발음 규칙을 초급 수준에서 아주 간단히(3줄 이내) 설명해줘.
      전문 용어보다는 예시 위주로 설명해줘.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ explanation: result.response.text() });

  } catch (error) {
    return NextResponse.json({ error: "설명을 불러오지 못했습니다." }, { status: 500 });
  }
}