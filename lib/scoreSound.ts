// lib/scoreSound.ts
// Web Audio API 기반 효과음 — 외부 파일 없음, 완전 무료
// 점수대별 6가지 효과음 + 멘트 MP3 순차 재생

// ── 오디오 컨텍스트 싱글톤 ────────────────────────────────
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// ── 기본 음표 재생 헬퍼 ──────────────────────────────────
function playTone(
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType = "sine",
  gainVal = 0.4,
  fadeOut = true
): void {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);
  if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// ── 효과음 정의 ───────────────────────────────────────────

// 90~95점: 3단 팡파레 (도→미→솔→고도 상승)
export function playFanfare(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    playTone(freq, t + i * 0.18, 0.35, "triangle", 0.45);
  });
  // 마지막 화음
  [523, 659, 784].forEach(freq => {
    playTone(freq, t + 0.75, 0.6, "triangle", 0.25);
  });
}

// 75~89점: 별 획득음 (팅팅~ 상승 2타)
export function playStarGet(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  playTone(880, t,       0.25, "sine", 0.35);
  playTone(1047, t + 0.2, 0.3,  "sine", 0.35);
  playTone(1319, t + 0.38, 0.4, "sine", 0.3);
}

// 55~74점: 경쾌한 단타음 (땡!)
export function playGood(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  playTone(660, t,       0.12, "square", 0.25);
  playTone(880, t + 0.1, 0.25, "sine",   0.3);
}

// 30~54점: 부드러운 알림음 (띠링)
export function playNeutral(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  playTone(440, t,       0.2, "sine", 0.3);
  playTone(370, t + 0.2, 0.3, "sine", 0.2);
}

// 0~29점: 낮은 실패음 (부웅)
export function playFail(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.4);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.55);
}

// 침묵(0점): 짧은 틱
export function playSilenceTick(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  playTone(800, t, 0.08, "square", 0.2, true);
}

// ── 점수 → 효과음 매핑 ───────────────────────────────────
export type ScoreTier = "perfect" | "great" | "good" | "okay" | "fail" | "silence";

export function getTier(score: number, isSilence = false): ScoreTier {
  if (isSilence || score === 0) return "silence";
  if (score >= 90) return "perfect";
  if (score >= 75) return "great";
  if (score >= 55) return "good";
  if (score >= 30) return "okay";
  return "fail";
}

export function playEffectByTier(tier: ScoreTier): void {
  switch (tier) {
    case "perfect": playFanfare();     break;
    case "great":   playStarGet();     break;
    case "good":    playGood();        break;
    case "okay":    playNeutral();     break;
    case "fail":    playFail();        break;
    case "silence": playSilenceTick(); break;
  }
}

// ── 효과음 지속 시간 (ms) — 멘트 재생 딜레이용 ───────────
export const EFFECT_DURATION_MS: Record<ScoreTier, number> = {
  perfect: 1200,
  great:   900,
  good:    500,
  okay:    600,
  fail:    600,
  silence: 300,
};

// ── 멘트 MP3 재생 ────────────────────────────────────────
export async function playFeedbackVoice(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve(); // 실패해도 조용히 넘어감
    audio.play().catch(() => resolve());
  });
}

// ── 통합: 효과음 → 딜레이 → 멘트 순차 재생 ─────────────
export async function playScoreFeedback(
  score: number,
  isSilence: boolean,
  voiceUrl: string | null
): Promise<void> {
  const tier = getTier(score, isSilence);
  playEffectByTier(tier);

  if (voiceUrl) {
    const delay = EFFECT_DURATION_MS[tier];
    await new Promise(r => setTimeout(r, delay));
    await playFeedbackVoice(voiceUrl);
  }
}