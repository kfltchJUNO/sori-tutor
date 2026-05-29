import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_CANDIDATES: string[] = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ══════════════════════════════════════════════════════════════
// 한글 자모 분리
// ══════════════════════════════════════════════════════════════
const CHO  = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

interface Jamo { cho: string; jung: string; jong: string; }

function decomposeChar(char: string): Jamo | null {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return null;
  return {
    cho:  CHO[Math.floor(code / 588)],
    jung: JUNG[Math.floor((code % 588) / 28)],
    jong: JONG[code % 28],
  };
}

function decomposeString(str: string): string {
  return str.split("").map(c => {
    const j = decomposeChar(c);
    return j ? j.cho + j.jung + j.jong : c;
  }).join("");
}

// ══════════════════════════════════════════════════════════════
// 가중치 자모 유사도
// — 종성(받침) 누락/대치는 일반 자모보다 2배 패널티
// — 예: 작년→자년 = ㄱ 종성 누락 → 점수 크게 깎임
// ══════════════════════════════════════════════════════════════
function weightedJamoSimilarity(recognized: string, target: string): number {
  if (!recognized || !target) return 0;

  const rClean = recognized.replace(/\s/g, "");
  const tClean = target.replace(/\s/g, "");

  // 음절 단위 비교 (길이 기준으로 정렬)
  const rChars = Array.from(rClean);
  const tChars = Array.from(tClean);

  let totalWeight = 0;
  let matchWeight = 0;

  const maxLen = Math.max(rChars.length, tChars.length);

  for (let i = 0; i < maxLen; i++) {
    const rc = rChars[i] ?? "";
    const tc = tChars[i] ?? "";

    const rj = decomposeChar(rc);
    const tj = decomposeChar(tc);

    if (!rj || !tj) {
      // 비한글 문자 — 단순 일치 여부
      totalWeight += 1;
      if (rc === tc) matchWeight += 1;
      continue;
    }

    // 초성 비교 (가중치 1.0)
    totalWeight += 1.0;
    if (rj.cho === tj.cho) matchWeight += 1.0;

    // 중성(모음) 비교 (가중치 1.2 — 모음 오류도 중요)
    totalWeight += 1.2;
    if (rj.jung === tj.jung) matchWeight += 1.2;

    // 종성(받침) 비교 (가중치 2.0 — 받침 오류는 큰 패널티)
    totalWeight += 2.0;
    if (rj.jong === tj.jong) matchWeight += 2.0;
    else if (rj.jong === "" && tj.jong !== "") {
      // 받침 완전 누락 → 0점 (이미 위에서 0 부여됨)
    } else if (rj.jong !== "" && tj.jong === "") {
      // 불필요한 받침 추가 → 부분 감점
      matchWeight += 0.3;
    }
  }

  return totalWeight === 0 ? 0 : matchWeight / totalWeight;
}

// ══════════════════════════════════════════════════════════════
// 연음(liaison) 실패 감지
// — "섭리" → "섭/리" 처럼 끊어 읽으면 STT가 보정해버림
// — 오디오 길이 대비 음절 수로 탐지
// ══════════════════════════════════════════════════════════════
function detectLiaisonFailure(
  targetText: string,
  audioSizeBytes: number
): { suspected: boolean; penalty: number } {
  // 연음이 일어나야 하는 패턴: 받침 + 모음 시작 음절
  const liaisonPattern = /[가-힣][이에아오우의외위애에]/g;
  const liaisonCount = (targetText.match(liaisonPattern) ?? []).length;

  if (liaisonCount === 0) return { suspected: false, penalty: 0 };

  // 음절 수
  const syllableCount = (targetText.match(/[가-힣]/g) ?? []).length;

  // 평균 음절당 오디오 크기 (끊어 읽으면 더 커짐 — 묵음/호흡 포함)
  // 자연스러운 발음: 음절당 약 3,000~5,000 bytes
  // 끊어 읽기:       음절당 약 6,000 bytes 이상
  const bytesPerSyllable = syllableCount > 0 ? audioSizeBytes / syllableCount : 0;

  const suspected = bytesPerSyllable > 7000 && liaisonCount > 0;
  const penalty   = suspected ? 15 : 0; // 연음 실패 의심 시 15점 감점

  return { suspected, penalty };
}

// ══════════════════════════════════════════════════════════════
// 점수 구간 → 텍스트 레이블
// ══════════════════════════════════════════════════════════════
function getScoreLabel(score: number): string {
  if (score >= 85) return "거의 완벽해요!";
  if (score >= 70) return "잘하고 있어요!";
  if (score >= 50) return "조금 더 연습해봐요.";
  return "다시 한번 도전해봐요!";
}

// ══════════════════════════════════════════════════════════════
// Gemini 릴레이 호출
// ══════════════════════════════════════════════════════════════
async function callGemini(
  genAI: GoogleGenerativeAI,
  prompt: string,
  base64Audio?: string,
): Promise<string> {
  let lastError: unknown;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY });
      const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [prompt];
      if (base64Audio) parts.push({ inlineData: { mimeType: "audio/webm", data: base64Audio } });
      const res = await model.generateContent(parts);
      console.log(`✅ [${modelName}]`);
      return res.response.text();
    } catch (e: unknown) {
      console.warn(`⚠️ [${modelName}]: ${e instanceof Error ? e.message.substring(0, 60) : String(e)}`);
      lastError = e;
    }
  }
  throw lastError ?? new Error("All models failed");
}

// ══════════════════════════════════════════════════════════════
// 1단계: STT — 들린 그대로 받아쓰기 (보정 절대 금지)
// ══════════════════════════════════════════════════════════════
async function runSTT(
  genAI: GoogleGenerativeAI,
  base64Audio: string,
  targetText: string,
): Promise<string> {
  const prompt = `당신은 한국어 음성 받아쓰기(STT) 전문가입니다.

[절대 규칙]
- 들린 소리를 100% 그대로 한글로 받아 적으세요.
- 목표 텍스트("${targetText}")를 절대 참고하지 마세요.
- 맥락 보정 금지. 불분명하면 불분명하게 들린 그대로 적으세요.
- 말소리 없음 → "(침묵)", 소음만 → "(잡음)"

[초급 오류 절대 보정 금지]
- 받침 누락: "작년"→"자년" 들렸으면 "자년"으로 적기
- 연음 실패: "섭리"를 끊어서 [섭][리]로 들렸으면 "섭 리"로 적기 (띄어쓰기로 표시)
- 경음/격음 혼동: "바다"→"파다" 들렸으면 "파다"로 적기
- 모음 오류: "어머니"→"으머니" 들렸으면 "으머니"로 적기
- ㄹ→ㄴ: "라면"→"나면" 들렸으면 "나면"으로 적기

텍스트만 출력. 설명·따옴표 없이.`;

  const raw = await callGemini(genAI, prompt, base64Audio);
  return raw.replace(/^["']|["']$/g, "").trim();
}

// ══════════════════════════════════════════════════════════════
// 2단계: 오류 분석 및 피드백 생성
// ══════════════════════════════════════════════════════════════
interface ScoringResult {
  score: number;
  correct: string;
  explanation: string;
  advice: string;
  errorTypes: string[];
}

async function runScoring(
  genAI: GoogleGenerativeAI,
  recognized: string,
  targetText: string,
  context: string,
  userNick: string,
  weightedSim: number,
): Promise<ScoringResult> {
  // 가중치 유사도 기반 기준 점수 계산
  // 종성 패널티가 반영된 점수라 기존보다 엄격함
  const simBasedScore = Math.round(weightedSim * 88); // 최대 88점

  const prompt = `당신은 한국어 발음 교정 전문가입니다.

[목표 텍스트]: "${targetText}"
[학습자 발음 (STT)]: "${recognized}"
[가중치 유사도]: ${Math.round(weightedSim * 100)}% (받침 오류에 2배 패널티 적용된 값)
[기준 점수]: ${simBasedScore}점 (이 점수에서 ±10점 범위로만 채점하세요)
[상황 맥락]: ${context || "일반 발음 연습"}

[엄격한 채점 기준]
- 기준 점수 ±10점 범위에서만 채점. 범위 이탈 금지.
- 받침(종성) 누락은 심각한 오류 → 해당 음절 0점 처리
- 연음 실패 (끊어 읽기) → -10~15점
- 완벽해도 최대 90점. 100점·95점 절대 금지.
- recognized와 targetText가 같더라도 연음·억양 오류 가능성 감안해 90점 이하

[오류 유형 감지]
1. 받침 누락: 작→자, 먹→머
2. 받침 대치: 국→굿, 밥→밫
3. 연음 실패: 섭리→섭/리 (STT에서 띄어쓰기로 표시됨)
4. 경음/격음: 바다→파다
5. 모음 혼동: ㅓ↔ㅡ
6. ㄹ 오류: 라→나
7. 이중모음 단모음화: 봐→바
8. 비음 오류: ㅁ↔ㅂ

JSON만 출력. 다른 텍스트 절대 금지.
{
  "score": ${simBasedScore - 10}~${Math.min(simBasedScore + 10, 90)} 범위 정수,
  "correct": "올바른 발음 표기",
  "explanation": "${userNick}님, (구체적 오류 지적. 오류 없으면 잘한 점)",
  "advice": "(혀 위치·입 모양 등 실용적 조언)",
  "errorTypes": ["오류유형1", "오류유형2"]
}`;

  const raw = await callGemini(genAI, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("채점 JSON 파싱 실패");

  const data = JSON.parse(match[0]) as {
    score?: number;
    correct?: string;
    explanation?: string;
    advice?: string;
    errorTypes?: string[];
  };

  // 범위 강제 적용
  const clampedScore = Math.max(
    simBasedScore - 10,
    Math.min(simBasedScore + 10, data.score ?? simBasedScore, 90)
  );

  return {
    score:       clampedScore,
    correct:     data.correct     ?? targetText,
    explanation: data.explanation ?? "",
    advice:      data.advice      ?? "",
    errorTypes:  data.errorTypes  ?? [],
  };
}

// ══════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════
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

    // ── 1단계: STT ─────────────────────────────────────────────
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

    // 침묵·잡음 차단
    if (!r || /^[(\[]?(침묵|잡음|인식\s*불가)[)\]]?$/.test(r) || /^[.…\s음어아으]+$/.test(r)) {
      return NextResponse.json({
        score: 0, recognized, correct: targetText,
        explanation: `${userNick}님, 발음이 인식되지 않았습니다. 마이크를 확인하고 또렷하게 말해보세요.`,
        advice: "먼저 TTS 버튼으로 정답 발음을 들어보고 따라 말해보세요.",
      });
    }

    // 너무 짧음
    if (r.length < targetText.trim().length * 0.2) {
      return NextResponse.json({
        score: 10, recognized, correct: targetText,
        explanation: `${userNick}님, 말소리가 너무 짧게 인식되었습니다. 문장 전체를 말해보세요.`,
        advice: "문장을 처음부터 끝까지 완전하게 발음해보세요.",
      });
    }

    // 환각 (3배 이상)
    if (r.replace(/\s/g, "").length > targetText.replace(/\s/g, "").length * 3) {
      return NextResponse.json({
        score: 20, recognized, correct: targetText,
        explanation: `${userNick}님, 인식 결과가 불안정합니다. 조용한 환경에서 다시 시도해주세요.`,
        advice: "주변 소음을 줄이고 마이크에 가까이 대고 말해보세요.",
      });
    }

    // ── 가중치 자모 유사도 계산 ─────────────────────────────────
    // 공백 제거 후 비교 (연음 실패로 인한 띄어쓰기 무시)
    const weightedSim = weightedJamoSimilarity(
      r.replace(/\s/g, ""),
      targetText.replace(/\s/g, "")
    );
    console.log(`📊 가중치 유사도: ${Math.round(weightedSim * 100)}%`);

    // ── 연음 실패 감지 ──────────────────────────────────────────
    const { suspected: liaisonFail, penalty: liaisonPenalty } =
      detectLiaisonFailure(targetText, audioFile.size);

    if (liaisonFail) {
      console.log(`⚠️ 연음 실패 의심 — ${liaisonPenalty}점 패널티`);
    }

    // ── 2단계: 채점 ────────────────────────────────────────────
    let scored: ScoringResult;
    try {
      scored = await runScoring(genAI, recognized, targetText, context, userNick, weightedSim);
    } catch (e) {
      console.error("채점 실패:", e);
      const fallback = Math.max(0, Math.min(Math.round(weightedSim * 85) - liaisonPenalty, 90));
      return NextResponse.json({
        score: fallback, recognized, correct: targetText,
        explanation: `${userNick}님, AI 채점 서버가 불안정합니다. 자동 채점 결과입니다.`,
        advice: "잠시 후 다시 시도해보세요.",
      });
    }

    // ── 최종 보정 ──────────────────────────────────────────────
    let finalScore = scored.score;

    // 1. 연음 실패 패널티 적용
    finalScore -= liaisonPenalty;

    // 2. 받침 오류 추가 패널티
    //    errorTypes에 받침 관련 오류가 있으면 추가 감점
    const hasCodaError = scored.errorTypes.some(e =>
      e.includes("받침") || e.includes("종성") || e.includes("누락")
    );
    if (hasCodaError && finalScore > 65) {
      finalScore = Math.min(finalScore, 65);
      console.log("🚨 받침 오류 상한 적용: 최대 65점");
    }

    // 3. 최종 범위 클램프
    finalScore = Math.max(0, Math.min(90, Math.round(finalScore)));

    // 4. 연음 실패 피드백 추가
    let finalExplanation = scored.explanation;
    if (liaisonFail && !finalExplanation.includes("연음")) {
      finalExplanation += " 또한 연음이 자연스럽게 이어지지 않았어요.";
    }

    console.log(`✅ 최종: ${finalScore}점 (가중치유사도=${Math.round(weightedSim * 100)}%, 연음패널티=${liaisonPenalty}, 받침오류=${hasCodaError})`);

    return NextResponse.json({
      score:       finalScore,
      recognized,
      correct:     scored.correct,
      explanation: finalExplanation,
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