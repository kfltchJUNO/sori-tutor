// lib/geminiKeyPool.ts
// Gemini API 키 로테이션 헬퍼
// GOOGLE_API_KEYS에 여러 개의 무료 키를 쉼표(,)로 등록하면 순환(라운드로빈) 호출하여
// 분당 요청 한도(RPM)를 15 * N으로 확장합니다.
// 키가 1개이거나 비어있으면 기존 GOOGLE_API_KEY 하나로 단독 작동합니다.

let currentKeyIndex = 0;

export function getGeminiKeyList(): string[] {
  const multi = process.env.GOOGLE_API_KEYS
    ? process.env.GOOGLE_API_KEYS.split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 10 && !k.startsWith("#"))
    : [];

  if (multi.length > 0) return multi;

  const fallback =
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    "";

  return fallback ? [fallback.trim()] : [];
}

export function getNextGeminiApiKey(): string {
  const list = getGeminiKeyList();
  if (list.length === 0) return "";
  const key = list[currentKeyIndex % list.length];
  currentKeyIndex = (currentKeyIndex + 1) % list.length;
  return key;
}
