// lib/demoData.ts
// 체험/테스트 전용 공통 타입 및 기본 문장 데이터 (클라이언트/서버 공용)

export interface DemoSentenceDoc {
  id: string;
  level: "1급" | "2급" | "3급" | "4급" | "5급" | "6급" | string;
  text: string;
  pronunciation: string;
  ruleExplanation: string;
  audio_path?: string;
  has_audio?: boolean;
  order?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface DemoSurveyData {
  id: string;
  deviceId: string;
  language: string;
  satisfaction: number;
  feedbackClarity: number;
  ttsQuality: number;
  revisitIntent: number;
  translationQuality?: number;
  comment: string;
  isKorean?: boolean;
  targetLevel?: string;
  nationality?: string;
  studyPeriod?: string;
  weaknesses?: string[];
  // 발음 채점 이상 결과 및 오류 보고
  experiencedError?: boolean;
  errorTypes?: string[];
  errorDetail?: string;
  createdAtMs: number;
}

export interface DemoEvaluationLog {
  id: string;
  deviceId: string;
  clientIp: string;
  targetText: string;
  level: string;
  score: number;
  phonemeScore: number;
  recognizedText: string;
  feedback: string;
  isSilence: boolean;
  date: string;
  createdAtMs: number;
}

export const INITIAL_DEMO_SENTENCES: Omit<DemoSentenceDoc, "id">[] = [
  // 1급 (기초)
  {
    level: "1급",
    text: "학교에 가요.",
    pronunciation: "[학꾜에 가요]",
    ruleExplanation: "학[ㄱ] + 교[ㄱ] = [꾜] (된소리되기/경음화) 및 부드러운 평서문 하강조 억양",
    order: 1,
  },
  {
    level: "1급",
    text: "작년에 한국에 왔어요.",
    pronunciation: "[장년에 한구게 와써요]",
    ruleExplanation: "작[ㄱ] + 년[ㄴ] = [ㅇ] (비음화: 장년) / 한국[ㄱ] + 에 = [한구게] (이어 읽기: 연음)",
    order: 2,
  },
  // 2급 (중초급)
  {
    level: "2급",
    text: "한국 음식이 매워요?",
    pronunciation: "[한구금시기 매워요?]",
    ruleExplanation: "한국[ㄱ] + 음[ㅇ] = [한구금] (연음) / 끝 음절을 자연스럽게 살짝 올리는 의문문 상승조",
    order: 3,
  },
  {
    level: "2급",
    text: "한국말을 잘하고 싶어요.",
    pronunciation: "[한국마를 자라고 시퍼요]",
    ruleExplanation: "말[ㄹ] + 을 = [마를] (연음) / 잘[ㄹ] + 하고 = [자라고] / 싶[ㅂ] + 어요 = [시퍼요]",
    order: 4,
  },
  // 3급 (중급)
  {
    level: "3급",
    text: "국물이 아주 뜨거우니까 조심하세요.",
    pronunciation: "[궁무리 아주 뜨거우니까 조심하세요]",
    ruleExplanation: "국[ㄱ] + 물[ㅁ] = [궁물] (비음화) / [궁물] + 이 = [궁무리] (연음)",
    order: 5,
  },
  {
    level: "3급",
    text: "국립중앙박물관에 가요.",
    pronunciation: "[궁닙쯩앙방물과네 가요]",
    ruleExplanation: "국[ㄱ] + 립[ㄹ] = [궁닙] (비음화) / 박[ㄱ] + 물[ㅁ] = [방물] / 관[ㄴ] + 에 = [과네]",
    order: 6,
  },
];
