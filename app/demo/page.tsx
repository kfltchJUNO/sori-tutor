"use client";
// app/demo/page.tsx
// 로그인 없는 무설치 원클릭 한국어 발음 훈련 체험 페이지 (기기당 하루 5회 제한 & 6개 국어 지원 & 어드민 동적 문장 연동)

import { useState, useEffect, useRef } from "react";
import {
  Volume2, VolumeX, Mic, Square, Sparkles, AlertCircle, RefreshCw,
  CheckCircle2, Check, Languages, Loader2, MessageSquare, ChevronRight,
  Award, Headphones, Info, X, Star, Globe, Clock, BookOpen, Layers
} from "lucide-react";
import {
  SupportedLang, SUPPORTED_LANGS, DEMO_TEXTS, SURVEY_TEXTS
} from "@/lib/demoI18n";
import {
  DemoSentenceDoc, INITIAL_DEMO_SENTENCES
} from "@/lib/demoData";
import {
  playScoreFeedback, getSoundFeedbackMode, setSoundFeedbackMode, SoundFeedbackMode
} from "@/lib/scoreSound";

export default function DemoPage() {
  const [lang, setLang] = useState<SupportedLang>("ko");
  const [deviceId, setDeviceId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("1급");
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  // 동적 문장 목록
  const [sentences, setSentences] = useState<DemoSentenceDoc[]>(
    INITIAL_DEMO_SENTENCES.map((s, idx) => ({ id: `init-${idx}`, ...s }))
  );
  const [loadingSentences, setLoadingSentences] = useState(true);

  // 사운드 피드백 모드 (음성+효과음 vs 효과음만)
  const [soundMode, setSoundMode] = useState<SoundFeedbackMode>("sfx_only");

  // 횟수 제한 상태 (1인당 10회 제한)
  const [remainingTrials, setRemainingTrials] = useState<number | null>(null);
  const [trialLimit, setTrialLimit] = useState(10);
  const [loadingLimit, setLoadingLimit] = useState(true);

  // 오디오 녹음 및 분석 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // TTS 재생 상태
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);

  // 설문 및 10회 완료 모달 상태
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [trialCountThisSession, setTrialCountThisSession] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const t = DEMO_TEXTS[lang];
  const sT = SURVEY_TEXTS[lang];

  // 1. 기기 UUID 초기화, 로컬 설정 불러오기 및 동적 문장 조회
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

    setSoundMode(getSoundFeedbackMode());

    const isSurveyCompleted = localStorage.getItem("sori_demo_survey_done") === "true";
    setSurveyDone(isSurveyCompleted);

    // 서버 잔여 횟수 조회 & 동적 문장 조회
    fetchLimit(devId);
    fetchSentences();
  }, []);

  const fetchSentences = async () => {
    setLoadingSentences(true);
    try {
      const res = await fetch("/api/demo/sentences");
      const data = await res.json();
      if (Array.isArray(data.sentences) && data.sentences.length > 0) {
        setSentences(data.sentences);
      }
    } catch (e) {
      console.warn("데모 문장 조회 실패, 기본 목록 유지:", e);
    } finally {
      setLoadingSentences(false);
    }
  };

  const fetchLimit = async (devId: string) => {
    setLoadingLimit(true);
    try {
      const res = await fetch(`/api/demo/analyze?deviceId=${encodeURIComponent(devId)}`);
      const data = await res.json();
      if (res.ok) {
        setRemainingTrials(data.remaining);
        setTrialLimit(data.limit || 10);
        if (data.remaining === 0) {
          setShowCompletedModal(true);
        }
      }
    } catch (e) {
      console.warn("잔여 횟수 조회 실패:", e);
    } finally {
      setLoadingLimit(false);
    }
  };

  // 채점 중 3단계 분석 텍스트 롤링 타이머
  useEffect(() => {
    if (!analyzing) {
      setAnalyzingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setAnalyzingStep((prev) => (prev + 1) % 3);
    }, 1300);
    return () => clearInterval(interval);
  }, [analyzing]);

  const handleLangChange = (newLang: SupportedLang) => {
    setLang(newLang);
    localStorage.setItem("sori_demo_lang", newLang);
  };

  const toggleSoundMode = () => {
    const nextMode: SoundFeedbackMode = soundMode === "sfx_only" ? "voice_and_sfx" : "sfx_only";
    setSoundMode(nextMode);
    setSoundFeedbackMode(nextMode);
  };

  // 현재 급수 목록 추출
  const availableLevels = Array.from(new Set(sentences.map((s) => s.level)));
  const currentLevels = availableLevels.length > 0 ? availableLevels : ["1급", "2급", "3급"];

  const filteredSentences = sentences.filter((s) => s.level === selectedLevel);
  const currentSentence = filteredSentences[currentSentenceIndex] || filteredSentences[0] || sentences[0];

  // 2. TTS / 원어민 발음 듣기 (ElevenLabs 오디오 우선 → Web Speech API 자동 폴백)
  const handlePlayNativeAudio = () => {
    if (currentSentence?.audio_path) {
      try {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
        }
        const audio = new Audio(currentSentence.audio_path);
        audioPlayerRef.current = audio;
        setIsPlayingTTS(true);
        audio.onended = () => setIsPlayingTTS(false);
        audio.onerror = () => {
          setIsPlayingTTS(false);
          fallbackWebSpeech();
        };
        audio.play().catch(() => fallbackWebSpeech());
        return;
      } catch {
        fallbackWebSpeech();
        return;
      }
    }
    fallbackWebSpeech();
  };

  const fallbackWebSpeech = () => {
    if (!("speechSynthesis" in window)) {
      alert("이 브라우저는 음성 합성을 지원하지 않습니다.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentSentence.text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.88; // 학습자 친화적 속도

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
          setShowCompletedModal(true);
          return;
        }
        throw new Error(data.message || data.error || "분석에 실패했습니다.");
      }

      setAnalysisResult(data);

      // ── 효과음 / 멘트 재생 (효과음 모드 반영) ──
      const isSilence = !data.recognized || data.recognized === "(침묵)" || data.recognized === "(잡음)";
      playScoreFeedback(data.score, isSilence, null, 1.0, soundMode === "sfx_only").catch(() => {});

      if (data.demoRateLimit) {
        setRemainingTrials(data.demoRateLimit.remaining);
      }

      const nextCount = trialCountThisSession + 1;
      setTrialCountThisSession(nextCount);

      const totalUsed = data.demoRateLimit ? data.demoRateLimit.used : nextCount;
      const isSurveyCompleted = typeof window !== "undefined" && localStorage.getItem("sori_demo_survey_done") === "true";

      // 1. 5회차 연습 완료 시 1회 한정 설문조사 자동 유도
      if (totalUsed === 5 && !isSurveyCompleted) {
        setTimeout(() => setShowSurveyModal(true), 1500);
      }

      // 2. 10회차 한도 도달 시 정식 출시 대기 안내 모달 표출
      if (data.demoRateLimit && data.demoRateLimit.remaining === 0) {
        setTimeout(() => setShowCompletedModal(true), 2000);
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
              <p className="text-[10px] text-slate-500 font-medium">Free AI Pronunciation Trial</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 효과음 모드 토글 (목소리 부담 없는 모드 vs 음성 멘트) */}
            <button
              onClick={toggleSoundMode}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                soundMode === "sfx_only"
                  ? "bg-amber-50 text-amber-900 border-amber-300"
                  : "bg-indigo-50 text-indigo-900 border-indigo-200"
              }`}
              title={soundMode === "sfx_only" ? "현재: 효과음만 재생 (목소리 없음)" : "현재: 음성 멘트+효과음"}
            >
              {soundMode === "sfx_only" ? (
                <>
                  <VolumeX size={13} className="text-amber-600" />
                  <span>🔔 효과음만</span>
                </>
              ) : (
                <>
                  <Volume2 size={13} className="text-indigo-600" />
                  <span>🔊 멘트+효과음</span>
                </>
              )}
            </button>

            {/* 6개 국어 전환 툴바 */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <Languages size={14} className="text-slate-500 ml-1 mr-0.5" />
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
          <p className="text-xs text-slate-500 max-w-md mx-auto">{t.subTitle}</p>
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

        {/* 3. 급수 선택 탭 (동적 문장 레벨) */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-2 pt-1 text-xs">
            <span className="font-bold text-slate-700">{t.selectLevel}</span>
            <span className="text-[11px] text-indigo-600 font-medium">
              해당 급수 문장 {filteredSentences.length}개 제공
            </span>
          </div>

          <div className="flex gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-200/60 text-xs font-black overflow-x-auto">
            {currentLevels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => {
                  setSelectedLevel(lvl);
                  setCurrentSentenceIndex(0);
                  setAnalysisResult(null);
                }}
                className={`flex-1 min-w-[70px] py-2 rounded-lg transition ${
                  selectedLevel === lvl
                    ? "bg-white text-indigo-700 shadow-xs border border-indigo-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* 문장 선택 번호 탭 */}
          {filteredSentences.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {filteredSentences.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setCurrentSentenceIndex(idx);
                    setAnalysisResult(null);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                    currentSentenceIndex === idx
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  문장 {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. 목표 문장 카드 & 원어민 듣기 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-0.5 rounded-full">
              {selectedLevel} · {t.targetSentence}
            </span>
            <button
              onClick={handlePlayNativeAudio}
              disabled={isPlayingTTS}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-full transition disabled:opacity-50"
            >
              <Volume2 size={14} className={isPlayingTTS ? "animate-bounce text-indigo-600" : ""} />
              <span>{isPlayingTTS ? t.playing : t.listenNative}</span>
            </button>
          </div>

          {/* 한글 문장 & 표준 발음 */}
          <div className="space-y-1.5 text-center py-2">
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug">
              {currentSentence?.text || "학교에 가요."}
            </h3>
            <p className="text-sm sm:text-base font-bold text-indigo-600 font-mono">
              {currentSentence?.pronunciation || "[학꾜에 가요]"}
            </p>
          </div>

          {/* 음운 규칙 / 억양 안내 */}
          {currentSentence?.ruleExplanation && (
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-600 flex items-start gap-2">
              <Info size={15} className="text-indigo-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{currentSentence.ruleExplanation}</p>
            </div>
          )}
        </div>

        {/* 5. 녹음 버튼 섹션 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm text-center space-y-4">
          <div className="flex flex-col items-center justify-center">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="w-20 h-20 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex flex-col items-center justify-center shadow-lg shadow-rose-200 transition transform active:scale-95 animate-pulse"
              >
                <Square size={26} className="fill-white" />
                <span className="text-[10px] font-bold mt-1">{recordingSeconds}s</span>
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={analyzing || (remainingTrials !== null && remainingTrials <= 0)}
                className="w-20 h-20 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-200 transition transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                {analyzing ? <Loader2 size={32} className="animate-spin" /> : <Mic size={32} />}
              </button>
            )}
          </div>

          <div>
            <p className="font-black text-sm text-slate-800">
              {remainingTrials !== null && remainingTrials <= 0
                ? "🔒 오늘의 10회 체험이 완료되었습니다"
                : isRecording
                ? t.recordingBtn
                : analyzing
                ? t.analyzing
                : t.recordBtn}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {remainingTrials !== null && remainingTrials <= 0
                ? "소리튜터 정식 서비스 출시를 기대해 주세요!"
                : "마이크 버튼을 누르고 한국어로 소리 내어 말해보세요."}
            </p>
            {remainingTrials !== null && remainingTrials <= 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompletedModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-xs transition cursor-pointer"
                >
                  <span>🚀 정식 출시 안내 보기</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5-1. 채점 중 역동적 AI 분석 애니메이션 카드 */}
        {analyzing && (
          <div className="bg-white rounded-3xl p-6 border-2 border-indigo-500 shadow-xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-300">
            {/* 상단 펄싱 배지 */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-black text-indigo-700 shadow-2xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
              </span>
              <span>{t.analyzingCardTitle}</span>
            </div>

            {/* 역동적 오디오 이퀄라이저 파형 애니메이션 */}
            <div className="py-2 flex items-center justify-center gap-1.5 h-16">
              {[38, 72, 98, 55, 88, 42, 82, 96, 68, 48, 86, 62, 92, 42, 74, 58].map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-indigo-600 via-indigo-500 to-indigo-300 rounded-full transition-all duration-300"
                  style={{
                    height: `${Math.max(10, (h * (((i + analyzingStep * 3) % 5) + 2)) / 5)}px`,
                  }}
                />
              ))}
            </div>

            {/* 3단계 분석 상태 텍스트 롤링 */}
            <div className="space-y-1">
              <p className="text-sm font-black text-slate-800 transition-all duration-300">
                {analyzingStep === 0
                  ? t.analyzingStep1
                  : analyzingStep === 1
                  ? t.analyzingStep2
                  : t.analyzingStep3}
              </p>
              <p className="text-[11px] text-slate-400">
                AI가 음절 단위로 한국어 표준 발음과 억양을 정밀 대조하고 있습니다
              </p>
            </div>

            {/* 단계별 프로그레스 바 */}
            <div className="w-full max-w-xs mx-auto bg-slate-100 h-2 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: analyzingStep === 0 ? "35%" : analyzingStep === 1 ? "70%" : "95%",
                }}
              />
            </div>
          </div>
        )}

        {/* 6. AI 발음 분석 결과 카드 */}
        {analysisResult && (
          <div className="bg-white rounded-3xl p-6 border-2 border-indigo-500/80 shadow-md space-y-5 animate-in slide-in-from-bottom-3 duration-500">
            {/* 총점 & 점수대 배지 */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500">{t.scoreLabel}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-indigo-600">
                    {analysisResult.score ?? 0}
                  </span>
                  <span className="text-sm font-bold text-slate-400">/ 100{t.points}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full font-black text-xs">
                  {analysisResult.score >= 90
                    ? "🎺 완벽 (Perfect)"
                    : analysisResult.score >= 75
                    ? "✨ 우수 (Great)"
                    : analysisResult.score >= 55
                    ? "👍 양호 (Good)"
                    : analysisResult.score >= 30
                    ? "🔔 보통 (Okay)"
                    : "😅 재도전 (Try Again)"}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  {soundMode === "sfx_only" ? "🔔 효과음만 적용 중" : "🔊 음성 멘트 적용 중"}
                </p>
              </div>
            </div>

            {/* 음절별 시각화 피드백 */}
            {Array.isArray(analysisResult.syllableResults) && analysisResult.syllableResults.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">음절별 발음 정확도</span>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 justify-center">
                  {analysisResult.syllableResults.map((syl: any, idx: number) => {
                    const isMatch = syl.status === "match";
                    const isSimilar = syl.status === "similar";
                    return (
                      <div
                        key={idx}
                        className={`px-3 py-2 rounded-xl text-center min-w-[48px] border transition ${
                          isMatch
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-black"
                            : isSimilar
                            ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                            : "bg-rose-50 text-rose-800 border-rose-300 font-bold"
                        }`}
                      >
                        <span className="text-base block">{syl.char}</span>
                        <span className="text-[9px] block opacity-75">
                          {isMatch ? "정확" : isSimilar ? "유사" : "틀림"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4대 세부 지표 (자음, 모음, 규칙, 억양/휴지) */}
            {(() => {
              const consonant =
                analysisResult.categoryScores?.consonant ??
                analysisResult.consonantScore ??
                analysisResult.consonant ??
                0;
              const vowel =
                analysisResult.categoryScores?.vowel ??
                analysisResult.vowelScore ??
                analysisResult.vowel ??
                0;
              const rule =
                analysisResult.categoryScores?.rule ??
                analysisResult.ruleScore ??
                analysisResult.rule ??
                0;
              const intonation =
                analysisResult.categoryScores?.intonation ??
                analysisResult.pitchScore ??
                analysisResult.intonation ??
                0;

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Sparkles size={12} className="text-indigo-600" />
                      4대 발음 세부 정확도
                    </span>
                    <span className="text-[11px] text-slate-400">각 100점 만점 기준</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                    {/* 1. 자음 정확도 */}
                    <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-200/80 shadow-2xs space-y-1.5 transition hover:shadow-xs">
                      <span className="text-blue-700 block text-[11px] font-bold">{t.catConsonant}</span>
                      <span className="font-black text-blue-950 text-base block">
                        {consonant}점
                      </span>
                      <div className="w-full bg-blue-200/60 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, consonant))}%` }}
                        />
                      </div>
                    </div>

                    {/* 2. 모음 정확도 */}
                    <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-1.5 transition hover:shadow-xs">
                      <span className="text-emerald-700 block text-[11px] font-bold">{t.catVowel}</span>
                      <span className="font-black text-emerald-950 text-base block">
                        {vowel}점
                      </span>
                      <div className="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, vowel))}%` }}
                        />
                      </div>
                    </div>

                    {/* 3. 음운 규칙 */}
                    <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/80 shadow-2xs space-y-1.5 transition hover:shadow-xs">
                      <span className="text-amber-800 block text-[11px] font-bold">{t.catRule}</span>
                      <span className="font-black text-amber-950 text-base block">
                        {rule}점
                      </span>
                      <div className="w-full bg-amber-200/60 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, rule))}%` }}
                        />
                      </div>
                    </div>

                    {/* 4. 억양/휴지 */}
                    <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200/80 shadow-2xs space-y-1.5 transition hover:shadow-xs">
                      <span className="text-purple-700 block text-[11px] font-bold">{t.catIntonation}</span>
                      <span className="font-black text-purple-950 text-base block">
                        {intonation}점
                      </span>
                      <div className="w-full bg-purple-200/60 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, intonation))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 구체적 교정 팁 */}
            {analysisResult.explanation && (
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl text-xs space-y-1">
                <h4 className="font-black text-indigo-950 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-600" />
                  {t.feedbackTitle}
                </h4>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                  {analysisResult.explanation}
                </p>
                {analysisResult.advice && (
                  <p className="text-indigo-800 font-bold pt-1">
                    💡 {analysisResult.advice}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 하단 1분 설문 유도 배너 */}
        {surveyDone ? (
          <div className="p-4 bg-slate-100 rounded-3xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{t.surveyDoneBadge} (설문 응답이 정상 기록되었습니다. 감사합니다!)</span>
            </div>
            {remainingTrials === 0 && (
              <button
                onClick={() => setShowCompletedModal(true)}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition shrink-0"
              >
                🚀 정식 출시 안내
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-3xl shadow-sm flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="font-black text-xs sm:text-sm">{t.surveyBannerTitle}</h4>
              <p className="text-[10px] text-slate-300">
                학습자 맞춤형 기능을 위해 국적, 약점 및 채점 오류 여부 설문에 참여해 주세요.
              </p>
            </div>
            <button
              onClick={() => setShowSurveyModal(true)}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl transition text-xs shrink-0 cursor-pointer shadow"
            >
              {t.surveyBannerBtn}
            </button>
          </div>
        )}
      </main>

      {/* 7. 1분 만족도 설문조사 모달 (국적, 급수, 학습기간, 약점, 채점 오류 점검 추가) */}
      {showSurveyModal && (
        <DemoSurveyModal
          lang={lang}
          deviceId={deviceId}
          targetLevel={selectedLevel}
          onSurveySubmitted={() => setSurveyDone(true)}
          onClose={() => setShowSurveyModal(false)}
        />
      )}

      {/* 8. 10회 체험 완료 & 정식 출시 대기 안내 모달 */}
      {showCompletedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
              🚀
            </div>

            <div className="space-y-1">
              <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black rounded-full">
                {t.waitingLaunchBadge}
              </span>
              <h3 className="font-black text-slate-900 text-lg mt-2">
                {t.completedModalTitle}
              </h3>
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed pt-1">
                {t.completedModalDesc}
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 text-left">
              <div className="flex items-center gap-2 text-indigo-700 font-bold">
                <Sparkles size={14} />
                <span>소리튜터 정식 서비스 출시 예정 기능</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1 pl-4 list-disc">
                <li>1급~6급 전 급수 커리큘럼 무제한 발음 훈련</li>
                <li>학교·학원 반(Class) 및 선생님 실시간 연동</li>
                <li>초성·중성·종성 정밀 음소 교정 및 억양 AI 리포트</li>
              </ul>
            </div>

            <div className="space-y-2 pt-2">
              {!surveyDone ? (
                <button
                  onClick={() => {
                    setShowCompletedModal(false);
                    setShowSurveyModal(true);
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>{t.surveyPromptBtn}</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <div className="py-2.5 px-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                  {t.surveyDoneBadge} (소중한 피드백 감사합니다!)
                </div>
              )}

              <button
                onClick={() => setShowCompletedModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
              >
                {sT.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 1분 다국어 설문조사 모달 컴포넌트 ─────────────────────
function DemoSurveyModal({
  lang,
  deviceId,
  targetLevel: initialTargetLevel,
  onSurveySubmitted,
  onClose,
}: {
  lang: SupportedLang;
  deviceId: string;
  targetLevel: string;
  onSurveySubmitted?: () => void;
  onClose: () => void;
}) {
  const sT = SURVEY_TEXTS[lang];

  // 신규 인구통계 및 학습 배경 필드
  const [isKorean, setIsKorean] = useState(false);
  const [nationality, setNationality] = useState("VN");
  const [customNationality, setCustomNationality] = useState("");
  const [targetLevel, setTargetLevel] = useState(initialTargetLevel || "1급");
  const [studyPeriod, setStudyPeriod] = useState("m1to3");
  const [weaknesses, setWeaknesses] = useState<string[]>(["speaking", "pronunciation"]);

  const handleToggleKorean = (checked: boolean) => {
    setIsKorean(checked);
    if (checked) {
      setNationality("KR");
      setTargetLevel(sT.nativeOption || "원어민 (해당 없음)");
      setStudyPeriod(sT.nativeOption || "원어민 (모국어)");
    } else {
      if (nationality === "KR") {
        setNationality("VN");
        setTargetLevel(initialTargetLevel || "1급");
        setStudyPeriod("m1to3");
      }
    }
  };

  // AI 채점 오류 및 이상 결과 보고 상태
  const [experiencedError, setExperiencedError] = useState(false);
  const [errorTypes, setErrorTypes] = useState<string[]>([]);
  const [errorDetail, setErrorDetail] = useState("");

  // 4대 만족도 및 주관식
  const [q1Score, setQ1Score] = useState(5);
  const [q2Score, setQ2Score] = useState(5);
  const [q3Score, setQ3Score] = useState(5);
  const [q4Score, setQ4Score] = useState(5);
  const [q5Comment, setQ5Comment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleWeakness = (key: string) => {
    setWeaknesses((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const finalNationality = nationality === "OTHER" && customNationality.trim()
        ? customNationality.trim()
        : sT.nationalityOptions?.[nationality] || nationality;

      await fetch("/api/demo/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          language: lang,
          isKorean,
          nationality: finalNationality,
          targetLevel,
          studyPeriod: sT.studyPeriodOptions?.[studyPeriod] || studyPeriod,
          weaknesses: weaknesses.map((w) => sT.weaknessOptions?.[w] || w),
          experiencedError,
          errorTypes: experiencedError ? errorTypes.map((t) => sT.errorOptions?.[t] || t) : [],
          errorDetail: experiencedError ? errorDetail.trim() : "",
          satisfaction: q1Score,
          feedbackClarity: q2Score,
          ttsQuality: q3Score,
          revisitIntent: q4Score,
          comment: q5Comment.trim(),
        }),
      });
      localStorage.setItem("sori_demo_survey_done", "true");
      onSurveySubmitted?.();
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
            <span className="text-[9px] opacity-75">
              {num === 5 ? "최고" : num === 1 ? "미흡" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base">{sT.modalTitle}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{sT.modalDesc}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 size={42} className="text-emerald-600 mx-auto" />
            <h4 className="text-base font-black text-slate-900">{sT.thankYouTitle}</h4>
            <p className="text-xs text-slate-500">{sT.thankYouDesc}</p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            >
              {sT.closeBtn}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4">

            {/* 🇰🇷 한국인 테스터 전용 빠른 체크 버튼 */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                isKorean
                  ? "bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-indigo-300 shadow-xs ring-1 ring-indigo-200"
                  : "bg-slate-50 border-slate-200/80 hover:bg-slate-100/70"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🇰🇷</span>
                    <h4 className="text-xs font-black text-slate-900">
                      {sT.isKoreanTitle}
                    </h4>
                    {isKorean && (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-600 text-white rounded-full">
                        선택됨
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {sT.isKoreanDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleKorean(!isKorean)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shrink-0 shadow-xs ${
                    isKorean
                      ? "bg-indigo-600 text-white border border-indigo-600 ring-2 ring-indigo-200"
                      : "bg-white text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {isKorean ? (
                    <>
                      <Check size={14} className="stroke-[3]" />
                      <span>{sT.isKoreanChecked}</span>
                    </>
                  ) : (
                    <span>{sT.isKoreanBtn}</span>
                  )}
                </button>
              </div>
            </div>

            {/* A. 국적 선택 */}
            <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <label className="block text-xs font-black text-slate-900 flex items-center gap-1">
                <Globe size={13} className="text-indigo-600" />
                {sT.nationalityTitle}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                {Object.keys(sT.nationalityOptions || {}).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === "KR") {
                        handleToggleKorean(true);
                      } else {
                        setIsKorean(false);
                        setNationality(key);
                      }
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition truncate text-center ${
                      nationality === key
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sT.nationalityOptions[key]}
                  </button>
                ))}
              </div>
              {nationality === "OTHER" && (
                <input
                  type="text"
                  value={customNationality}
                  onChange={(e) => setCustomNationality(e.target.value)}
                  placeholder="국적을 직접 입력하세요 (e.g. Philippines)"
                  className="mt-2 w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              )}
            </div>

            {/* B. 급수 및 학습 기간 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 급수 */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="block text-xs font-black text-slate-900 flex items-center gap-1">
                  <BookOpen size={13} className="text-indigo-600" />
                  {sT.levelTitle}
                </label>
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {isKorean && (
                    <button
                      type="button"
                      onClick={() => setTargetLevel(sT.nativeOption || "원어민 (해당 없음)")}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition col-span-3 truncate px-2 text-center ${
                        targetLevel === (sT.nativeOption || "원어민 (해당 없음)")
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {sT.nativeOption || "원어민 (해당 없음)"}
                    </button>
                  )}
                  {["1급", "2급", "3급", "4급", "5급", "6급"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTargetLevel(lvl)}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition ${
                        targetLevel === lvl
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학습 기간 */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="block text-xs font-black text-slate-900 flex items-center gap-1">
                  <Clock size={13} className="text-indigo-600" />
                  {sT.studyPeriodTitle}
                </label>
                <div className="grid grid-cols-2 gap-1 pt-1">
                  {isKorean && (
                    <button
                      type="button"
                      onClick={() => setStudyPeriod(sT.nativeOption || "원어민 (모국어)")}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition truncate text-center col-span-2 ${
                        studyPeriod === (sT.nativeOption || "원어민 (모국어)")
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {sT.nativeOption || "원어민 (모국어)"}
                    </button>
                  )}
                  {Object.keys(sT.studyPeriodOptions || {}).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStudyPeriod(key)}
                      className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold border transition truncate text-center ${
                        studyPeriod === key
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {sT.studyPeriodOptions[key]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* C. 내가 생각하는 약점 (복수 선택) */}
            <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <label className="block text-xs font-black text-slate-900 flex items-center gap-1">
                <Layers size={13} className="text-amber-600" />
                {sT.weaknessTitle}
              </label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.keys(sT.weaknessOptions || {}).map((key) => {
                  const isChecked = weaknesses.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleWeakness(key)}
                      className={`py-1.5 px-3 rounded-full text-xs font-bold border transition flex items-center gap-1 ${
                        isChecked
                          ? "bg-amber-400 text-slate-950 border-amber-400 shadow-xs font-black"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {isChecked && "✓ "}
                      {sT.weaknessOptions[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* D. 4대 만족도 평가 */}
            <div className="space-y-3 pt-1">
              {renderRatingGroup(sT.q1, q1Score, setQ1Score)}
              {renderRatingGroup(sT.q2, q2Score, setQ2Score)}
              {renderRatingGroup(sT.q3, q3Score, setQ3Score)}
              {renderRatingGroup(sT.q4, q4Score, setQ4Score)}
            </div>

            {/* E. AI 채점 이상 결과 및 오류 보고 문항 */}
            <div className="space-y-2.5 p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200">
              <label className="block text-xs font-black text-amber-950 flex items-center gap-1.5">
                <AlertCircle size={14} className="text-amber-600 shrink-0" />
                {sT.errorTitle}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setExperiencedError(false);
                    setErrorTypes([]);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-left flex items-center justify-between ${
                    !experiencedError
                      ? "bg-white text-emerald-800 border-emerald-400 shadow-xs font-black"
                      : "bg-white/60 text-slate-600 border-slate-200 hover:bg-white"
                  }`}
                >
                  <span>😊 {sT.errorNone}</span>
                  {!experiencedError && <Check size={14} className="text-emerald-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setExperiencedError(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-left flex items-center justify-between ${
                    experiencedError
                      ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-black"
                      : "bg-white/60 text-slate-600 border-slate-200 hover:bg-white"
                  }`}
                >
                  <span>⚠️ {sT.errorReportPrompt}</span>
                  {experiencedError && <Check size={14} className="text-slate-950 shrink-0" />}
                </button>
              </div>

              {experiencedError && (
                <div className="space-y-2 pt-2 border-t border-amber-200 animate-in fade-in">
                  <p className="text-[11px] font-bold text-amber-900">
                    어떤 유형의 오류나 이상한 점이었나요? (복수 선택 가능)
                  </p>
                  <div className="space-y-1.5">
                    {Object.keys(sT.errorOptions || {}).map((key) => {
                      const selected = errorTypes.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setErrorTypes((prev) =>
                              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                            );
                          }}
                          className={`w-full text-left py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-between ${
                            selected
                              ? "bg-white text-amber-950 border-amber-400 shadow-xs"
                              : "bg-white/50 text-slate-700 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <span className="text-[11px]">{sT.errorOptions[key]}</span>
                          {selected ? <Check size={13} className="text-amber-600 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={errorDetail}
                    onChange={(e) => setErrorDetail(e.target.value)}
                    placeholder={sT.errorDetailPlaceholder}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>

            {/* F. 주관식 의견 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">{sT.q5}</label>
              <textarea
                rows={2}
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
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-md disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
