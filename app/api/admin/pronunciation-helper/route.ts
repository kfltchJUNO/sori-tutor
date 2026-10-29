// app/api/admin/pronunciation-helper/route.ts
// 관리자가 텍스트(단어/문장/대화) 입력 시 발음 표기, 쉬운 발음 규칙 공식, 의미, 팁 자동 생성

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAdmin } from "@/lib/adminAuth";

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",  // 1순위: 15 RPM / 500 RPD
  "gemini-3.1-flash-lite",  // 2순위: 15 RPM / 500 RPD
  "gemini-3.8-flash",       // 3순위: 5 RPM / 20 RPD
];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { text, type = "sentence" } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "분석할 내용(text)을 입력하세요." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    let prompt = "";
    if (type === "word") {
      prompt = `
당신은 한국어 교육 및 표준 발음법 전문가입니다. 초급 외국인 유학생을 위한 단어 발음 지도 자료를 작성합니다.
다음 한국어 단어를 분석하여 JSON으로 출력하세요.

[단어]: "${text.trim()}"

[작성 규칙]:
1. pronunciation: 국립국어원 표준 발음법에 따른 소리 표기. [ ... ] 대괄호 포함 (예: "[한구거]", "[막따]").
2. tip: 초급 학습자를 위한 쉬운 발음 규칙 팁 1문장. 어려운 전문 용어 없이 공식 위주 (예: "받침 [ㄱ] 뒤에 모음이 오면 다음 글자로 넘어가요: 국[ㄱ] + 어[ㅇ] = [거]").
3. meaning_ko: 단어의 친절한 뜻 풀이 1문장.
4. category: 단어와 가장 잘 어울리는 카테고리 (예: "인사", "음식", "학교", "가족", "일상").

JSON 형식만 반환하세요:
{
  "pronunciation": "[...]",
  "tip": "...",
  "meaning_ko": "...",
  "category": "..."
}
`;
    } else if (type === "dialogue") {
      prompt = `
당신은 한국어 회화 교육 전문가입니다. 초급 외국인 유학생을 위한 자연스러운 2인 롤플레잉 담화(대화)를 작성합니다.
다음 주제/상황을 바탕으로 4~6줄의 A·B 대화 스크립트를 작성하여 JSON으로 출력하세요.

[상황/주제]: "${text.trim()}"

[작성 규칙]:
1. title: 상황에 맞는 자연스러운 대화 제목 (예: "${text.trim()}").
2. script: A와 B가 번갈아 말하는 대화. 각 대사는 파이프(|)로 구분. A는 학습자 역할, B는 원어민/상대방 역할.
   형식 예시: "A: 안녕하세요. 메뉴판 좀 주시겠어요?|B: 네, 여기 있습니다. 무엇으로 드릴까요?|A: 비빔밥 하나 주세요.|B: 네, 곧 준비해 드리겠습니다."
3. translation: script와 대응하는 영어 번역 또는 쉬운 한국어 풀이 (파이프(|)로 구분).
4. category: 대화와 어울리는 카테고리 (예: "식당/주문", "쇼핑", "공항/교통", "자기소개").

JSON 형식만 반환하세요:
{
  "title": "...",
  "script": "A: ...|B: ...|A: ...|B: ...",
  "translation": "A: ...|B: ...|A: ...|B: ...",
  "category": "..."
}
`;
    } else {
      // sentence (동국대, 단국대, 일반 문장 공통)
      prompt = `
당신은 한국어 교육 및 표준 발음법 전문가입니다. 초급 외국인 학습자(TOPIK 1~2급 수준)를 위한 발음 학습 자료를 작성합니다.
다음 한국어 문장을 분석하여 표준 발음과 초급용 쉬운 규칙 공식을 JSON으로 출력하세요.

[분석할 문장]: "${text.trim()}"

[작성 규칙]:
1. pronunciation: 국립국어원 표준 발음법에 따른 소리나는 대로의 발음. 반드시 [ ... ] 대괄호 포함 (예: "[장년에 한구게 와써요]").
2. rule_formula: 초급 외국인 학습자를 위한 "쉬운 소리 변화 공식".
   *주의*: "비음화", "유음화", "경음화", "구개음화" 등 어려운 전문 용어를 쓰지 마세요.
   받침과 다음 글자의 소리 변화를 '받침 + 자음/모음 = [변화소리]' 공식 위주로 직관적으로 표기하세요.
   (예: "작[ㄱ] + 년[ㄴ] = [ㅇ] (장년) / 한국[ㄱ] + 에[ㅇ] = [한구게] (연음)")
   특별한 규칙 변동이 없다면: "받침 그대로 소리나요"
3. tip: 발음 연습 시 주의할 점이나 도움 팁 1줄.
4. meaning_ko: 문장의 자연스러운 한국어 의미/설명 1문장.
5. category: 어울리는 카테고리 (예: "일상", "자기소개", "학교", "여행").

JSON 형식만 반환하세요:
{
  "pronunciation": "[...]",
  "rule_formula": "...",
  "tip": "...",
  "meaning_ko": "...",
  "category": "..."
}
`;
    }

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
        console.warn(`[pronunciation-helper] ${modelName} failed, trying next:`, err);
      }
    }

    if (!responseText) {
      throw lastError || new Error("Gemini 응답 생성 실패");
    }

    const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

    return NextResponse.json({
      success: true,
      ...parsed,
      pronunciation: parsed.pronunciation || `[${text.trim()}]`,
    });
  } catch (e: any) {
    console.error("[pronunciation-helper] Error:", e);
    return NextResponse.json({ error: e.message || "AI 분석 실패" }, { status: 500 });
  }
}
