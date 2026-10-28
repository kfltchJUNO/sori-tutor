// app/api/admin/pronunciation-helper/route.ts
// 관리자가 문장 입력 시 국립국어원 표준발음법 기반 소리 표기 & 초급용 쉬운 규칙 공식 자동 분석

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAdmin } from "@/lib/adminAuth";

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "분석할 문장(text)을 입력하세요." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
당신은 한국어 교육 및 표준 발음법 전문가입니다. 초급 외국인 유학생(동국대/단국대 한국어 1급 수준)을 위한 발음 지도 자료를 작성합니다.
다음 한국어 문장을 분석하여 초급 학습자가 직관적으로 이해할 수 있는 발음 표기와 쉬운 규칙 공식을 JSON으로 출력하세요.

[분석할 문장]: "${text.trim()}"

[작성 규칙]:
1. pronunciation: 국립국어원 표준 발음법에 따른 소리나는 대로의 발음. 반드시 [ ... ] 대괄호 포함.
   - 예: "작년에 한국에 왔어요" -> "[장년에 한구게 와써요]"
   - 예: "단국대학교에서 한국어를 배워요" -> "[단국때학꾜에서 한구거를 배워요]"
   - 예: "친구들과 같이 가요" -> "[친구들과 가치 가요]"

2. rule_formula: 초급 외국인 학습자를 위한 "쉬운 소리 변화 공식".
   *중요*: "비음화", "유음화", "경음화", "조음위치" 등 어려운 언어학적 한자어나 복잡한 문법 용어는 초급 학생들에게 어렵습니다.
   대신 '받침 + 자음/모음 = [변화소리]' 공식 형태로 직관적이고 친절하게 표기하세요.
   - 예: "작[ㄱ] + 년[ㄴ] = [ㅇ] (장년) / 한국[ㄱ] + 에[ㅇ] = [한구게] (연음)"
   - 예: "국[ㄱ] + 대[ㄷ] = [때] (된소리)"
   - 예: "같[ㅌ] + 이[ㅇ] = [치] (가치)"
   - 특별한 음운 변동이 없다면: "받침 그대로 소리나요"

3. meaning_ko: 문장의 친절한 한국어 뜻/해설 1문장.
   - 예: "단국대학교에서 한국어를 배웁니다."

출력은 반드시 마크다운 코드블록(\`\`\`json) 없이 순수한 JSON 단일 객체만 반환하세요:
{
  "pronunciation": "[...]",
  "rule_formula": "...",
  "meaning_ko": "..."
}
`;

    let responseText = "";
    let lastError: any = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        if (responseText) break;
      } catch (err) {
        lastError = err;
        console.warn(`[pronunciation-helper] ${modelName} failed, trying next model:`, err);
      }
    }

    if (!responseText) {
      throw lastError || new Error("Gemini 응답 생성 실패");
    }

    // JSON 파싱
    const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      pronunciation: parsed.pronunciation || `[${text.trim()}]`,
      rule_formula: parsed.rule_formula || "",
      meaning_ko: parsed.meaning_ko || "",
    });
  } catch (e: any) {
    console.error("[pronunciation-helper] Error:", e);
    return NextResponse.json({ error: e.message || "발음 분석 실패" }, { status: 500 });
  }
}
