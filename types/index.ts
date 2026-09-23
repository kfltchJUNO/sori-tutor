// types/index.ts

export interface SoriUser {
  email: string;
  name: string;
  alias: string;
  role: "guest" | "student" | "admin";
  free_hearts: number;
  tokens: number;
  points: number;
  streak: number;
  today_count: number;
  last_access_date: string;
  last_checkin_date?: string;
  shared_memory: string;
  chat_count: number;
}

export type SeriesId = "step-korean" | "basecamp-korean";

export interface CurriculumItem {
  id: string;
  category: string;
  step?: number;
  unit?: number;
  is_mission?: boolean;
  source?: "manual" | "ai_generated";
  has_audio?: boolean;
  audio_path?: string;
  // 시리즈 구분 — 없으면 STEP Korean으로 취급 (기존 데이터 마이그레이션 불필요)
  seriesId?: SeriesId;
}

export interface WordItem extends CurriculumItem {
  text: string;
  pronunciation: string;
  tip: string;
}

export interface SentenceItem extends CurriculumItem {
  text: string;
  pronunciation: string;
  translation: string;
}

export interface DialogueItem extends CurriculumItem {
  title: string;
  script: string;
  translation: string;
  audio_paths?: string[];
}

export type CourseType = "word" | "sentence" | "dialogue";

export interface SyllableMatch {
  char: string;
  recognizedChar?: string;
  status: "match" | "coda_error" | "vowel_error" | "mismatch" | "omitted";
  tip?: string;
}

export interface AnalysisResult {
  score: number;
  recognized: string;
  correct: string;
  explanation: string;
  advice: string;
  syllableResults?: SyllableMatch[];
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  audio?: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  desc: string;
  color: string;
  img: string;
  voice: string;
  available: boolean;
}

export const PERSONAS: Persona[] = [
  {
    id: "junho",
    name: "준호",
    role: "한국인 친구",
    desc: "편하고 다정하게 일상을 나누는 한국인 남사친",
    color: "bg-blue-50 border-blue-300",
    img: "/images/주호.png",
    voice: "ko-KR-Chirp3-HD-Sadachbia",
    available: true,
  },
  {
    id: "seoyeon",
    name: "서연",
    role: "한국인 친구",
    desc: "밝고 활발한 K-컬처 & 일상 대화 메이트 (곧 찾아올게요!)",
    color: "bg-pink-50 border-pink-200",
    img: "/images/설아.png",
    voice: "ko-KR-Chirp3-HD-Despina",
    available: false,
  },
];