// lib/elevenlabsVoices.ts
// ElevenLabs 보이스 프리셋 정의

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
  isDefault?: boolean;
}

export const ELEVENLABS_VOICES: VoiceOption[] = [
  {
    id: "3lMatKOyHfWflJwj08H6",
    name: "준호 (남성 - 대표 음성)",
    gender: "male",
    description: "준호님 클론 보이스 (소리튜터 대표 남성 음성)",
    isDefault: true,
  },
  {
    id: "DAYXNdDncOaX81nsqMvp",
    name: "민우 (남성)",
    gender: "male",
    description: "부드럽고 자연스러운 남성 음성",
  },
  {
    id: "mTVOetWowFUodP946PJM",
    name: "채원 (여성)",
    gender: "female",
    description: "밝고 또렷한 표준 여성 음성 (대화 상대/해설용)",
  },
  {
    id: "EsM6qKItauOb9XNGEb9g",
    name: "유진 (여성)",
    gender: "female",
    description: "차분하고 친절한 여성 음성",
  },
];

export const DEFAULT_MALE_VOICE_ID = "3lMatKOyHfWflJwj08H6";
export const DEFAULT_FEMALE_VOICE_ID = "mTVOetWowFUodP946PJM";

export type EmotionId =
  | "auto"
  | "default"
  | "happy"
  | "excited"
  | "calm"
  | "encouraging"
  | "curious"
  | "sorry"
  | "serious";

export interface EmotionOption {
  id: EmotionId;
  label: string;
  tag: string; // eleven_v4 인라인 오디오 태그
  stability: number;
}

export const ELEVENLABS_EMOTIONS: EmotionOption[] = [
  {
    id: "auto",
    label: "🤖 감정: 문맥 자동 (추천)",
    tag: "",
    stability: 0.55,
  },
  {
    id: "default",
    label: "😐 기본 (담백·표준 발음)",
    tag: "",
    stability: 0.65,
  },
  {
    id: "happy",
    label: "😊 밝고 다정하게 (인사·환영)",
    tag: "[happy, warmly]",
    stability: 0.5,
  },
  {
    id: "excited",
    label: "🎉 신나고 활기차게 (칭찬·감탄)",
    tag: "[excited, cheerfully]",
    stability: 0.45,
  },
  {
    id: "encouraging",
    label: "💪 따뜻하게 격려하듯",
    tag: "[warmly, encouraging]",
    stability: 0.5,
  },
  {
    id: "calm",
    label: "🍵 차분하고 정중하게 (면접·안내)",
    tag: "[calm, polite]",
    stability: 0.6,
  },
  {
    id: "curious",
    label: "🤔 궁금해하며 친근하게 (질문)",
    tag: "[curious, friendly]",
    stability: 0.5,
  },
  {
    id: "sorry",
    label: "😥 미안해하며 / 아쉬워하며",
    tag: "[apologetic, softly]",
    stability: 0.55,
  },
  {
    id: "serious",
    label: "🧐 진지하고 또렷하게",
    tag: "[serious, clearly]",
    stability: 0.65,
  },
];

/**
 * 대사(text), 선택된 감정(emotion), 점수대(tier)를 바탕으로
 * eleven_v4에 전달할 인라인 오디오 태그([tag])와 최적의 stability 값을 반환합니다.
 */
export function resolveEmotionForV4(
  text: string,
  emotion: string = "auto",
  tier?: string,
  isClonedVoice: boolean = false
): { tag: string; stability: number; detectedLabel: string } {
  const boostStability = (base: number) => (isClonedVoice ? Math.min(0.75, base + 0.1) : base);

  // 1. 사용자가 명시적으로 '기본(담백)'을 선택한 경우
  if (emotion === "default") {
    return { tag: "", stability: boostStability(0.65), detectedLabel: "기본(표준)" };
  }

  // 2. 사용자가 특정 감정을 직접 선택한 경우
  if (emotion && emotion !== "auto") {
    const found = ELEVENLABS_EMOTIONS.find(e => e.id === emotion);
    if (found) {
      return {
        tag: found.tag,
        stability: boostStability(found.stability),
        detectedLabel: found.label,
      };
    }
  }

  // 3. 자동 감지(auto): 점수대 피드백(tier)이 지정된 경우
  if (tier) {
    switch (tier) {
      case "perfect":
        return { tag: "[excited, cheerfully]", stability: boostStability(0.48), detectedLabel: "신나고 활기차게(자동)" };
      case "great":
        return { tag: "[happy, warmly]", stability: boostStability(0.5), detectedLabel: "밝고 다정하게(자동)" };
      case "good":
        return { tag: "[warmly, encouraging]", stability: boostStability(0.52), detectedLabel: "따뜻한 격려(자동)" };
      case "okay":
        return { tag: "[gently, encouraging]", stability: boostStability(0.55), detectedLabel: "차분한 격려(자동)" };
      case "fail":
        return { tag: "[softly, warmly]", stability: boostStability(0.55), detectedLabel: "다정한 위로(자동)" };
      case "silence":
        return { tag: "[curious, gently]", stability: boostStability(0.58), detectedLabel: "부드러운 질문(자동)" };
    }
  }

  // 4. 자동 감지(auto): 한국어 대사/문장 문맥 분석
  const t = text.trim();

  // 짧은 단일 단어(공백 없고 6글자 이하)는 발음 학습 정확도를 위해 감정 과장 없이 표준 톤 유지
  if (!t.includes(" ") && t.length <= 6 && !/[?!]/.test(t)) {
    return { tag: "", stability: boostStability(0.65), detectedLabel: "단어 표준(자동)" };
  }

  // 사과 / 유감 / 걱정 표현
  if (/(죄송|미안|유감|실례|어떡하|어쩌지|큰일이|안됐|아쉽|곤란)/.test(t)) {
    return { tag: "[apologetic, softly]", stability: boostStability(0.55), detectedLabel: "미안함·아쉬움(자동)" };
  }

  // 축하 / 큰 기쁨 / 감탄 표현
  if (/(축하|대박|와!|정말요\?!|진짜요\?!|최고|너무 좋|완전 좋|환영합니다|훌륭)/.test(t)) {
    return { tag: "[excited, cheerfully]", stability: boostStability(0.48), detectedLabel: "신남·감탄(자동)" };
  }

  // 감사 / 반가운 인사 / 칭찬 표현
  if (/(감사합니다|고마워|고맙습니다|반갑습니다|반가워|다행이|좋네요|좋아요|잘했|맛있|멋지)/.test(t)) {
    return { tag: "[happy, warmly]", stability: boostStability(0.5), detectedLabel: "밝고 다정함(자동)" };
  }

  // 격려 / 응원 표현
  if (/(화이팅|파이팅|힘내|할 수 있|괜찮아요|괜찮아|포기하지|천천히|다시 한번)/.test(t)) {
    return { tag: "[warmly, encouraging]", stability: boostStability(0.52), detectedLabel: "따뜻한 격려(자동)" };
  }

  // 격식체 면접 / 공식 발표 어투 (~십니까, ~습니다만, 말씀드리겠습니다 등)
  if (/(안녕하십니까|말씀드리|생각합니다|지원한|감사드리며|바랍니다)/.test(t)) {
    return { tag: "[calm, polite]", stability: boostStability(0.6), detectedLabel: "차분·정중(자동)" };
  }

  // 질문형 문장 (? 로 끝남)
  if (/\?\s*$/.test(t)) {
    return { tag: "[curious, friendly]", stability: boostStability(0.52), detectedLabel: "친근한 질문(자동)" };
  }

  // 밝은 감탄형 문장 (! 로 끝남)
  if (/!\s*$/.test(t)) {
    return { tag: "[happy, warmly]", stability: boostStability(0.52), detectedLabel: "밝은 강조(자동)" };
  }

  // 일반 평서문 대화
  return { tag: "[calm, warmly]", stability: boostStability(0.58), detectedLabel: "자연스러운 대화(자동)" };
}
