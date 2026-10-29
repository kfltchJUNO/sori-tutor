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
  dongguk_status?: "none" | "pending" | "approved";
  dongguk_student_id?: string;
  dongguk_applied_at?: string;
  dankook_status?: "none" | "pending" | "approved";
  dankook_student_id?: string;
  dankook_applied_at?: string;
}

export type SeriesId = "step-korean" | "basecamp-korean" | "dongguk-1" | "dankook-1";

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

export interface DonggukSentenceItem {
  id: string;
  text: string;
  pronunciation: string;
  rule_formula?: string; // 예: "ㄱ 받침 + ㄴ = [ㅇ]"
  chapter: number;
  audio_path?: string;
  created_at?: any;
}

export interface DankookSentenceItem {
  id: string;
  text: string;
  pronunciation: string;
  rule_formula?: string; // 예: "ㄱ 받침 + ㄴ = [ㅇ]"
  chapter: number;
  audio_path?: string;
  created_at?: any;
}

export type CourseType = "word" | "sentence" | "dialogue" | "dongguk" | "dankook";

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
  ruleFormula?: string;
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
  badgeColor?: string;
  img: string;
  voice: string;
  elevenVoiceId: string;
  speechStyle: "honorific" | "casual";
  greeting: string;
  available: boolean;
}

export const PERSONAS: Persona[] = [
  {
    id: "junho",
    name: "준호",
    role: "높임말 연습 · 면접/윗사람",
    desc: "면접관이나 직장 선배·윗사람과 대화하듯 정중하고 격식 있는 높임말을 연습해요.",
    color: "bg-blue-50 border-blue-400",
    badgeColor: "text-blue-700 bg-blue-100/80",
    img: "/images/주호.png",
    voice: "ko-KR-Chirp3-HD-Sadachbia",
    elevenVoiceId: "3lMatKOyHfWflJwj08H6",
    speechStyle: "honorific",
    greeting: "안녕하세요, 반갑습니다. 저는 준호입니다. 오늘 면접이나 윗사람과의 정중한 높임말 대화를 함께 연습해 볼까요?",
    available: true,
  },
  {
    id: "chaewon",
    name: "채원",
    role: "높임말 연습 · 면접/비즈니스",
    desc: "교수님·면접관·공식 자리에서 또렷하고 예의 바른 높임말 대화를 연습해요.",
    color: "bg-indigo-50 border-indigo-400",
    badgeColor: "text-indigo-700 bg-indigo-100/80",
    img: "/images/혜선.png",
    voice: "ko-KR-Chirp3-HD-Aoede",
    elevenVoiceId: "mTVOetWowFUodP946PJM",
    speechStyle: "honorific",
    greeting: "안녕하세요, 만나서 반갑습니다. 저는 채원입니다. 예의 바르고 자연스러운 높임말로 저와 이야기 나누어 보시겠어요?",
    available: true,
  },
  {
    id: "minwoo",
    name: "민우",
    role: "반말 연습 · 친구/일상",
    desc: "동갑내기 친한 남사친과 학교나 카페에서 수다 떨듯 편한 반말을 연습해요.",
    color: "bg-emerald-50 border-emerald-400",
    badgeColor: "text-emerald-700 bg-emerald-100/80",
    img: "/images/우주.png",
    voice: "ko-KR-Chirp3-HD-Achird",
    elevenVoiceId: "DAYXNdDncOaX81nsqMvp",
    speechStyle: "casual",
    greeting: "안녕! 반가워, 나는 민우야. 우리 동갑 친구니까 편하게 반말로 이야기하자! 오늘 뭐 하고 있었어?",
    available: true,
  },
  {
    id: "yujin",
    name: "유진",
    role: "반말 연습 · 친구/일상",
    desc: "다정한 단짝 여사친과 K-컬처·취미·일상 이야기를 나누며 자연스러운 반말을 연습해요.",
    color: "bg-pink-50 border-pink-400",
    badgeColor: "text-pink-700 bg-pink-100/80",
    img: "/images/설아.png",
    voice: "ko-KR-Chirp3-HD-Despina",
    elevenVoiceId: "EsM6qKItauOb9XNGEb9g",
    speechStyle: "casual",
    greeting: "안녕! 나는 유진이야. 우리 단짝 친구처럼 편하게 반말로 수다 떨자! 요즘 어떻게 지내?",
    available: true,
  },
];
