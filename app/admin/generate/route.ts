// app/api/admin/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Step별 난이도 설명 (STEP Korean 커리큘럼과 연동)
const STEP_CONTEXT: Record<number, string> = {
  1: "TOPIK 입문. 한글 자모·기초 인사·숫자·교실 물건·가족·기초 동작 수준.",
  2: "TOPIK I 1급. 자기소개·학교·음식 주문·쇼핑·교통 수준.",
  3: "TOPIK I 2급. 가족관계·취미·여행·날씨·건강 수준.",
  4: "TOPIK II 3급 진입. 일상습관·직업·요리·감정·계획 수준.",
  5: "TOPIK II 3급 완성. 사회생활·미디어·환경·경제·문화 수준.",
  6: "TOPIK II 4급. 뉴스·교육·건강의학·직업진로·사회문제 수준.",
  7: "TOPIK II 5급. 학술논문·경제산업·철학윤리·과학기술·역사문화 수준.",
  8: "TOPIK II 6급. 정치제도·미래사회·실전 모의고사 수준.",
};

const GRAMMAR_BY_STEP_UNIT: Record<string, string> = {
  "2-2": "-았/었어요 (과거), N에 가다/오다",
  "2-3": "-고 싶다 (희망), -지만 (역접)",
  "3-4": "-아/어서 (이유), -(으)ㄹ 것 같다 (추측)",
  "4-2": "간접인용 4유형 (-다고/-냐고/-자고/-라고 하다)",
  "5-1": "피동 (-이/히/리/기), -게 하다 (사동)",
};

function buildPrompt(type: string, step: number, unit: number, category: string, count: number, grammarHint?: string): string {
  const stepCtx = STEP_CONTEXT[step] ?? "";
  const grammarKey = `${step}-${unit}`;
  const grammar = grammarHint ?? GRAMMAR_BY_STEP_UNIT[grammarKey] ?? "없음";

  const base = `
당신은 STEP Korean 교재(Step 1~8, TOPIK I~II 대응) 전문 편집자입니다.
[Step ${step} 난이도]: ${stepCtx}
[Unit ${unit} 핵심 문법]: ${grammar}
[카테고리]: ${category}

절대 규칙:
- 반드시 JSON 배열만 출력, 설명 없음
- 학습자 수준에 맞는 어휘/문법만 사용
- 문법 힌트를 활용한 자연스러운 예문 생성
`;

  if (type === "word") {
    return base + `
단어 ${count}개 생성. 형식:
[{"text":"단어","pronunciation":"[발음기호]","tip":"발음 규칙 또는 사용 팁 1줄 (해당 Step 문법 활용)"}]`;
  }

  if (type === "sentence") {
    return base + `
예문 ${count}개 생성. 핵심 문법을 포함해야 합니다. 형식:
[{"text":"한국어 문장","pronunciation":"[발음표기]","translation":"영어 번역"}]`;
  }

  if (type === "dialogue") {
    return base + `
2인 대화 ${count}개 생성. A는 학습자, B는 원어민. 4~6줄, 핵심 문법 포함. 형식:
[{"title":"대화 제목","script":"A: ...|B: ...|A: ...","translation":"A: ...|B: ...|A: ..."}]`;
  }

  throw new Error("지원하지 않는 type");
}

export async function POST(req: NextRequest) {
  // 관리자 검증
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { type, step, unit, category, count = 5, grammarHint } = body;

    if (!["word", "sentence", "dialogue"].includes(type)) {
      return NextResponse.json({ error: "잘못된 type" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildPrompt(type, step, unit, category, count, grammarHint);
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const items: any[] = JSON.parse(text);

    // sori_drafts에 각 항목 저장
    const batch = adminDb.batch();
    const draftIds: string[] = [];

    for (const content of items) {
      const ref = adminDb.collection("sori_drafts").doc();
      draftIds.push(ref.id);
      batch.set(ref, {
        type,
        status: "pending",
        step: step ?? null,
        unit: unit ?? null,
        category,
        content,
        original_content: { ...content },
        generated_at: FieldValue.serverTimestamp(),
        approved_at: null,
        source: "ai_generated",
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, count: items.length, draftIds });
  } catch (e: any) {
    console.error("Generate error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}