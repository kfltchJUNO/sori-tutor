"use client";
// app/demo/chat/page.tsx
// 독립형 보이스봇(챗봇) 실전 음성 대화 & 억양/감정 인식 테스트실 (최대 5턴 제한 & 정식 오픈 안내 & 상세 설문조사)

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Mic, Square, Volume2, Sparkles, RefreshCw, ChevronLeft,
  ArrowRight, Activity, CheckCircle2, AlertCircle, Headphones,
  Send, X, MessageSquare, Play, RotateCcw, Star, Check, HelpCircle
} from "lucide-react";
import { PERSONAS, Persona } from "@/types";
import AudioWaveform from "@/app/components/AudioWaveform";

interface ChatMessage {
  role: "user" | "model";
  text: string;
  audio?: string | null;
  userMood?: {
    mood: string;
    emoji: string;
    intonation: string;
    vocalFeedback?: string;
  } | null;
  timestamp?: number;
}

const MAX_TURNS = 5;

const NATIVE_LANGS = [
  "한국어", "English", "中文", "日本語", "Tiếng Việt", "မြန်마 (Burmese)", "기타 (Other)"
];

const KOREAN_LEVELS = [
  "초급 (TOPIK 1~2급)", "중급 (TOPIK 3~4급)", "고급 (TOPIK 5~6급)"
];

const LATENCY_OPTIONS = [
  { id: "매우 빠름", label: "⚡ 매우 빠름 (즉시 답변)" },
  { id: "적당함", label: "👍 적당함 (대화 흐름 자연스러움)" },
  { id: "조금 느림", label: "⏳ 조금 느림 (약간의 대기)" },
  { id: "답답함", label: "🐢 답답함 (오래 걸림)" },
];

const EMOTION_ACCURACY_OPTIONS = [
  { id: "매우 정확함", label: "🎯 매우 정확함 (내 기분과 억양을 딱 맞춤)" },
  { id: "대략 맞음", label: "🙂 대략 맞음 (비슷하게 유추함)" },
  { id: "보통", label: "🤔 보통 (그저 그랬음)" },
  { id: "엉뚱함", label: "❌ 엉뚱함 (내 상태와 전혀 다름)" },
];

const GOOD_POINTS_LIST = [
  "🎧 목소리가 기계 같지 않고 원어민 친구처럼 생생하고 자연스러웠어요",
  "🎭 내 억양과 기분(감정)을 알아채고 공감해 줘서 신기했어요",
  "💬 텍스트 타자 없이 진짜 음성으로만 주고받아서 실전 회화에 도움 됐어요",
  "⚡ 답변이 너무 길지 않고 짧고 경쾌해서 부담 없이 말할 수 있었어요",
  "🌸 틀려도 부끄럽지 않게 편안하게 한국어로 말할 수 있었어요",
];

const BAD_POINTS_LIST = [
  "⏳ 음성 응답 대기 시간(Latency)이 조금 길게 느껴졌어요",
  "👂 내 발음이나 말을 가끔 잘못 알아들었어요 (STT 오인식)",
  "🖐️ 5턴이 너무 짧아서 더 길게 대화하고 싶어요",
  "🎯 더 다양한 주제나 상황극(롤플레잉)을 해보고 싶어요",
  "🔊 가끔 음성이 끊기거나 버벅거렸어요",
];

const ERROR_TYPES_LIST = [
  "🎙️ 마이크 녹음이 잘 안 됨 / 소리가 안 들어감",
  "🔇 AI의 목소리가 들리지 않거나 재생 안 됨",
  "🛑 응답 대기 중 화면이 멈추거나 먹통이 됨",
  "❓ 엉뚱하거나 전혀 상관없는 대답을 함",
];

export default function DemoVoiceChatPage() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // 5턴 제한 관리 상태
  const [turnCount, setTurnCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  // 설문조사 입력 폼 상태
  const [surveyLang, setSurveyLang] = useState("한국어");
  const [surveyLevel, setSurveyLevel] = useState("초급 (TOPIK 1~2급)");
  const [surveySatisfaction, setSurveySatisfaction] = useState(5);
  const [surveyLatency, setSurveyLatency] = useState("적당함");
  const [surveyEmotionAcc, setSurveyEmotionAcc] = useState("매우 정확함");
  const [selectedGoodPoints, setSelectedGoodPoints] = useState<string[]>([
    "🎧 목소리가 기계 같지 않고 원어민 친구처럼 생생하고 자연스러웠어요",
    "🎭 내 억양과 기분(감정)을 알아채고 공감해 줘서 신기했어요",
  ]);
  const [goodPointCustom, setGoodPointCustom] = useState("");
  const [selectedBadPoints, setSelectedBadPoints] = useState<string[]>([]);
  const [badPointCustom, setBadPointCustom] = useState("");
  const [experiencedError, setExperiencedError] = useState<boolean>(false);
  const [selectedErrorTypes, setSelectedErrorTypes] = useState<string[]>([]);
  const [errorDetail, setErrorDetail] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submittingSurvey, setSubmittingSurvey] = useState(false);

  // 음성 파형 및 무음 감지 Ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const speechFramesRef = useRef<number>(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // 브라우저 Web Speech API 폴백
  const speakWithBrowserTTS = useCallback((text: string, personaId?: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.95;

      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ko"));
      if (voices.length > 0) {
        if (personaId === "minwoo" || personaId === "junho") {
          utterance.voice = voices.find((v) => v.name.includes("Male") || v.name.includes("남성")) || voices[0];
          utterance.pitch = personaId === "minwoo" ? 1.05 : 0.92;
        } else {
          utterance.voice = voices.find((v) => v.name.includes("Female") || v.name.includes("여성")) || voices[0];
          utterance.pitch = personaId === "chaewon" ? 1.0 : 1.15;
        }
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("브라우저 Web Speech API 재생 오류:", e);
    }
  }, []);

  // 메시지 오디오 재생
  const playModelAudio = async (text: string, personaId: string, currentAudio?: string | null) => {
    if (currentAudio) {
      try {
        const audio = new Audio(currentAudio);
        audio.play().catch(() => speakWithBrowserTTS(text, personaId));
        return;
      } catch {
        speakWithBrowserTTS(text, personaId);
        return;
      }
    }

    try {
      setTtsLoading(true);
      const fd = new FormData();
      fd.append("action", "tts_simple");
      fd.append("text", text);
      fd.append("personaId", personaId);
      const res = await fetch("/api/chat", { method: "POST", body: fd });
      const data = await res.json();
      if (data.audioContent) {
        const mime = data.audioContent.startsWith("UklGR") ? "audio/wav" : "audio/mp3";
        const audioSrc = `data:${mime};base64,${data.audioContent}`;
        new Audio(audioSrc).play().catch(() => speakWithBrowserTTS(text, personaId));
        setChatHistory((prev) =>
          prev.map((m) => (m.text === text ? { ...m, audio: audioSrc } : m))
        );
      } else {
        speakWithBrowserTTS(text, personaId);
      }
    } catch {
      speakWithBrowserTTS(text, personaId);
    } finally {
      setTtsLoading(false);
    }
  };

  // 페르소나 변경 및 첫 인사말 로드
  const handleSelectPersona = async (persona: Persona) => {
    setSelectedPersona(persona);
    const greeting = persona.greeting || `안녕하세요! 저는 ${persona.name}입니다. 우리 대화할까요?`;
    setChatHistory([{ role: "model", text: greeting, timestamp: Date.now() }]);
    playModelAudio(greeting, persona.id);
  };

  // 초기 시작 시 기본 페르소나 인사말
  useEffect(() => {
    handleSelectPersona(PERSONAS[0]);
  }, []);

  // ── 녹음 시작 ──
  const startRecording = async () => {
    if (turnCount >= MAX_TURNS || isCompleted) {
      setShowSurveyModal(true);
      return;
    }

    try {
      speechFramesRef.current = 0;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {});
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);

      // 무음 감지 (발화 시작 감지 후 3초 무음 시 자동 정지)
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const detectSilence = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg > 14) {
          speechFramesRef.current += 1;
          if (silenceTimer.current) {
            clearTimeout(silenceTimer.current);
            silenceTimer.current = null;
          }
        } else if (speechFramesRef.current >= 8) {
          if (!silenceTimer.current) {
            silenceTimer.current = setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                stopRecording();
              }
            }, 3000);
          }
        }

        animationFrameRef.current = requestAnimationFrame(detectSilence);
      };

      detectSilence();
    } catch (e: any) {
      alert("마이크 접근 권한을 허용해 주세요: " + e.message);
    }
  };

  // ── 녹음 중지 ──
  const stopRecording = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  // ── 음성 전송 및 분석 ──
  const handleSendVoice = async () => {
    if (!audioBlob) return;
    const nextTurn = turnCount + 1;
    const isFinal = nextTurn >= MAX_TURNS;

    setLoading(true);
    const fd = new FormData();
    fd.append("action", "chat");
    fd.append("audio", audioBlob, "recording.webm");
    fd.append("isFinalTurn", isFinal ? "true" : "false");
    fd.append(
      "history",
      JSON.stringify(
        chatHistory.map((m) => ({
          role: m.role,
          text: m.text,
        }))
      )
    );
    fd.append("persona", selectedPersona.id);

    try {
      const res = await fetch("/api/chat", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        alert("대화 오류: " + data.error);
        return;
      }

      setTurnCount(nextTurn);

      const audioMime = data.audioContent?.startsWith("UklGR") ? "audio/wav" : "audio/mp3";
      const replyAudioSrc = data.audioContent ? `data:${audioMime};base64,${data.audioContent}` : null;

      const newHistory: ChatMessage[] = [
        ...chatHistory,
        {
          role: "user",
          text: data.userText || "(음성 발화 완료)",
          userMood: data.userMood,
          timestamp: Date.now(),
        },
        {
          role: "model",
          text: data.aiText,
          audio: replyAudioSrc,
          timestamp: Date.now(),
        },
      ];
      setChatHistory(newHistory);

      if (replyAudioSrc) {
        const audio = new Audio(replyAudioSrc);
        audio.play().catch(() => speakWithBrowserTTS(data.aiText, selectedPersona.id));
      } else {
        speakWithBrowserTTS(data.aiText, selectedPersona.id);
      }

      if (isFinal) {
        setIsCompleted(true);
        // 마지막 멘트 오디오 재생 후 설문조사 자동 팝업
        setTimeout(() => {
          setShowSurveyModal(true);
        }, 3500);
      }

      setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      console.error(e);
      alert("전송 중 통신 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setAudioBlob(null);
      setAudioUrl(null);
    }
  };

  // 대화 초기화 (다시 시작)
  const handleResetChat = () => {
    if (confirm("대화를 처음부터 다시 시작하시겠습니까?")) {
      setTurnCount(0);
      setIsCompleted(false);
      handleSelectPersona(selectedPersona);
    }
  };

  // 설문조사 제출
  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSurvey(true);

    try {
      const payload = {
        nativeLanguage: surveyLang,
        koreanLevel: surveyLevel,
        personaId: selectedPersona.id,
        personaName: selectedPersona.name,
        satisfaction: surveySatisfaction,
        latencyRating: surveyLatency,
        emotionAccuracy: surveyEmotionAcc,
        goodPoints: selectedGoodPoints,
        goodPointComment: goodPointCustom,
        badPoints: selectedBadPoints,
        badPointComment: badPointCustom,
        experiencedError,
        errorTypes: experiencedError ? selectedErrorTypes : [],
        errorDetail: experiencedError ? errorDetail : "",
        contactEmail,
      };

      const res = await fetch("/api/demo/chat/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("설문 제출에 실패했습니다.");
      }

      setSurveySubmitted(true);
      setTimeout(() => {
        setShowSurveyModal(false);
      }, 2000);
    } catch (err: any) {
      alert("설문 저장 오류: " + (err.message || "잠시 후 다시 시도해 주세요."));
    } finally {
      setSubmittingSurvey(false);
    }
  };

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-start py-4 px-3 sm:px-6">
      {/* ── 최상단 헤더 네비게이션 ── */}
      <header className="w-full max-w-lg flex items-center justify-between pb-3 pt-1 border-b border-slate-800 text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white text-sm shadow-md">
            🎙️
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              보이스봇 실전 회화 테스트실
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 rounded-full font-bold">
                최대 5턴 체험
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">발음과 억양을 듣고 기분을 공감하는 한국어 AI 튜터</p>
          </div>
        </div>

        {/* 🧪 발음 분석 테스트실 전환 버튼 */}
        <Link
          href="/demo"
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition shadow-xs"
        >
          <span>🧪 발음 분석실</span>
          <ArrowRight size={13} />
        </Link>
      </header>

      {/* ── 메인 대화 컨테이너 ── */}
      <main className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col h-[82vh] max-h-[820px] mt-3 overflow-hidden border border-slate-100 relative">
        {/* 상단 1: 5턴 진행 현황 게이지 바 */}
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border-b border-indigo-100/80 text-xs font-bold text-indigo-950">
          <div className="flex items-center gap-2">
            <span className="text-indigo-600 font-black">대화 진행</span>
            <span className="font-mono text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">
              {turnCount} / {MAX_TURNS}턴
            </span>
            {isCompleted && (
              <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-black">
                체험 완료!
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((step) => (
              <span
                key={step}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  turnCount >= step
                    ? "bg-indigo-600 scale-110 shadow-xs"
                    : "bg-slate-200"
                }`}
                title={`${step}턴`}
              />
            ))}
          </div>
        </div>

        {/* 상단 2: 페르소나 선택 바 */}
        <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-1">대화 상대:</span>
            {PERSONAS.map((p) => {
              const isSelected = selectedPersona.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={turnCount > 0}
                  onClick={() => handleSelectPersona(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition shrink-0 ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-60"
                  }`}
                  title={turnCount > 0 ? "대화 중에는 페르소나 변경이 제한됩니다" : ""}
                >
                  <span>{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {p.speechStyle === "honorific" ? "높임말" : "반말"}
                  </span>
                </button>
              );
            })}
          </div>

          {turnCount > 0 && (
            <button
              type="button"
              onClick={handleResetChat}
              className="text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-1 shrink-0 px-2 py-1 bg-white rounded-lg border border-slate-200"
              title="대화 처음부터 다시하기"
            >
              <RotateCcw size={12} />
              <span>초기화</span>
            </button>
          )}
        </div>

        {/* 대화 스트림 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          <div className="text-center py-1">
            <span className="text-[11px] text-slate-400 bg-white border border-slate-200/60 px-3 py-1 rounded-full shadow-2xs font-medium">
              💡 100% 음성으로만 진행됩니다 · 5턴 동안 자유롭게 말해보세요
            </span>
          </div>

          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              } space-y-1 animate-in fade-in duration-300`}
            >
              {/* 발화자 이름 */}
              <span className="text-[10px] text-slate-400 px-1 font-medium">
                {msg.role === "user" ? "나 (학습자)" : `${selectedPersona.name} (${selectedPersona.role.split("·")[0].trim()})`}
              </span>

              {/* 사용자 음성 발화 시: 억양 & 유추된 기분 배지 표시 */}
              {msg.role === "user" && msg.userMood && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-200/80 rounded-xl text-[11px] font-bold text-indigo-950 mb-0.5 shadow-2xs">
                  <span>{msg.userMood.emoji || "🎭"}</span>
                  <span className="text-indigo-700 font-black">
                    기분: {msg.userMood.mood}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600 font-medium">
                    억양: {msg.userMood.intonation}
                  </span>
                </div>
              )}

              {/* 말풍선 본문 */}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed relative ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-xs shadow-md"
                    : "bg-white text-slate-800 border border-slate-200 rounded-tl-xs shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* 봇 말풍선 다시 듣기 버튼 */}
                {msg.role === "model" && (
                  <button
                    onClick={() => playModelAudio(msg.text, selectedPersona.id, msg.audio)}
                    className="absolute -right-8 top-2 bg-white border border-slate-200 rounded-full p-1.5 shadow-xs text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                    title="음성 다시 듣기"
                  >
                    <Volume2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* AI 생성 중 로딩 인디케이터 */}
          {loading && (
            <div className="flex items-start gap-2 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                {selectedPersona.name[0]}
              </div>
              <div className="p-3 bg-white rounded-2xl rounded-tl-xs border border-indigo-200 shadow-sm flex items-center gap-2 text-xs text-indigo-900 font-bold">
                <RefreshCw size={13} className="animate-spin text-indigo-600" />
                <span>목소리 억양을 분석하고 답변을 생각하는 중...</span>
              </div>
            </div>
          )}

          <div ref={chatScrollRef} />
        </div>

        {/* ── 하단 컨트롤 영역 (무음성 100% 보이스 전용 컨트롤) ── */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col items-center gap-3">
          {/* 1. 5턴 완료 시 안내 및 설문 유도 카드 */}
          {isCompleted && (
            <div className="flex flex-col items-center gap-2.5 w-full py-2 text-center animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center text-xl shadow-md">
                🎉
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">5턴 무료 체험 대화가 완료되었습니다!</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  아쉽지만 정식 서비스 오픈 때 더 풍성한 대화로 다시 만나요.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setShowSurveyModal(true)}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-md transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <MessageSquare size={13} />
                  <span>{surveySubmitted ? "설문 응답 확인" : "📝 설문조사 참여하기"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetChat}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  title="대화 다시 시작하기"
                >
                  <RotateCcw size={13} />
                  <span>다시 하기</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. 대기 상태: 대형 마이크 버튼 (5턴 미만 시에만 표시) */}
          {!isCompleted && !recording && !audioUrl && !loading && (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <button
                type="button"
                onClick={startRecording}
                className="w-18 h-18 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xl shadow-indigo-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition ring-4 ring-indigo-100 cursor-pointer"
                title="탭하여 한국어로 말하기"
              >
                <Mic size={32} className="stroke-[2.5]" />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 mt-1">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                <span>마이크를 누르고 한국어로 말해보세요 ({turnCount}/5턴)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                말이 끝나면 자동으로 분석되거나 탭하여 전송할 수 있습니다.
              </p>
            </div>
          )}

          {/* 3. 녹음 진행 중: 파형 + 정지 버튼 */}
          {!isCompleted && recording && (
            <div className="flex flex-col items-center gap-2.5 w-full py-1 animate-in fade-in">
              <AudioWaveform
                analyser={analyserRef.current}
                isRecording={recording}
                className="mb-1"
                barColor="#6366f1"
              />
              <button
                type="button"
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-200 cursor-pointer"
              >
                <Square size={22} className="fill-red-500 text-red-500" />
              </button>
              <span className="text-xs text-red-600 font-black animate-pulse">
                🎙️ 말씀하시는 중... (다 말씀하시면 탭하세요)
              </span>
            </div>
          )}

          {/* 4. 녹음 완료: 오디오 확인 및 전송 버튼 */}
          {!isCompleted && audioUrl && !recording && !loading && (
            <div className="flex items-center gap-2.5 w-full animate-in slide-in-from-bottom">
              <button
                type="button"
                onClick={() => {
                  setAudioUrl(null);
                  setAudioBlob(null);
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw size={14} /> 다시 말하기
              </button>
              <button
                type="button"
                onClick={handleSendVoice}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Send size={15} /> 음성 전송 ({turnCount + 1}/5턴)
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── 하단 설명 카드 ── */}
      <footer className="w-full max-w-lg mt-3 flex items-center justify-between text-xs text-slate-400 pb-4 px-2">
        <span>Sori-Tutor Voice Bot · Gemini Multimodal Emotion & Tone</span>
        <button
          type="button"
          onClick={() => setShowSurveyModal(true)}
          className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
        >
          설문조사 열기
        </button>
      </footer>

      {/* ── 5턴 완료 설문조사 모달 ── */}
      {showSurveyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* 모달 헤더 */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-bold">
                  <Sparkles size={14} className="text-amber-400" />
                  <span>소리튜터 보이스봇 테스트 피드백</span>
                </div>
                <h3 className="text-base font-black text-white mt-1">
                  🎙️ 보이스봇 체험 설문조사
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  기본사항 + 좋았던 점 + 아쉬운 점 + 오류를 남겨주시면 정식 서비스 출시에 큰 도움이 됩니다!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSurveyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* 설문 완료 상태 */}
            {surveySubmitted ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center text-2xl shadow-inner">
                  <Check size={32} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-slate-900">소중한 의견이 접수되었습니다!</h4>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    전해주신 피드백을 바탕으로 억양 분석 정밀도와 대화 속도를 더욱 개선하여 정식 서비스로 찾아뵙겠습니다. 감사합니다!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSurveyModal(false)}
                  className="px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
                >
                  닫기
                </button>
              </div>
            ) : (
              /* 설문 입력 폼 스크롤 */
              <form onSubmit={handleSubmitSurvey} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-800">
                {/* 1. 기본 사항 */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
                    기본 사항
                  </span>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">나의 모국어 (Native Language)</label>
                    <select
                      value={surveyLang}
                      onChange={(e) => setSurveyLang(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {NATIVE_LANGS.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">한국어 실력 수준</label>
                    <div className="grid grid-cols-3 gap-2">
                      {KOREAN_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setSurveyLevel(lvl)}
                          className={`py-2 px-1 text-center rounded-xl border text-[11px] font-bold transition ${
                            surveyLevel === lvl
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {lvl.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    <span>대화했던 페르소나 파트너:</span>
                    <span className="font-bold text-indigo-700">{selectedPersona.name} ({selectedPersona.speechStyle === "honorific" ? "높임말" : "반말"})</span>
                  </div>
                </div>

                {/* 2. 전반적 만족도 & 좋은 점 */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                    전체 만족도 & 좋았던 점
                  </span>

                  {/* 별점 평가 */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">전반적인 보이스봇 대화 만족도</label>
                    <div className="flex items-center gap-1.5 py-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSurveySatisfaction(star)}
                          className="p-1 hover:scale-110 transition cursor-pointer"
                        >
                          <Star
                            size={24}
                            className={
                              star <= surveySatisfaction
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300"
                            }
                          />
                        </button>
                      ))}
                      <span className="ml-2 font-bold text-amber-600 text-sm">
                        {surveySatisfaction}점 / 5점
                      </span>
                    </div>
                  </div>

                  {/* 반응 속도 체감 */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">AI의 음성 응답 속도는 어떠셨나요?</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {LATENCY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSurveyLatency(opt.id)}
                          className={`p-2 rounded-xl border text-left text-[11px] font-bold transition ${
                            surveyLatency === opt.id
                              ? "bg-indigo-50 border-indigo-500 text-indigo-900"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 억양 및 기분 유추 정확도 */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">내 억양과 기분(감정) 유추는 어땠나요?</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {EMOTION_ACCURACY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSurveyEmotionAcc(opt.id)}
                          className={`p-2 rounded-xl border text-left text-[11px] font-bold transition ${
                            surveyEmotionAcc === opt.id
                              ? "bg-purple-50 border-purple-500 text-purple-900"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 좋았던 점 복수 선택 */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1.5">
                      어떤 점이 특히 좋으셨나요? (복수 선택)
                    </label>
                    <div className="space-y-1.5">
                      {GOOD_POINTS_LIST.map((point) => {
                        const checked = selectedGoodPoints.includes(point);
                        return (
                          <label
                            key={point}
                            className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition ${
                              checked
                                ? "bg-indigo-50/70 border-indigo-400 text-indigo-950 font-bold"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItem(selectedGoodPoints, setSelectedGoodPoints, point)}
                              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] leading-tight">{point}</span>
                          </label>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      placeholder="기타 좋았던 점 (선택 입력)"
                      value={goodPointCustom}
                      onChange={(e) => setGoodPointCustom(e.target.value)}
                      className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 3. 아쉬운 점 & 바라는 점 */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                    아쉬운 점 & 바라는 점
                  </span>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1.5">
                      대화하면서 아쉬웠거나 불편했던 점은 무엇인가요? (복수 선택)
                    </label>
                    <div className="space-y-1.5">
                      {BAD_POINTS_LIST.map((point) => {
                        const checked = selectedBadPoints.includes(point);
                        return (
                          <label
                            key={point}
                            className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition ${
                              checked
                                ? "bg-amber-50 border-amber-400 text-amber-950 font-bold"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItem(selectedBadPoints, setSelectedBadPoints, point)}
                              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-[11px] leading-tight">{point}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">
                      정식 서비스에서 꼭 추가되길 바라는 점이나 자유 의견
                    </label>
                    <textarea
                      rows={2}
                      placeholder="예: 롤플레잉 모드가 있으면 좋겠어요 / 조금 더 천천히 말해줬으면 좋겠어요 등"
                      value={badPointCustom}
                      onChange={(e) => setBadPointCustom(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 4. 오류가 있었나요? */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]">4</span>
                    오류 여부 조사 (버그 제보)
                  </span>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1.5">
                      대화 중 소리가 안 나거나 마이크가 멈추는 등의 오류가 있었나요?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExperiencedError(false)}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition ${
                          !experiencedError
                            ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        🟢 오류 없이 원활했어요
                      </button>
                      <button
                        type="button"
                        onClick={() => setExperiencedError(true)}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition ${
                          experiencedError
                            ? "bg-red-50 border-red-500 text-red-800 ring-2 ring-red-200"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        🔴 오류를 겪었어요
                      </button>
                    </div>
                  </div>

                  {experiencedError && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 animate-in fade-in">
                      <label className="block text-red-700 font-bold text-[11px]">
                        어떤 오류를 겪으셨나요? (해당되는 것 모두 선택)
                      </label>
                      <div className="space-y-1">
                        {ERROR_TYPES_LIST.map((err) => {
                          const checked = selectedErrorTypes.includes(err);
                          return (
                            <label
                              key={err}
                              className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition ${
                                checked
                                  ? "bg-red-50 border-red-300 text-red-900 font-bold"
                                  : "bg-white border-slate-200 text-slate-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleItem(selectedErrorTypes, setSelectedErrorTypes, err)}
                                className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                              />
                              <span className="text-[11px]">{err}</span>
                            </label>
                          );
                        })}
                      </div>

                      <textarea
                        rows={2}
                        placeholder="오류가 발생한 상황을 조금 더 자세히 적어주시면 신속히 해결하겠습니다."
                        value={errorDetail}
                        onChange={(e) => setErrorDetail(e.target.value)}
                        className="w-full bg-white border border-red-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* 5. 정식 서비스 알림 (선택) */}
                <div className="space-y-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                  <label className="block text-indigo-900 font-bold">
                    💌 정식 서비스 출시 알림 & 무료 쿠폰 받기 (선택)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    이메일이나 연락처를 남겨주시면 정식 오픈 시 무료 이용 쿠폰을 보내드립니다.
                  </p>
                  <input
                    type="text"
                    placeholder="example@email.com 또는 연락처"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* 제출 버튼 */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submittingSurvey}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingSurvey ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>설문 제출 중...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>설문 제출하고 완료하기</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
