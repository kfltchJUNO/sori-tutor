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
