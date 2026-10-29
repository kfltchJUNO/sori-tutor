import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_CANDIDATES: string[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];

const SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ══════════════════════════════════════════════════════════════
// 한글 자모 분리 / 합성
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

function composeChar(cho: string, jung: string, jong: string = ""): string {
  const cIdx = CHO.indexOf(cho);
  const vIdx = JUNG.indexOf(jung);
  const jIdx = JONG.indexOf(jong);
  if (cIdx < 0 || vIdx < 0 || jIdx < 0) return "";
  return String.fromCharCode(0xAC00 + cIdx * 588 + vIdx * 28 + jIdx);
}

// ══════════════════════════════════════════════════════════════
// 한국어 표준 발음 변환기 (연음·비음화·유음화·경음화·구개음화·ㅎ축약)
// — 학습자가 표준 발음대로 읽었을 때(예: "학꾜에 가요", "장년에 한구게 와써요")
//   정답으로 인정하되, 잘못된 발음("하교에가여")은 엄격히 잡아내기 위함
// ══════════════════════════════════════════════════════════════
const REP_CODA: Record<string, string> = {
  "ㄱ": "ㄱ", "ㄲ": "ㄱ", "ㅋ": "ㄱ", "ㄳ": "ㄱ", "ㄺ": "ㄱ",
  "ㄴ": "ㄴ", "ㄵ": "ㄴ", "ㄶ": "ㄴ",
  "ㄷ": "ㄷ", "ㅅ": "ㄷ", "ㅆ": "ㄷ", "ㅈ": "ㄷ", "ㅊ": "ㄷ", "ㅌ": "ㄷ", "ㅎ": "ㄷ",
  "ㄹ": "ㄹ", "ㄼ": "ㄹ", "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㅀ": "ㄹ",
  "ㅁ": "ㅁ", "ㄻ": "ㅁ",
  "ㅂ": "ㅂ", "ㅍ": "ㅂ", "ㅄ": "ㅂ", "ㄿ": "ㅂ",
  "ㅇ": "ㅇ",
};

const LIAISON_MAP: Record<string, { remainJong: string; nextCho: string }> = {
  "ㄱ": { remainJong: "", nextCho: "ㄱ" },
  "ㄲ": { remainJong: "", nextCho: "ㄲ" },
  "ㅋ": { remainJong: "", nextCho: "ㅋ" },
  "ㄳ": { remainJong: "ㄱ", nextCho: "ㅆ" },
  "ㄴ": { remainJong: "", nextCho: "ㄴ" },
  "ㄵ": { remainJong: "ㄴ", nextCho: "ㅈ" },
  "ㄶ": { remainJong: "", nextCho: "ㄴ" },
  "ㄷ": { remainJong: "", nextCho: "ㄷ" },
  "ㅅ": { remainJong: "", nextCho: "ㅅ" },
  "ㅆ": { remainJong: "", nextCho: "ㅆ" },
  "ㅈ": { remainJong: "", nextCho: "ㅈ" },
  "ㅊ": { remainJong: "", nextCho: "ㅊ" },
  "ㅌ": { remainJong: "", nextCho: "ㅌ" },
  "ㄹ": { remainJong: "", nextCho: "ㄹ" },
  "ㄺ": { remainJong: "ㄹ", nextCho: "ㄱ" },
  "ㄻ": { remainJong: "ㄹ", nextCho: "ㅁ" },
  "ㄼ": { remainJong: "ㄹ", nextCho: "ㅂ" },
  "ㅀ": { remainJong: "", nextCho: "ㄹ" },
  "ㅁ": { remainJong: "", nextCho: "ㅁ" },
  "ㅂ": { remainJong: "", nextCho: "ㅂ" },
  "ㅍ": { remainJong: "", nextCho: "ㅍ" },
  "ㅄ": { remainJong: "ㅂ", nextCho: "ㅆ" },
  "ㅎ": { remainJong: "", nextCho: "ㅇ" },
};

const TENSE_MAP: Record<string, string> = {
  "ㄱ": "ㄲ", "ㄷ": "ㄸ", "ㅂ": "ㅃ", "ㅅ": "ㅆ", "ㅈ": "ㅉ",
};

const ASPIRATED_MAP: Record<string, string> = {
  "ㄱ": "ㅋ", "ㄷ": "ㅌ", "ㅂ": "ㅍ", "ㅈ": "ㅊ",
};

function toStandardPronunciation(text: string): string {
  const clean = text.replace(/[^가-힣]/g, "");
  const jamos = Array.from(clean).map(c => decomposeChar(c)!).filter(Boolean);

  for (let i = 0; i < jamos.length - 1; i++) {
    const cur = jamos[i];
    const nxt = jamos[i + 1];
    if (!cur.jong) continue;

    // 1. 구개음화: ㄷ/ㅌ + 이/여 -> 지/치
    if ((cur.jong === "ㄷ" || cur.jong === "ㅌ") && (nxt.cho === "ㅇ") && (nxt.jung === "ㅣ" || nxt.jung === "ㅕ")) {
      nxt.cho = cur.jong === "ㄷ" ? "ㅈ" : "ㅊ";
      cur.jong = "";
      continue;
    }

    // 2. 연음: 받침(ㅇ 제외) + 초성 ㅇ
    if (nxt.cho === "ㅇ" && cur.jong !== "ㅇ" && LIAISON_MAP[cur.jong]) {
      const l = LIAISON_MAP[cur.jong];
      if (l.nextCho !== "ㅇ") {
        nxt.cho = l.nextCho;
        cur.jong = l.remainJong;
      } else {
        cur.jong = "";
      }
      continue;
    }

    // 3. ㅎ 축약 (받침 ㅎ/ㄶ/ㅀ + ㄱ/ㄷ/ㅂ/ㅈ 또는 받침 ㄱ/ㄷ/ㅂ/ㅈ + 초성 ㅎ)
    if ((cur.jong === "ㅎ" || cur.jong === "ㄶ" || cur.jong === "ㅀ") && ASPIRATED_MAP[nxt.cho]) {
      nxt.cho = ASPIRATED_MAP[nxt.cho];
      cur.jong = cur.jong === "ㄶ" ? "ㄴ" : cur.jong === "ㅀ" ? "ㄹ" : "";
      continue;
    }
    if (nxt.cho === "ㅎ" && ASPIRATED_MAP[REP_CODA[cur.jong] ?? ""]) {
      nxt.cho = ASPIRATED_MAP[REP_CODA[cur.jong]];
      cur.jong = "";
      continue;
    }

    const rep = REP_CODA[cur.jong] ?? cur.jong;

    // 4. 유음화: ㄴ+ㄹ 또는 ㄹ+ㄴ -> ㄹ+ㄹ
    if ((rep === "ㄴ" && nxt.cho === "ㄹ") || (rep === "ㄹ" && nxt.cho === "ㄴ")) {
      cur.jong = "ㄹ";
      nxt.cho = "ㄹ";
      continue;
    }

    // 5. 비음화: ㄱ/ㄷ/ㅂ + ㄴ/ㅁ/ㄹ
    if (nxt.cho === "ㄴ" || nxt.cho === "ㅁ" || nxt.cho === "ㄹ") {
      if (nxt.cho === "ㄹ" && (rep === "ㄱ" || rep === "ㄷ" || rep === "ㅂ" || rep === "ㅁ" || rep === "ㅇ")) {
        nxt.cho = "ㄴ";
      }
      if (rep === "ㄱ") cur.jong = "ㅇ";
      else if (rep === "ㄷ") cur.jong = "ㄴ";
      else if (rep === "ㅂ") cur.jong = "ㅁ";
      continue;
    }

    // 6. 경음화: 대표음 ㄱ/ㄷ/ㅂ + ㄱ/ㄷ/ㅂ/ㅅ/ㅈ
    if ((rep === "ㄱ" || rep === "ㄷ" || rep === "ㅂ") && TENSE_MAP[nxt.cho]) {
      cur.jong = rep;
      nxt.cho = TENSE_MAP[nxt.cho];
      continue;
    }

    cur.jong = rep;
  }

  // 마지막 음절 끝소리 규칙
  if (jamos.length > 0) {
    const last = jamos[jamos.length - 1];
    if (last.jong) last.jong = REP_CODA[last.jong] ?? last.jong;
  }

  return jamos.map(j => composeChar(j.cho, j.jung, j.jong)).join("");
}

// ══════════════════════════════════════════════════════════════
// 유사 모음 그룹 (ㅐ/ㅔ 등 한국인도 구분 안 하는 모음은 허용하되,
// ㅛ↔ㅕ, ㅏ↔ㅓ, ㅗ↔ㅜ 등 명백한 모음 오류는 엄격 감점)
// ══════════════════════════════════════════════════════════════
function isEquivalentVowel(v1: string, v2: string): boolean {
  if (v1 === v2) return true;
  const eqGroups = [
    new Set(["ㅐ", "ㅔ"]),
    new Set(["ㅒ", "ㅖ"]),
    new Set(["ㅙ", "ㅚ", "ㅞ"]),
  ];
  return eqGroups.some(g => g.has(v1) && g.has(v2));
}

// ══════════════════════════════════════════════════════════════
// 단일 음절 유사도 계산 (0.0 ~ 1.0)
// — 핵심 수정: 둘 다 받침이 없는 열린 음절(예: '요' vs '여')에서
//   '빈 받침 일치'로 공짜 점수를 주던 기존 버그 완전 제거!
// ══════════════════════════════════════════════════════════════
function singleSyllableSimilarity(rc: string, tc: string): number {
  if (rc === tc) return 1.0;
  const rj = decomposeChar(rc);
  const tj = decomposeChar(tc);
  if (!rj || !tj) return rc === tc ? 1.0 : 0.0;

  const hasCodaInTargetOrRec = tj.jong !== "" || rj.jong !== "";

  let totalW = 1.0 + 1.5 + (hasCodaInTargetOrRec ? 2.5 : 0);
  let matchW = 0;

  // 1. 초성 (1.0)
  if (rj.cho === tj.cho) {
    matchW += 1.0;
  } else if (
    TENSE_MAP[rj.cho] === tj.cho || TENSE_MAP[tj.cho] === rj.cho ||
    ASPIRATED_MAP[rj.cho] === tj.cho || ASPIRATED_MAP[tj.cho] === rj.cho
  ) {
    matchW += 0.35; // 평음/경음/격음 혼동
  }

  // 2. 중성/모음 (1.5)
  if (isEquivalentVowel(rj.jung, tj.jung)) {
    matchW += 1.5;
  } else {
    // 모음이 틀리면(예: 요->여, 아->어) 중성 점수 0점!
    matchW += 0;
  }

  // 3. 종성/받침 (받침이 존재하는 경우에만 2.5 가중치)
  if (hasCodaInTargetOrRec) {
    const rRep = REP_CODA[rj.jong] ?? rj.jong;
    const tRep = REP_CODA[tj.jong] ?? tj.jong;
    if (rj.jong === tj.jong || (rRep !== "" && rRep === tRep)) {
      matchW += 2.5;
    } else if (rj.jong !== "" && tj.jong !== "") {
      // 받침은 있으나 다른 받침으로 발음
      matchW += 0.5;
    }
    // 받침 완전 누락(학->하) 또는 없는 받침 추가(하->학)는 종성 점수 0점!
  }

  return totalW > 0 ? matchW / totalW : 0;
}

// ══════════════════════════════════════════════════════════════
// 음절 단위 DP 정렬 + 정밀 오류 분석 + 엄격 알고리즘 점수 산출
// ══════════════════════════════════════════════════════════════
interface SyllableMatch {
  char: string;
  recognizedChar?: string;
  status: "match" | "coda_error" | "vowel_error" | "mismatch" | "omitted";
  tip?: string;
}

interface EvaluationMetrics {
  syllableResults: SyllableMatch[];
  weightedSim: number;
  algoScore: number;
  hardCeiling: number;
  codaErrors: number;
  vowelErrors: number;
  mismatches: number;
  omittedCount: number;
  extraCount: number;
  errorSummary: string[];
}

function evaluatePronunciation(
  recognized: string,
  targetText: string,
  targetPronunciationHint?: string
): EvaluationMetrics {
  const rChars = Array.from(recognized.replace(/[^가-힣]/g, ""));
  const tOrigChars = Array.from(targetText.replace(/[^가-힣]/g, ""));
  const tStdStr = toStandardPronunciation(targetText);
  const tStdChars = Array.from(tStdStr);
  const tHintChars = targetPronunciationHint
    ? Array.from(targetPronunciationHint.replace(/[^가-힣]/g, ""))
    : [];

  const n = tOrigChars.length;
  const m = rChars.length;

  if (n === 0 || m === 0) {
    return {
      syllableResults: [],
      weightedSim: 0,
      algoScore: 0,
      hardCeiling: 0,
      codaErrors: 0,
      vowelErrors: 0,
      mismatches: n,
      omittedCount: n,
      extraCount: m,
      errorSummary: ["발음이 인식되지 않았습니다."],
    };
  }

  // 목표 i번째 음절과 인식된 j번째 음절의 최대 유사도 (표기 / 표준발음 / DB발음가이드 중 최대)
  const pairSim = (tIdx: number, rIdx: number): { sim: number; refChar: string } => {
    const rc = rChars[rIdx];
    const candidates = [tOrigChars[tIdx]];
    if (tStdChars[tIdx]) candidates.push(tStdChars[tIdx]);
    if (tHintChars.length === n && tHintChars[tIdx]) candidates.push(tHintChars[tIdx]);

    let bestSim = -1;
    let bestRef = tOrigChars[tIdx];
    for (const cand of candidates) {
      const s = singleSyllableSimilarity(rc, cand);
      if (s > bestSim) {
        bestSim = s;
        bestRef = cand;
      }
    }
    return { sim: bestSim, refChar: bestRef };
  };

  // DP 정렬 (Needleman-Wunsch 변형)
  const GAP_PENALTY = -0.35;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const ptr: ("M" | "D" | "I")[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill("M"));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = i * GAP_PENALTY;
    ptr[i][0] = "D"; // target 음절 누락
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = j * GAP_PENALTY;
    ptr[0][j] = "I"; // 불필요한 음절 추가
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const { sim } = pairSim(i - 1, j - 1);
      const matchScore = dp[i - 1][j - 1] + sim;
      const deleteScore = dp[i - 1][j] + GAP_PENALTY;
      const insertScore = dp[i][j - 1] + GAP_PENALTY;

      if (matchScore >= deleteScore && matchScore >= insertScore) {
        dp[i][j] = matchScore;
        ptr[i][j] = "M";
      } else if (deleteScore >= insertScore) {
        dp[i][j] = deleteScore;
        ptr[i][j] = "D";
      } else {
        dp[i][j] = insertScore;
        ptr[i][j] = "I";
      }
    }
  }

  // 역추적으로 target 각 음절에 매칭된 recognized 음절 찾기
  const alignedRec: (number | null)[] = Array(n).fill(null);
  let extraCount = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ptr[i][j] === "M") {
      alignedRec[i - 1] = j - 1;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || ptr[i][j] === "D")) {
      alignedRec[i - 1] = null;
      i--;
    } else {
      extraCount++;
      j--;
    }
  }

  // 음절별 상세 판정 및 오류 집계
  let simSum = 0;
  let codaErrors = 0;
  let vowelErrors = 0;
  let mismatches = 0;
  let omittedCount = 0;
  const errorSummary: string[] = [];
  const cleanCoreMatches: SyllableMatch[] = [];

  for (let tIdx = 0; tIdx < n; tIdx++) {
    const origChar = tOrigChars[tIdx];
    const rIdx = alignedRec[tIdx];

    if (rIdx === null) {
      omittedCount++;
      errorSummary.push(`'${origChar}' 발음 누락`);
      cleanCoreMatches.push({
        char: origChar,
        status: "omitted",
        tip: `'${origChar}' 소리가 들리지 않고 누락되었습니다.`,
      });
      continue;
    }

    const rc = rChars[rIdx];
    const { sim, refChar } = pairSim(tIdx, rIdx);
    simSum += sim;

    if (sim >= 0.99) {
      cleanCoreMatches.push({
        char: origChar,
        recognizedChar: rc,
        status: "match",
      });
      continue;
    }

    const rj = decomposeChar(rc);
    const tj = decomposeChar(refChar);

    if (!rj || !tj) {
      mismatches++;
      cleanCoreMatches.push({ char: origChar, recognizedChar: rc, status: "mismatch" });
      continue;
    }

    const choSame = rj.cho === tj.cho;
    const jungSame = isEquivalentVowel(rj.jung, tj.jung);
    const rRepJong = REP_CODA[rj.jong] ?? rj.jong;
    const tRepJong = REP_CODA[tj.jong] ?? tj.jong;
    const jongSame = rj.jong === tj.jong || (rRepJong !== "" && rRepJong === tRepJong);

    // 1. 받침 오류 (초성·모음은 맞으나 받침 누락/오류 — 예: '학' -> '하')
    if (choSame && jungSame && !jongSame) {
      codaErrors++;
      const tip = tj.jong
        ? (rj.jong
            ? `'${origChar}'에서 [${rj.jong}] 대신 [${tj.jong}] 받침으로 발음하세요.`
            : `'${origChar}'를 '${rc}'로 발음하여 [${tj.jong}] 받침이 빠졌습니다.`)
        : `'${origChar}'에 불필요한 [${rj.jong}] 받침이 들어갔습니다.`;
      errorSummary.push(`'${origChar}'→'${rc}' (받침 오류)`);
      cleanCoreMatches.push({ char: origChar, recognizedChar: rc, status: "coda_error", tip });
    }
    // 2. 모음 오류 (초성은 맞으나 모음이 틀림 — 예: '요' -> '여')
    else if (choSame && !jungSame) {
      vowelErrors++;
      if (!jongSame) codaErrors++;
      const tip = `'${origChar}'를 '${rc}'로 발음했습니다. [${rj.jung}]가 아니라 [${tj.jung}] 모음으로 정확히 발음하세요.`;
      errorSummary.push(`'${origChar}'→'${rc}' (모음 [${tj.jung}]→[${rj.jung}] 오류)`);
      cleanCoreMatches.push({ char: origChar, recognizedChar: rc, status: "vowel_error", tip });
    }
    // 3. 그 외 자음/전체 불일치
    else {
      mismatches++;
      const tip = `'${origChar}'(발음 [${refChar}])가 '${rc}'로 다르게 인식되었습니다.`;
      errorSummary.push(`'${origChar}'→'${rc}' (발음 불일치)`);
      cleanCoreMatches.push({ char: origChar, recognizedChar: rc, status: "mismatch", tip });
    }
  }

  // 공백·문장부호를 포함한 전체 targetText에 매핑
  let corePtr = 0;
  const fullSyllableResults: SyllableMatch[] = Array.from(targetText.trim()).map(ch => {
    if (!/[가-힣]/.test(ch)) {
      return { char: ch, status: "match" as const };
    }
    const item = cleanCoreMatches[corePtr];
    corePtr++;
    return item ?? { char: ch, status: "omitted" as const };
  });

  const weightedSim = Math.max(0, Math.min(1, (simSum - extraCount * 0.25) / n));

  // ── 엄격한 점수 계산 (오류 개수별 직접 감점 + 상한선) ──
  // 1. 기본 점수 (완벽 시 90점 만점 기준)
  let rawScore = Math.round(weightedSim * 90);

  // 2. 오류 유형별 직접 감점 (짧은 문장일수록 음절 1개 오류의 비중이 큼)
  const lengthScale = n <= 4 ? 1.25 : n <= 7 ? 1.1 : 1.0;
  const deduction =
    (codaErrors * 16 +
     vowelErrors * 14 +
     mismatches * 20 +
     omittedCount * 22 +
     extraCount * 10) * lengthScale;

  let algoScore = Math.round(rawScore - deduction * 0.55);

  // 3. 오류 개수 및 비율에 따른 엄격한 상한선(Hard Ceiling)
  const totalErrorSyllables = codaErrors + vowelErrors + mismatches + omittedCount;
  const errorRatio = totalErrorSyllables / n;

  let hardCeiling = 92;
  if (weightedSim < 0.35 || errorRatio >= 0.75) {
    hardCeiling = 15; // 거의 다른 말을 했거나 대부분 틀린 경우
  } else if (errorRatio >= 0.5) {
    hardCeiling = 35; // 절반 이상 음절에 오류가 있는 경우
  } else if (totalErrorSyllables >= 2 && n <= 6) {
    // 예: "학교에 가요"(5음절)를 "하교에가여"(2음절 오류: 받침누락 + 모음오류)로 말한 경우!
    hardCeiling = 45;
  } else if (codaErrors >= 1) {
    // 받침 누락/오류가 1개라도 있으면 최대 64점 (양호 상한 제한)
    hardCeiling = Math.min(hardCeiling, 64);
  } else if (vowelErrors >= 1 || mismatches >= 1 || omittedCount >= 1) {
    // 모음/자음 오류가 1개라도 있으면 최대 68점
    hardCeiling = Math.min(hardCeiling, 68);
  }

  algoScore = Math.max(0, Math.min(algoScore, hardCeiling));

  return {
    syllableResults: fullSyllableResults,
    weightedSim,
    algoScore,
    hardCeiling,
    codaErrors,
    vowelErrors,
    mismatches,
    omittedCount,
    extraCount,
    errorSummary,
  };
}

// ══════════════════════════════════════════════════════════════
// 연음(liaison) 실패 감지 (오디오 길이 기반 보조 지표)
// ══════════════════════════════════════════════════════════════
function detectLiaisonFailure(
  targetText: string,
  audioSizeBytes: number
): { suspected: boolean; penalty: number } {
  const liaisonPattern = /[가-힣][이에아오우의외위애에]/g;
  const liaisonCount = (targetText.match(liaisonPattern) ?? []).length;

  if (liaisonCount === 0) return { suspected: false, penalty: 0 };

  const syllableCount = (targetText.match(/[가-힣]/g) ?? []).length;
  const bytesPerSyllable = syllableCount > 0 ? audioSizeBytes / syllableCount : 0;

  const suspected = bytesPerSyllable > 7500 && liaisonCount > 0;
  const penalty   = suspected ? 12 : 0;

  return { suspected, penalty };
}

// ══════════════════════════════════════════════════════════════
// Gemini 릴레이 호출 (temperature 조절 지원)
// ══════════════════════════════════════════════════════════════
async function callGemini(
  genAI: GoogleGenerativeAI,
  prompt: string,
  base64Audio?: string,
  temperature: number = 0.1,
): Promise<string> {
  let lastError: unknown;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: SAFETY,
        generationConfig: { temperature },
      });
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
// 1단계: 100% 블라인드 STT (목표 문장 절대 제공 금지!)
// — 기존 버그: 프롬프트에 targetText를 넣어서 침묵이거나 어눌한 발음("하교에가여")일 때
//   AI가 targetText("학교에 가요")를 컨닝하여 그대로 출력하던 문제를 원천 차단
// ══════════════════════════════════════════════════════════════
async function runBlindSTT(
  genAI: GoogleGenerativeAI,
  base64Audio: string,
): Promise<string> {
  const prompt = `당신은 한국어 발음 평가용 '음성 소리 그대로 받아쓰기(Phonetic STT)' 엔진입니다.

[가장 중요한 절대 규칙]
1. 오직 오디오에서 실제로 들리는 소리(음절)만 100% 있는 그대로 한글로 적으세요.
2. 문맥 보정·맞춤법 교정·단어 추측을 절대 하지 마세요! 사전에 없는 어색한 소리라도 들리는 대로 적어야 합니다.
   - 예: "하교에가여"라고 들리면 절대 "학교에 가요"로 고치지 말고 무조건 "하교에가여"로 적으세요.
   - 예: "자년에"라고 들리면 절대 "작년에"로 고치지 말고 "자년에"로 적으세요.
   - 예: "머거여", "가여", "해여"처럼 모음이 어색하게 들리면 들린 모음 그대로 적으세요.
   - 예: 받침이 약하거나 안 들리면 받침을 빼고 들린 그대로 적으세요.
3. 오디오에 명확한 사람의 한국어 말소리가 없거나, 침묵·숨소리·한숨·기침·마이크 터치음·배경 잡음만 있으면 추측하지 말고 무조건 정확히 "(침묵)"이라고만 출력하세요.

출력 형식: 오직 받아쓴 한글 텍스트(또는 "(침묵)") 한 줄만 출력하세요. 따옴표나 부가 설명 절대 금지.`;

  const raw = await callGemini(genAI, prompt, base64Audio, 0.0);
  return raw.replace(/^["'`]|["'`]$/g, "").trim();
}

// ══════════════════════════════════════════════════════════════
// 2단계: 오디오 + 음절 분석 기반 정밀 피드백 및 채점
// ══════════════════════════════════════════════════════════════
interface ScoringResult {
  score: number;
  correct: string;
  explanation: string;
  advice: string;
  errorTypes: string[];
  ruleFormula?: string;
}

async function runScoring(
  genAI: GoogleGenerativeAI,
  recognized: string,
  targetText: string,
  context: string,
  userNick: string,
  metrics: EvaluationMetrics,
): Promise<ScoringResult> {
  const minAllowed = Math.max(0, metrics.algoScore - 6);
  const maxAllowed = Math.min(metrics.algoScore + 4, metrics.hardCeiling, 92);

  const errorListText = metrics.errorSummary.length > 0
    ? metrics.errorSummary.join(", ")
    : "음절 단위 특이 오류 없음 (억양 및 자연스러움 평가)";

  const prompt = `당신은 엄격하고 정확한 한국어 발음 교정 전문가입니다.
블라인드 STT 결과와 음절 정밀 분석 결과를 바탕으로 채점 및 피드백을 작성하세요.

[목표 문장]: "${targetText}" (표준 발음: [${toStandardPronunciation(targetText)}])
[실제 들린 발음 (블라인드 STT)]: "${recognized}"
[감지된 음절 오류]: ${errorListText}
[알고리즘 기준 점수]: ${metrics.algoScore}점 (허용 채점 범위: ${minAllowed}점 ~ ${maxAllowed}점, 상한선: ${metrics.hardCeiling}점)
[상황 맥락]: ${context || "일반 발음 연습"}

[엄격한 채점 규칙]
1. 감지된 음절 오류(받침 누락, 모음 오류, 자음 불일치)가 있다면 절대 높은 점수를 주지 마세요.
   - 예: "학교에 가요"를 "하교에가여"로 발음한 경우 '학'의 [ㄱ] 받침 누락과 '요'→'여' 모음 오류가 모두 있으므로 반드시 두 오류를 모두 구체적으로 지적하고 ${maxAllowed}점 이하로 채점하세요.
2. 점수는 반드시 ${minAllowed}~${maxAllowed} 사이의 정수로만 부여하세요.

[초급 1급 눈높이 맞춤 발음 규칙 지침 - 필수]
- 비음화, 유음화, 연음, 구개음화 같은 어려운 문법 학술 용어는 '절대' 사용 금지!
- 'correct': 반드시 소리 나는 대로의 발음 표기(예: '[학꾜에 가요]', '[장년에 한구게 와써요]')로 적기.
- 'ruleFormula': '? 받침 + ? = [??]' 형태의 직관적인 변화 공식만 적기 (예: 'ㄱ 받침 + ㄱ = [ㄲ]', 'ㄱ 받침 + ㄴ = [ㅇ]', 변화 없으면 '소리 나는 대로 또렷하게 발음').
- 'explanation': ${userNick}님이 어떤 글자에서 받침을 빼먹었는지, 어떤 모음을 다르게 발음했는지 쉬운 구어체로 콕 집어 설명.

JSON만 출력하세요. 다른 텍스트 절대 금지.
{
  "score": ${metrics.algoScore},
  "correct": "[소리 나는 대로 발음 표기]",
  "ruleFormula": "? 받침 + ? = [??]",
  "explanation": "${userNick}님, (구체적 오류 지적 또는 잘한 점)",
  "advice": "(입 모양·혀 위치·받침 발음 등 실용적 조언)",
  "errorTypes": ["받침 누락", "모음 오류"]
}`;

  const raw = await callGemini(genAI, prompt, undefined, 0.2);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("채점 JSON 파싱 실패");

  const data = JSON.parse(match[0]) as {
    score?: number;
    correct?: string;
    explanation?: string;
    advice?: string;
    errorTypes?: string[];
    ruleFormula?: string;
  };

  if (typeof data.score === "number" && data.score === 0) {
    return {
      score: 0,
      correct: data.correct ?? `[${toStandardPronunciation(targetText)}]`,
      explanation: data.explanation ?? `${userNick}님, 목소리가 감지되지 않았어요. 마이크에 대고 또렷하게 말씀해 주세요.`,
      advice: data.advice ?? "마이크 가까이에서 다시 한번 녹음해 보세요.",
      errorTypes: ["침묵"],
      ruleFormula: data.ruleFormula,
    };
  }

  const clampedScore = Math.max(
    minAllowed,
    Math.min(maxAllowed, data.score ?? metrics.algoScore, metrics.hardCeiling)
  );

  return {
    score:       clampedScore,
    correct:     data.correct     ?? `[${toStandardPronunciation(targetText)}]`,
    explanation: data.explanation ?? "",
    advice:      data.advice      ?? "",
    errorTypes:  data.errorTypes  ?? [],
    ruleFormula: data.ruleFormula ?? undefined,
  };
}

// ══════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════
export async function POST(req: Request): Promise<Response> {
  try {
    const formData            = await req.formData();
    const audioFile           = formData.get("audio")               as Blob | null;
    const targetText          = formData.get("targetText")          as string | null;
    const targetPronunciation = (formData.get("targetPronunciation") as string | null) ?? "";
    const speechFramesRaw     = formData.get("speechFrames")        as string | null;
    const context             = (formData.get("context")            as string | null) ?? "";
    const userNick            = (formData.get("userNick")           as string | null) ?? "학습자";

    if (!audioFile || !targetText) {
      return NextResponse.json({ error: "오디오 또는 목표 문장이 없습니다." }, { status: 400 });
    }

    // 1차 침묵 차단: 오디오 파일 크기가 너무 작거나 클라이언트 마이크 에너지 프레임이 4 미만일 때
    const speechFrames = speechFramesRaw !== null ? Number(speechFramesRaw) : null;
    if (audioFile.size < 2000 || (speechFrames !== null && !Number.isNaN(speechFrames) && speechFrames < 4)) {
      return NextResponse.json({
        score: 0,
        recognized: "(침묵)",
        correct: targetPronunciation || `[${toStandardPronunciation(targetText)}]`,
        explanation: `${userNick}님, 아무 말소리도 감지되지 않았어요. 마이크에 가까이 대고 소리 내어 읽어보세요!`,
        advice: "녹음 버튼을 누른 뒤 문장을 처음부터 끝까지 또렷하게 발음해 주세요.",
      });
    }

    const apiKey = process.env.GOOGLE_API_KEY
      ?? process.env.GOOGLE_TTS_API_KEY
      ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const genAI       = new GoogleGenerativeAI(apiKey);
    const base64Audio = Buffer.from(await audioFile.arrayBuffer()).toString("base64");

    // ── 1단계: 100% 블라인드 STT (targetText 미제공) ────────────
    let recognized: string;
    try {
      recognized = await runBlindSTT(genAI, base64Audio);
    } catch (e) {
      console.error("STT 실패:", e);
      return NextResponse.json({
        score: 0, recognized: "(인식 실패)", correct: targetText,
        explanation: "음성 인식에 실패했습니다. 다시 시도해주세요.",
        advice: "조용한 환경에서 마이크에 가까이 대고 말해보세요.",
      });
    }

    console.log(`🎤 Blind STT: "${recognized}" / 목표: "${targetText}"`);

    const r = recognized.trim();
    const rHangulOnly = r.replace(/[^가-힣]/g, "");
    const tHangulOnly = targetText.replace(/[^가-힣]/g, "");

    // 2차 침묵·잡음·비한국어 차단
    if (
      !r ||
      rHangulOnly.length === 0 ||
      /(침묵|잡음|인식\s*불가|소음|무음|숨소리|기침)/.test(r) ||
      /^[.…\s음어아으흠하후헤히]+$/.test(r)
    ) {
      return NextResponse.json({
        score: 0,
        recognized: "(침묵)",
        correct: targetPronunciation || `[${toStandardPronunciation(targetText)}]`,
        explanation: `${userNick}님, 발음이 인식되지 않았습니다. 마이크를 확인하고 또렷하게 말해보세요.`,
        advice: "먼저 스피커 버튼으로 정답 발음을 들어보고 따라 말해보세요.",
      });
    }

    // 환각 차단 (목표 문장보다 3배 이상 긴 경우)
    if (rHangulOnly.length > Math.max(tHangulOnly.length * 3, 15)) {
      return NextResponse.json({
        score: 0,
        recognized: "(잡음)",
        correct: targetPronunciation || `[${toStandardPronunciation(targetText)}]`,
        explanation: `${userNick}님, 주변 소음이 섞여 음성이 정확히 인식되지 않았어요.`,
        advice: "조용한 환경에서 마이크에 가까이 대고 목표 문장만 또렷하게 말해보세요.",
      });
    }

    // ── 음절 정밀 정렬 및 엄격 알고리즘 평가 ────────────────────
    const metrics = evaluatePronunciation(r, targetText, targetPronunciation);
    console.log(
      `📊 정밀분석: 유사도=${Math.round(metrics.weightedSim * 100)}%, 알고리즘점수=${metrics.algoScore}, 상한=${metrics.hardCeiling}, 받침오류=${metrics.codaErrors}, 모음오류=${metrics.vowelErrors}, 불일치=${metrics.mismatches}, 누락=${metrics.omittedCount}`
    );

    // 너무 짧게 말했거나 전혀 다른 말을 한 경우 조기 저점 처리
    if (rHangulOnly.length < tHangulOnly.length * 0.25) {
      return NextResponse.json({
        score: Math.min(10, metrics.algoScore),
        recognized,
        correct: targetPronunciation || `[${toStandardPronunciation(targetText)}]`,
        explanation: `${userNick}님, 말소리가 너무 짧게 인식되었습니다("${recognized}"). 문장 전체를 끝까지 말해보세요.`,
        advice: "문장을 처음부터 끝까지 완전하게 발음해보세요.",
        syllableResults: metrics.syllableResults,
      });
    }

    // ── 연음 실패 감지 ──────────────────────────────────────────
    const { suspected: liaisonFail, penalty: liaisonPenalty } =
      detectLiaisonFailure(targetText, audioFile.size);

    // ── 2단계: AI 피드백 및 채점 ─────────
    let scored: ScoringResult;
    try {
      scored = await runScoring(genAI, recognized, targetText, context, userNick, metrics);
    } catch (e) {
      console.error("채점 실패:", e);
      const fallback = Math.max(0, Math.min(metrics.algoScore - liaisonPenalty, metrics.hardCeiling));
      return NextResponse.json({
        score: fallback,
        recognized,
        correct: targetPronunciation || `[${toStandardPronunciation(targetText)}]`,
        explanation: metrics.errorSummary.length > 0
          ? `${userNick}님, ${metrics.errorSummary.join(", ")} 부분이 아쉽습니다. 다시 한번 연습해 보세요!`
          : `${userNick}님, 전반적으로 잘 읽으셨어요!`,
        advice: "틀린 글자의 받침과 모음을 의식하며 천천히 또렷하게 발음해 보세요.",
        syllableResults: metrics.syllableResults,
      });
    }

    // AI가 오디오를 듣고 침묵(0점)으로 판정한 경우 즉시 0점 반환
    if (scored.score === 0) {
      return NextResponse.json({
        score: 0,
        recognized: "(침묵)",
        correct: scored.correct,
        explanation: scored.explanation,
        advice: scored.advice,
      });
    }

    // ── 최종 점수 보정 ──────────────────────────────────────────
    let finalScore = scored.score - liaisonPenalty;
    finalScore = Math.max(0, Math.min(finalScore, metrics.hardCeiling, 92));
    finalScore = Math.round(finalScore);

    let finalExplanation = scored.explanation;
    if (liaisonFail && !finalExplanation.includes("이어")) {
      finalExplanation += " 또한 글자와 글자 사이를 끊지 말고 부드럽게 이어서 읽어보세요.";
    }

    console.log(`✅ 최종: ${finalScore}점 (인식="${recognized}", 목표="${targetText}")`);

    return NextResponse.json({
      score:           finalScore,
      recognized,
      correct:         scored.correct,
      explanation:     finalExplanation,
      advice:          scored.advice,
      syllableResults: metrics.syllableResults,
      ruleFormula:     scored.ruleFormula,
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
