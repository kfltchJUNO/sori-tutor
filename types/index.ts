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

export interface CurriculumItem {
  id: string;
  category: string;
  step?: number;
  unit?: number;
  is_mission?: boolean;
  source?: "manual" | "ai_generated";
  has_audio?: boolean;
  audio_path?: string;
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

export interface AnalysisResult {
  score: number;
  recognized: string;
  correct: string;
  explanation: string;
  advice: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  audio?: string;
}

export const PERSONAS = [
  { id: "su", name: "수경", role: "대학생", desc: "활발한 20대 대학생", color: "bg-pink-50 border-pink-200", img: "/images/수경.png", voice: "ko-KR-Chirp3-HD-Zephyr" },
  { id: "min", name: "민철", role: "카페 사장", desc: "감성적이고 따뜻한 30대 사장님", color: "bg-amber-50 border-amber-200", img: "/images/민철.png", voice: "ko-KR-Chirp3-HD-Rasalgethi" },
  { id: "jin", name: "진성", role: "면접관", desc: "논리적이고 깐깐한 대기업 부장님", color: "bg-slate-50 border-slate-300", img: "/images/진성.png", voice: "ko-KR-Chirp3-HD-Algenib" },
  { id: "seol", name: "설아", role: "K-Culture 팬", desc: "텐션 높은 K-POP/드라마 덕후", color: "bg-purple-50 border-purple-200", img: "/images/설아.png", voice: "ko-KR-Chirp3-HD-Despina" },
  { id: "do", name: "도식", role: "트레이너", desc: "에너지 넘치는 헬스 트레이너", color: "bg-blue-50 border-blue-200", img: "/images/도식.png", voice: "ko-KR-Chirp3-HD-Achird" },
  { id: "ju", name: "주호", role: "여행 가이드", desc: "박식하고 친절한 한국 여행 가이드", color: "bg-green-50 border-green-200", img: "/images/주호.png", voice: "ko-KR-Chirp3-HD-Sadachbia" },
  { id: "hye", name: "혜선", role: "상담사", desc: "지친 마음을 위로해주는 심리 상담가", color: "bg-rose-50 border-rose-200", img: "/images/혜선.png", voice: "ko-KR-Chirp3-HD-Aoede" },
  { id: "woo", name: "우주", role: "중학생", desc: "축구와 게임을 좋아하는 개구쟁이", color: "bg-yellow-50 border-yellow-200", img: "/images/우주.png", voice: "ko-KR-Chirp3-HD-Charon" },
  { id: "hyun", name: "현성", role: "소설가", desc: "지적이고 시니컬한 소설 작가", color: "bg-stone-50 border-stone-200", img: "/images/현성.png", voice: "ko-KR-Chirp3-HD-Zubenelgenubi" },
  { id: "sun", name: "순자", role: "국밥집 할머니", desc: "구수한 사투리와 정이 넘치는 할머니", color: "bg-orange-50 border-orange-200", img: "/images/순자.png", voice: "ko-KR-Chirp3-HD-Vindemiatrix" },
] as const;