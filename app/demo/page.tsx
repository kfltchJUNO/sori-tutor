"use client";
// app/demo/page.tsx
// 로그인 없는 무설치 원클릭 한국어 발음 훈련 체험 페이지 (기기당 하루 5회 제한 & 5개 국어 지원)

import { useState, useEffect, useRef } from "react";
import {
  Volume2, Mic, Square, Sparkles, AlertCircle, RefreshCw,
  CheckCircle2, Languages, Loader2, MessageSquare, ChevronRight,
  Award, Headphones, Info, X, Star
} from "lucide-react";
import {
  SupportedLang, SUPPORTED_LANGS, DEMO_TEXTS, SURVEY_TEXTS
} from "@/lib/demoI18n";

interface DemoSentence {
  id: string;
  level: "1급" | "2급" | "3급";
  text: string;
  pronunciation: string;
  ruleExplanation: string;
}

const DEMO_SENTENCES: DemoSentence[] = [
  // 1급 (기초)
  {
    id: "s-1-1",
    level: "1급",
    text: "학교에 가요.",
    pronunciation: "[학꾜에 가요]",
    ruleExplanation: "학[ㄱ] + 교[ㄱ] = [꾜] (된소리되기/경음화) 및 부드러운 평서문 하강조 억양",
  },
  {
    id: "s-1-2",
    level: "1급",
    text: "작년에 한국에 왔어요.",
    pronunciation: "[장년에 한구게 와써요]",
    ruleExplanation: "작[ㄱ] + 년[ㄴ] = [ㅇ] (비음화: 장년) / 한국[ㄱ] + 에 = [한구게] (이어 읽기: 연음)",
  },
  // 2급 (중초급)
  {
    id: "s-2-1",
    level: "2급",
    text: "한국 음식이 매워요?",
    pronunciation: "[한구금시기 매워요?]",
    ruleExplanation: "한국[ㄱ] + 음[ㅇ] = [한구금] (연음) / 끝 음절을 자연스럽게 살짝 올리는 의문문 상승조",
  },
  {
    id: "s-2-2",
    level: "2급",
    text: "한국말을 잘하고 싶어요.",
    pronunciation: "[한국마를 자라고 시퍼요]",
    ruleExplanation: "말[ㄹ] + 을 = [마를] (연음) / 잘[ㄹ] + 하고 = [자라고] / 싶[ㅂ] + 어요 = [시퍼요]",
  },
  // 3급 (중급)
  {
    id: "s-3-1",
    level: "3급",
    text: "국물이 아주 뜨거우니까 조심하세요.",
    pronunciation: "[궁무리 아주 뜨거우니까 조심하세요]",
    ruleExplanation: "국[ㄱ] + 물[ㅁ] = [궁물] (닮은소리: 비음화) / [궁물] + 이 = [궁무리] (연음)",
  },
  {
    id: "s-3-2",
    level: "3급",
    text: "국립중앙박물관에 가요.",
    pronunciation: "[궁닙쯩앙방물과네 가요]",
    ruleExplanation: "국[ㄱ] + 립[ㄹ] = [궁닙] (비음화) / 박[ㄱ] + 물[ㅁ] = [방물] / 관[ㄴ] + 에 = [과네]",
  },
];

export default function DemoPage() {
  const [lang, setLang] = useState<SupportedLang>("ko");
  const [deviceId, setDeviceId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<"1급" | "2급" | "3급">("1급");
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  // 횟수 제한 상태
  const [remainingTrials, setRemainingTrials] = useState<number | null>(null);
  const [trialLimit, setTrialLimit] = useState(5);
  const [loadingLimit, setLoadingLimit] = useState(true);

  // 오디오 녹음 및 분석 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // TTS 재생 상태
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);

  // 설문 모달 상태
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [trialCountThisSession, setTrialCountThisSession] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const t = DEMO_TEXTS[lang];
  const sT = SURVEY_TEXTS[lang];

  // 1. 기기 UUID 초기화 및 로컬 설정 불러오기
  useEffect(() => {
    let devId = localStorage.getItem("sori_demo_device_id");
    if (!devId) {
      devId = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
      localStorage.setItem("sori_demo_device_id", devId);
    }
    setDeviceId(devId);

    const savedLang = localStorage.getItem("sori_demo_lang") as SupportedLang;
    if (savedLang && DEMO_TEXTS[savedLang]) {
      setLang(savedLang);
    }

    // 서버 잔여 횟수 조회
    fetchLimit(devId);
  }, []);

  const fetchLimit = async (devId: string) => {
    setLoadingLimit(true);
    try {
      const res = await fetch(`/api/demo/analyze?deviceId=${encodeURIComponent(devId)}`);
      const data = await res.json();
      if (res.ok) {
        setRemainingTrials(data.remaining);
        setTrialLimit(data.limit || 5);
      }
    } catch (e) {
      console.warn("잔여 횟수 조회 실패:", e);
    } finally {
      setLoadingLimit(false);
    }
  };

  const handleLangChange = (newLang: SupportedLang) => {
    setLang(newLang);
    localStorage.setItem("sori_demo_lang", newLang);
  };

  const filteredSentences = DEMO_SENTENCES.filter((s) => s.level === selectedLevel);
  const currentSentence = filteredSentences[currentSentenceIndex] || filteredSentences[0];

  // 2. TTS 원어민 발음 듣기 (Web Speech API 브라우저 무제한 TTS)
  const handlePlayNativeAudio = () => {
    if (!("speechSynthesis" in window)) {
      alert("이 브라우저는 음성 합성을 지원하지 않습니다.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentSentence.text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.88; // 학습자 친화적 차분한 속도

    utterance.onstart = () => setIsPlayingTTS(true);
    utterance.onend = () => setIsPlayingTTS(false);
    utterance.onerror = () => setIsPlayingTTS(false);

    window.speechSynthesis.speak(utterance);
  };

  // 3. 마이크 녹음 시작
  const startRecording = async () => {
    setErrorMsg(null);
    setAnalysisResult(null);

    if (remainingTrials !== null && remainingTrials <= 0) {
      setErrorMsg(t.limitExceeded);
      setShowSurveyModal(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        await submitAudioForAnalysis(audioBlob);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 8) {
            stopRecording();
            return 8;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e: any) {
      console.error(e);
      setErrorMsg("마이크 권한을 허용해 주세요.");
    }
  };

  // 마이크 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // 4. 발음 분석 서버 전송
  const submitAudioForAnalysis = async (blob: Blob) => {
    setAnalyzing(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "demo_speech.webm");
      formData.append("targetText", currentSentence.text);
      formData.append("targetPronunciation", currentSentence.pronunciation);
      formData.append("deviceId", deviceId);
      formData.append("userNick", "체험학습자");

      const res = await fetch("/api/demo/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setRemainingTrials(0);
          setErrorMsg(t.limitExceeded);
          setShowSurveyModal(true);
          return;
        }
        throw new Error(data.message || data.error || "분석에 실패했습니다.");
      }

      setAnalysisResult(data);
      if (data.demoRateLimit) {
        setRemainingTrials(data.demoRateLimit.remaining);
      }

      const nextCount = trialCountThisSession + 1;
      setTrialCountThisSession(nextCount);

      // 3회차 연습 완료 시 피드백 설문 팝업 유도
      if (nextCount === 3 || (data.demoRateLimit && data.demoRateLimit.remaining === 0)) {
        setTimeout(() => setShowSurveyModal(true), 2500);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-slate-50 text-slate-900 pb-16">
      {/* 1. 상단 다국어 선택 바 & 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-xs">
              소
            </div>
            <div>
              <h1 className="font-black text-sm text-slate-900 leading-tight">소리튜터 (Sori-Tutor)</h1>
              <p className="text-[10px] text-slate-700 font-medium">Free AI Pronunciation Trial</p>
            </div>
          </div>

          {/* 6개 국어 전환 툴바 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <Languages size={14} className="text-slate-700 ml-1 mr-0.5" />
            <select
              value={lang}
              onChange={(e) => handleLangChange(e.target.value as SupportedLang)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              {SUPPORTED_LANGS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 2. 메인 컨테이너 */}
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* 상단 안내 & 잔여 횟수 배지 */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-200/80 rounded-full text-xs font-bold text-indigo-700">
            <Sparkles size={13} className="text-indigo-600 animate-pulse" />
            <span>
              {t.remainingBadge}:{" "}
              <strong>
                {loadingLimit ? "..." : remainingTrials !== null ? remainingTrials : trialLimit}
              </strong>{" "}
              / {trialLimit}
              {t.times}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t.title}</h2>
          <p className="text-xs text-slate-700 max-w-md mx-auto">{t.subTitle}</p>
        </div>

        {/* 에러 또는 한도 초과 안내 */}
        {errorMsg && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            {remainingTrials === 0 && (
              <button
                onClick={() => setShowSurveyModal(true)}
                className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition shrink-0"
              >
                {t.surveyBannerBtn}
              </button>
            )}
          </div>
        )}

        {/* 3. 급수 선택 탭 (1급 / 2급 / 3급) */}
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-2 pt-1 text-xs">
            <span className="font-bold text-slate-700">{t.selectLevel}</span>
            <span className="text-[11px] text-indigo-600 font-medium">문장 2개 중 선택 가능</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-200/60 text-xs font-black">
            <button
              onClick={() => {
                setSelectedLevel("1급");
                setCurrentSentenceIndex(0);
                setAnalysisResult(null);
              }}
              className={`py-2 rounded-lg transition ${
                selectedLevel === "1급"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              {t.level1}
            </button>
            <button
              onClick={() => {
                setSelectedLevel("2급");
                setCurrentSentenceIndex(0);
                setAnalysisResult(null);
              }}
              className={`py-2 rounded-lg transition ${
                selectedLevel === "2급"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              {t.level2}
            </button>
            <button
              onClick={() => {
                setSelectedLevel("3급");
                setCurrentSentenceIndex(0);
                setAnalysisResult(null);
              }}
              className={`py-2 rounded-lg transition ${
                selectedLevel === "3급"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              {t.level3}
            </button>
          </div>

          {/* 문장 스위처 (1/2번 문장) */}
          <div className="flex gap-2 pt-1 px-1">
            {filteredSentences.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => {
                  setCurrentSentenceIndex(idx);
                  setAnalysisResult(null);
                }}
                className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition truncate ${
                  currentSentenceIndex === idx
                    ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                문장 {idx + 1}: {s.text}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 목표 문장 카드 */}
        <div className="bg-white rounded-3xl p-6 border-2 border-indigo-200/80 shadow-md space-y-4 text-center">
          <div className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold">
            {t.targetSentence}
          </div>

          <div className="space-y-1">
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              {currentSentence.text}
            </h3>
            <p className="text-sm font-bold text-indigo-600 font-mono">
              {t.standardPron}: {currentSentence.pronunciation}
            </p>
          </div>

          <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
            💡 <strong>핵심 발음 포인트:</strong> {currentSentence.ruleExplanation}
          </p>

          {/* 원어민 발음 듣기 버튼 */}
          <div className="pt-2 flex justify-center">
            <button
              onClick={handlePlayNativeAudio}
              disabled={isPlayingTTS}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs transition border border-indigo-200 shadow-xs"
            >
              <Volume2 size={16} className={isPlayingTTS ? "animate-bounce text-indigo-600" : ""} />
              <span>{isPlayingTTS ? t.playing : t.listenNative}</span>
            </button>
          </div>
        </div>

        {/* 5. 마이크 녹음 버튼 영역 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm text-center space-y-4">
          <div className="flex flex-col items-center justify-center">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={analyzing || (remainingTrials !== null && remainingTrials <= 0 && !isRecording)}
              className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all transform active:scale-95 shadow-lg ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 animate-pulse ring-8 ring-red-100"
                  : "bg-indigo-600 hover:bg-indigo-700 ring-8 ring-indigo-50"
              } disabled:opacity-50`}
            >
              {isRecording ? <Square size={28} /> : <Mic size={32} />}
            </button>

            <p className="text-xs font-bold text-slate-700 mt-3">
              {isRecording ? `${t.recordingBtn} (${recordingSeconds}초)` : t.recordBtn}
            </p>
          </div>

          {analyzing && (
            <div className="py-4 text-center space-y-2 text-indigo-600 text-xs font-bold animate-in fade-in">
              <Loader2 size={24} className="animate-spin mx-auto text-indigo-600" />
              <p>{t.analyzing}</p>
            </div>
          )}
        </div>

        {/* 6. 발음 분석 결과 카드 */}
        {analysisResult && (
          <div className="bg-white rounded-3xl p-6 border-2 border-emerald-200 shadow-lg space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-emerald-600" />
                <h4 className="font-black text-slate-900 text-base">{t.scoreLabel}</h4>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-emerald-600">{analysisResult.overallScore ?? analysisResult.score}</span>
                <span className="text-xs text-slate-700 font-bold ml-1">{t.points}</span>
              </div>
            </div>

            {/* 실제 들린 발음 */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1">
              <span className="text-slate-700 font-medium">AI가 실제로 들은 발화 (들린 그대로):</span>
              <p className="font-bold text-slate-900 text-sm font-mono">
                &ldquo;{analysisResult.recognized || "(침묵)"}&rdquo;
              </p>
            </div>

            {/* 4대 세부 영역 점수 */}
            {analysisResult.categoryScores && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-700 font-bold">{t.catConsonant}</p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {analysisResult.categoryScores.consonant}점
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-700 font-bold">{t.catVowel}</p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {analysisResult.categoryScores.vowel}점
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-700 font-bold">{t.catRule}</p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {analysisResult.categoryScores.rule}점
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-700 font-bold">{t.catIntonation}</p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {analysisResult.categoryScores.intonation}점
                  </p>
                </div>
              </div>
            )}

            {/* 교정 피드백 팁 */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
              <h5 className="font-black text-emerald-900 text-xs flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" /> {t.feedbackTitle}
              </h5>
              <p className="text-xs text-slate-800 leading-relaxed font-medium">
                {analysisResult.summary || analysisResult.explanation || "전반적으로 자연스럽게 발음하셨습니다!"}
              </p>

              {analysisResult.errors && analysisResult.errors.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-emerald-200/60">
                  {analysisResult.errors.map((err: any) => (
                    <div key={err.id || err.tag} className="text-xs bg-white p-2 rounded-lg border border-emerald-200 space-y-1">
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        {err.tag || err.subCategory}
                      </span>
                      <p className="text-slate-800 font-medium">{err.tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 설문 유도 배너 */}
            <div className="pt-2 flex items-center justify-between text-xs bg-indigo-50/80 p-3 rounded-2xl border border-indigo-200">
              <span className="font-bold text-indigo-900">{t.surveyBannerTitle}</span>
              <button
                onClick={() => setShowSurveyModal(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-xs shrink-0"
              >
                {t.surveyBannerBtn}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 7. 1분 만족도 설문조사 모달 (5개 국어 지원) */}
      {showSurveyModal && (
        <DemoSurveyModal
          lang={lang}
          deviceId={deviceId}
          targetLevel={selectedLevel}
          onClose={() => setShowSurveyModal(false)}
        />
      )}
    </div>
  );
}

// ── 1분 다국어 설문조사 모달 컴포넌트 ─────────────────────
function DemoSurveyModal({
  lang,
  deviceId,
  targetLevel,
  onClose,
}: {
  lang: SupportedLang;
  deviceId: string;
  targetLevel: string;
  onClose: () => void;
}) {
  const sT = SURVEY_TEXTS[lang];

  const [q1Score, setQ1Score] = useState(5);
  const [q2Score, setQ2Score] = useState(5);
  const [q3Score, setQ3Score] = useState(5);
  const [q4Score, setQ4Score] = useState(5);
  const [q5Comment, setQ5Comment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/demo/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          language: lang,
          satisfaction: q1Score,
          feedbackClarity: q2Score,
          ttsQuality: q3Score,
          revisitIntent: q4Score,
          comment: q5Comment.trim(),
          targetLevel,
        }),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRatingGroup = (
    label: string,
    currentValue: number,
    setValue: (val: number) => void
  ) => (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-slate-800">{label}</label>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => setValue(num)}
            className={`py-2 text-xs font-bold rounded-xl border transition flex flex-col items-center justify-center gap-0.5 ${
              currentValue === num
                ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{num}점</span>
            <span className="text-[10px] opacity-75">
              {num === 5 ? "최고" : num === 1 ? "미흡" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base">{sT.modalTitle}</h3>
            <p className="text-xs text-slate-700 mt-0.5">{sT.modalDesc}</p>
          </div>
          <button onClick={onClose} className="text-slate-700 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 size={42} className="text-emerald-600 mx-auto" />
            <h4 className="text-base font-black text-slate-900">{sT.thankYouTitle}</h4>
            <p className="text-xs text-slate-700">{sT.thankYouDesc}</p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            >
              {sT.closeBtn}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4">
            {renderRatingGroup(sT.q1, q1Score, setQ1Score)}
            {renderRatingGroup(sT.q2, q2Score, setQ2Score)}
            {renderRatingGroup(sT.q3, q3Score, setQ3Score)}
            {renderRatingGroup(sT.q4, q4Score, setQ4Score)}

            {/* 주관식 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">{sT.q5}</label>
              <textarea
                rows={3}
                value={q5Comment}
                onChange={(e) => setQ5Comment(e.target.value)}
                placeholder={sT.q5Placeholder}
                className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition"
              >
                {sT.closeBtn}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : sT.submitBtn}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
