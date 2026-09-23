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
    id: process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_JUNHO || "srhGhMYcxqeTNVuSRvWg",
    name: "준호 (기본 남성 - 내 목소리)",
    gender: "male",
    description: "준호님 클론 보이스 (소리튜터 대표 남성 음성)",
    isDefault: true,
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL", // ElevenLabs 공식 다국어 여성 보이스 (Sarah - 친근하고 또렷함)
    name: "서연 (여성 성우)",
    gender: "female",
    description: "차분하고 밝은 톤의 한국어 지원 여성 음성 (대화 상대용)",
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs 공식 다국어 여성 보이스 (Rachel)
    name: "민지 (차분한 여성)",
    gender: "female",
    description: "차분하고 지적인 톤의 여성 음성",
  },
];

export const DEFAULT_MALE_VOICE_ID = "srhGhMYcxqeTNVuSRvWg";
