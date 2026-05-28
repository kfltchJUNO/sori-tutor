import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 고성능 → 효율 → 속도 순 릴레이
const MODEL_CANDIDATES: string[] = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ── 한글 자모 분리 ────────────────────────────────────────────
const CHO  = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function decompose(char: string): string {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return char;
  const cho  = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  return CHO[cho] + JUNG[jung] + (JONG[jong] ?? "");
}

function decomposeString(str: string): string {
  return str.split("").map(decompose).join("");
}

// ── 자모 레벤슈타인 유사도 0~1 ───────────────────────────────
function jamoSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = decomposeString(a.replace(/\s/g, ""));
  const db = decomposeString(b.replace(/\s/g, ""));
  if (da === db) return 1;
  const m = da.length, n = db.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_v, i) =>
    Array.from({ length: n + 1 }, (_w, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = da[i - 1] === db[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

// ── Gemini 호출 헬퍼 ─────────────────────────────────────────
async function callGemini(
  genAI: GoogleGenerativeAI,
  prompt: string,
  base64Audio?: string,
): Promise<string> {
  let lastError: unknown;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY_SETTINGS });
      const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [prompt];
      if (base64Audio) parts.push({ inlineData: { mimeType: "audio/webm", data: base64Audio } });
      const res = await model.generateContent(parts);
      console.log(`✅ [${modelName}] 성공`);
      return res.response.text();
    } catch (e: unknown) {
      console.warn(`⚠️ [${modelName}] 실패: ${e instanceof Error ? e.message.substring(0, 80) : String(e)}`);
      lastError = e;
    }
  }
  throw lastError ?? new Error("All models failed");
}

// ── 1단계: STT ───────────────────────────────────────────────
async function runSTT(
  genAI: GoogleGenerativeAI,
  base64Audio: string,
  targetText: string,
): Promise<string> {
  const prompt = `당신은 한국어 음성 받아쓰기(STT) 전문가입니다.

[절대 규칙]
- 오디오에서 들린 소리를 100% 있는 그대로 한글로 받아 적으세요.
- 맥락을 추측해 보정하지 마세요. 목표 텍스트("${targetText}")를 참고하지 마세요.
- 말이 불분명하면 불분명하게 들린 그대로 적으세요.
- 말소리가 없으면 "(침묵)"을 출력하세요.
- 소음/숨소리만 있으면 "(잡음)"을 출력하세요.

[초급 학습자 오류를 절대 보정하지 마세요]
- 종성 누락: "먹어요" → "머거요"로 들렸으면 "머거요"로 적기
- 경음/격음 혼동: "바다" → "파다"로 들렸으면 "파다"로 적기
- 모음 오류: "어머니" → "으머니"로 들렸으면 "으머니"로 적기
- 연음 실패: 끊어 발음된 그대로 적기
- ㄹ→ㄴ 오류: "라면" → "나면"으로 들렸으면 "나면"으로 적기
- 이중모음 단모음화: "봐" → "바"로 들렸으면 "바"로 적기

오직 들린 텍스트만 출력. 설명·따옴표·기호 없이 텍스트만.`;

  const raw = await callGemini(genAI, prompt, base64Audio);
  return raw.replace(/^["']|["']$/g, "").trim();
}

// ── 2단계: 채점 ──────────────────────────────────────────────
interface ScoringResult {
  score: number;
  correct: string;
  explanation: string;
  advice: string;
}

async function runScoring(
  genAI: GoogleGenerativeAI,
  recognized: string,
  targetText: string,
  context: string,
  userNick: string,
  jamoSim: number,
): Promise<ScoringResult> {
  const prompt = `당신은 한국어 발음 교정 전문가입니다.

[목표 텍스트]: "${targetText}"
[학습자 발음 (STT 결과)]: "${recognized}"
[자모 유사도]: ${Math.round(jamoSim * 100)}%
[상황 맥락]: ${context || "일반 발음 연습"}

[채점 기준]
- 자모 유사도 90% 이상: 85~95점
- 자모 유사도 75~89%: 65~84점
- 자모 유사도 55~74%: 40~64점
- 자모 유사도 55% 미만: 0~39점
- 100점 절대 금지. 최대 95점.

[분석 오류 유형]
1. 종성 누락: 먹→머, 학교→하교
2. 경음화 오류: 바다→파다
3. 모음 혼동: ㅓ↔ㅡ, ㅐ↔ㅔ
4. 연음 실패
5. ㄹ 오류: 라면→나면
6. 이중모음 단모음화: 봐→바
7. 기식음/평음 혼동: ㅂ↔ㅍ
8. 비음 오류: ㅁ↔ㅂ

JSON만 출력. 다른 텍스트 금지.
{"score":정수,"correct":"발음표기","explanation":"${userNick}님, 피드백","advice":"교정 조언"}`;

  const raw = await callGemini(genAI, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("채점 JSON 파싱 실패");
  const data = JSON.parse(match[0]) as {
    score?: number; correct?: string; explanation?: string; advice?: string;
  };
  return {
    score:       Math.max(0, Math.min(95, Math.round(data.score ?? 0))),
    correct:     data.correct     ?? targetText,
    explanation: data.explanation ?? "",
    advice:      data.advice      ?? "",
  };
}

// ── 메인 핸들러 ──────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  try {
    const formData   = await req.formData();
    const audioFile  = formData.get("audio")      as Blob | null;
    const targetText = formData.get("targetText") as string | null;
    const context    = (formData.get("context")   as string | null) ?? "";
    const userNick   = (formData.get("userNick")  as string | null) ?? "학습자";

    if (!audioFile || !targetText) {
      return NextResponse.json({ error: "오디오 또는 목표 문장이 없습니다." }, { status: 400 });
    }

    // 침묵 조기 차단
    if (audioFile.size < 1500) {
      return NextResponse.json({
        score: 0, recognized: "(침묵)", correct: targetText,
        explanation: `${userNick}님, 녹음이 너무 짧거나 소리가 감지되지 않았습니다.`,
        advice: "마이크에 가까이 대고 목표 문장을 또렷하게 말해보세요.",
      });
    }

    const apiKey = process.env.GOOGLE_API_KEY
      ?? process.env.GOOGLE_TTS_API_KEY
      ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const genAI       = new GoogleGenerativeAI(apiKey);
    const base64Audio = Buffer.from(await audioFile.arrayBuffer()).toString("base64");

    // 1단계: STT
    let recognized: string;
    try {
      recognized = await runSTT(genAI, base64Audio, targetText);
    } catch (e) {
      console.error("STT 실패:", e);
      return NextResponse.json({
        score: 0, recognized: "인식 실패", correct: targetText,
        explanation: "음성 인식에 실패했습니다. 다시 시도해주세요.",
        advice: "조용한 환경에서 마이크에 가까이 대고 말해보세요.",
      });
    }

    console.log(`🎤 STT: "${recognized}" / 목표: "${targetText}"`);

    const r = recognized.trim();

    // 침묵·잡음·무의미 차단
    if (!r || /^[([（]?(침묵|잡음|인식\s*불가)[)）\]]?$/.test(r) || /^[.…\s음어아으]+$/.test(r)) {
      return NextResponse.json({
        score: 0, recognized, correct: targetText,
        explanation: `${userNick}님, 발음이 인식되지 않았습니다. 마이크를 확인하고 또렷하게 말해보세요.`,
        advice: "먼저 TTS 버튼으로 정답 발음을 들어보고 따라 말해보세요.",
      });
    }
    if (r.length < targetText.trim().length * 0.2) {
      return NextResponse.json({
        score: 10, recognized, correct: targetText,
        explanation: `${userNick}님, 말소리가 너무 짧게 인식되었습니다. 문장 전체를 말해보세요.`,
        advice: "문장을 처음부터 끝까지 완전하게 발음해보세요.",
      });
    }
    if (r.length > targetText.trim().length * 3) {
      return NextResponse.json({
        score: 20, recognized, correct: targetText,
        explanation: `${userNick}님, 인식 결과가 불안정합니다. 조용한 환경에서 다시 시도해주세요.`,
        advice: "주변 소음을 줄이고 마이크에 가까이 대고 말해보세요.",
      });
    }

    // 자모 유사도 계산
    const jamoSim = jamoSimilarity(recognized, targetText);
    console.log(`📊 자모 유사도: ${Math.round(jamoSim * 100)}%`);

    // 2단계: 채점
    let scored: ScoringResult;
    try {
      scored = await runScoring(genAI, recognized, targetText, context, userNick, jamoSim);
    } catch (e) {
      console.error("채점 실패:", e);
      return NextResponse.json({
        score: Math.min(Math.round(jamoSim * 90), 95),
        recognized, correct: targetText,
        explanation: `${userNick}님, AI 채점 서버가 불안정합니다. 자동 채점 결과입니다.`,
        advice: "잠시 후 다시 시도해보세요.",
      });
    }

    // 과채점 보정: AI 점수와 자모 유사도 차이 30점 이상이면 평균값
    const simScore = Math.round(jamoSim * 90);
    let finalScore = scored.score;
    if (scored.score - simScore > 30) {
      finalScore = Math.round((scored.score + simScore) / 2);
      console.warn(`🚨 과채점 보정: AI=${scored.score} → 최종=${finalScore}`);
    }
    finalScore = Math.max(0, Math.min(95, finalScore));

    return NextResponse.json({
      score:       finalScore,
      recognized,
      correct:     scored.correct,
      explanation: scored.explanation,
      advice:      scored.advice,
    });

  } catch (error: unknown) {
    console.error("🔥 [Analyze Error]:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("503") || msg.includes("overloaded")) {
      return NextResponse.json({ error: "AI 서버 혼잡. 잠시 후 시도해주세요." }, { status: 503 });
    }
    return NextResponse.json({ error: `서버 오류: ${msg.substring(0, 50)}` }, { status: 500 });
  }
}