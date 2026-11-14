// lib/scoreSound.ts
// Web Audio API 기반 고음질 사운드 이펙트 엔진 — 외부 에셋 의존 없음
// 점수대별 6가지 뚜렷하고 큰 시그니처 효과음 + 멘트 음성(선택) 순차 재생

// ── 사운드 피드백 모드 (음성+효과음 vs 효과음만) ─────────────
export type SoundFeedbackMode = "voice_and_sfx" | "sfx_only";

export function getSoundFeedbackMode(): SoundFeedbackMode {
  if (typeof window === "undefined") return "voice_and_sfx";
  const saved = localStorage.getItem("sori_sound_mode");
  return saved === "sfx_only" ? "sfx_only" : "voice_and_sfx";
}

export function setSoundFeedbackMode(mode: SoundFeedbackMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("sori_sound_mode", mode);
}

// ── 오디오 컨텍스트 및 마스터 컴프레서 싱글톤 ────────────────
let _ctx: AudioContext | null = null;
let _compressor: DynamicsCompressorNode | null = null;
let _masterGain: GainNode | null = null;

function getAudioPipeline(): { ctx: AudioContext; master: GainNode } {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // 컴프레서: 큰 소리에서도 왜곡(Clipping) 방지 및 음압(Loudness) 극대화
    _compressor = _ctx.createDynamicsCompressor();
    _compressor.threshold.setValueAtTime(-18, _ctx.currentTime);
    _compressor.knee.setValueAtTime(30, _ctx.currentTime);
    _compressor.ratio.setValueAtTime(12, _ctx.currentTime);
    _compressor.attack.setValueAtTime(0.003, _ctx.currentTime);
    _compressor.release.setValueAtTime(0.25, _ctx.currentTime);

    _masterGain = _ctx.createGain();
    _masterGain.gain.setValueAtTime(0.9, _ctx.currentTime); // 시원하고 큰 볼륨

    _masterGain.connect(_compressor);
    _compressor.connect(_ctx.destination);
  }
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return { ctx: _ctx, master: _masterGain! };
}

// ── 음표 재생 헬퍼 ──────────────────────────────────────────
function playTone(
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType = "sine",
  gainVal = 0.55,
  fadeOut = true
): void {
  const { ctx, master } = getAudioPipeline();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);

  if (fadeOut) {
    gain.gain.setValueAtTime(gainVal, startTime + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  }

  osc.connect(gain);
  gain.connect(master);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// ── 점수대별 6대 고유 시그니처 사운드 ───────────────────────

/**
 * 🎺 90~100점 (완벽): 웅장하고 신나는 승리의 4단 팡파레 + 축하 화음
 * 누구나 듣는 순간 "100점 맞았다!"는 것을 확신할 수 있는 화려하고 큰 축하 사운드
 */
export function playFanfare(): void {
  const { ctx } = getAudioPipeline();
  const t = ctx.currentTime;

  // 상승 아르페지오 (C5 -> E5 -> G5 -> C6)
  const notes = [
    { f: 523.25, time: 0.00, dur: 0.16 }, // C5
    { f: 659.25, time: 0.14, dur: 0.16 }, // E5
    { f: 783.99, time: 0.28, dur: 0.18 }, // G5
    { f: 1046.50, time: 0.44, dur: 0.45 }, // C6
  ];

  notes.forEach((n) => {
    playTone(n.f, t + n.time, n.dur, "triangle", 0.65);
    playTone(n.f * 2, t + n.time, n.dur * 0.7, "sine", 0.35); // 맑은 고음 배음
  });

  // 클라이맥스 승리 대화음 [C5, E5, G5, C6]
  const chordTime = t + 0.62;
  const chordFreqs = [523.25, 659.25, 783.99, 1046.50];
  chordFreqs.forEach((freq) => {
    playTone(freq, chordTime, 0.75, "triangle", 0.45);
  });

  // 반짝이는 축하 차임
  playTone(1567.98, chordTime + 0.08, 0.6, "sine", 0.4);
  playTone(2093.00, chordTime + 0.18, 0.7, "sine", 0.35);
}

/**
 * ✨ 75~89점 (우수): 맑고 경쾌한 3단 딩동댕 별 획득 사운드
 * "참 잘했어요!"가 느껴지는 청량하고 긍정적인 메이저 차임
 */
export function playStarGet(): void {
  const { ctx } = getAudioPipeline();
  const t = ctx.currentTime;

  // 상승 3연타 (G5 -> C6 -> E6)
  playTone(783.99, t + 0.00, 0.25, "sine", 0.6);
  playTone(783.99, t + 0.00, 0.20, "triangle", 0.4);

  playTone(1046.50, t + 0.18, 0.30, "sine", 0.65);
  playTone(1046.50, t + 0.18, 0.25, "triangle", 0.45);

  playTone(1318.51, t + 0.38, 0.55, "sine", 0.7);
  playTone(1318.51, t + 0.38, 0.45, "triangle", 0.45);

  // 별 반짝임 여운
  playTone(1567.98, t + 0.52, 0.45, "sine", 0.35);
}

/**
 * 👍 55~74점 (양호): 포근하고 기분 좋은 2단 마림바 딩동
 * "좋아요! 잘하고 있어요!"를 알리는 따뜻한 어쿠스틱 화음
 */
export function playGood(): void {
  const { ctx } = getAudioPipeline();
  const t = ctx.currentTime;

  // 따뜻한 2단 상승 (E5 -> A5)
  playTone(659.25, t + 0.00, 0.22, "triangle", 0.65);
  playTone(880.00, t + 0.16, 0.45, "sine", 0.7);
  playTone(1318.51, t + 0.18, 0.35, "sine", 0.3); // 산뜻한 배음
}

/**
 * 🔔 30~54점 (보통): 부드러운 2단 중립 알림 차임 (띵-동 하강)
 * "괜찮아요, 조금만 더 연습해볼까요?"를 정중하게 알리는 소프트 벨
 */
export function playNeutral(): void {
  const { ctx } = getAudioPipeline();
  const t = ctx.currentTime;

  // 중립 하강 (A4 -> F4)
  playTone(440.00, t + 0.00, 0.26, "sine", 0.6);
  playTone(349.23, t + 0.22, 0.40, "sine", 0.55);
}

/**
 * 😅 0~29점 (미흡): 낮은 음조의 따뜻한 스프링 재도전 사운드 (우웅-퐁)
 * 기분 나쁘지 않으면서도 확실하게 "다시 시도!"임을 직관적으로 알려주는 사운드
 */
export function playFail(): void {
  const { ctx, master } = getAudioPipeline();
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  // 낮은 슬라이드 다운
  osc.frequency.setValueAtTime(261.63, t); // C4
  osc.frequency.exponentialRampToValueAtTime(146.83, t + 0.42); // D3

  gain.gain.setValueAtTime(0.55, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

  osc.connect(gain);
  gain.connect(master);

  osc.start(t);
  osc.stop(t + 0.55);

  // 부드러운 쿠션 반등음
  playTone(220.0, t + 0.35, 0.3, "sine", 0.35);
}

/**
 * 🎙️ 침묵 (0점): 또렷한 2연타 마이크 탭 노크음
 * "마이크에 소리가 들어가지 않았어요"를 알려주는 2단 톡-톡
 */
export function playSilenceTick(): void {
  const { ctx } = getAudioPipeline();
  const t = ctx.currentTime;
  playTone(880, t + 0.00, 0.09, "triangle", 0.6, true);
  playTone(660, t + 0.12, 0.12, "triangle", 0.55, true);
}

// ── 점수 → 효과음 티어 매핑 ────────────────────────────────
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
  perfect: 1350,
  great:   1000,
  good:    650,
  okay:    650,
  fail:    600,
  silence: 350,
};

// ── 멘트 MP3 재생 ────────────────────────────────────────
export async function playFeedbackVoice(url: string, volume = 1.0): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

// ── 통합: 효과음 → (옵션: 딜레이 후 멘트) 순차 재생 ───────────
export async function playScoreFeedback(
  score: number,
  isSilence: boolean,
  voiceUrl: string | null,
  volume = 1.0,
  sfxOnlyOverride?: boolean
): Promise<void> {
  const tier = getTier(score, isSilence);

  // 1. 확실하고 큰 효과음 먼저 즉시 재생
  playEffectByTier(tier);

  // 2. 효과음 전용 모드인지 확인
  const isSfxOnly = sfxOnlyOverride !== undefined ? sfxOnlyOverride : getSoundFeedbackMode() === "sfx_only";

  // 효과음 전용 모드이면 목소리 멘트 재생 스킵 (부담 없는 학습 환경)
  if (isSfxOnly) {
    return;
  }

  // 3. 목소리 멘트가 있고 음성 모드일 경우 딜레이 후 재생
  if (voiceUrl) {
    const delay = EFFECT_DURATION_MS[tier];
    await new Promise((r) => setTimeout(r, delay));
    await playFeedbackVoice(voiceUrl, volume);
  }
}
