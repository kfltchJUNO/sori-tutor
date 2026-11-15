"use client";
// app/admin/VoiceBotAdminSection.tsx
// 최고 관리자 전용: 보이스봇(실전 회화 & 억양/감정 분석) 통합 관리 & 실시간 시뮬레이터 & 5턴 설문 통계
// 1. [🎙️ 보이스봇 시뮬레이터]: 어드민에서 마이크로 직접 말해보고 Gemini 억양/기분 유추, STT, AI 답변, 음성 합성 레이턴시 실시간 측정
// 2. [📊 5턴 체험 설문조사 통계]: 기본사항, 만족도, 좋았던 점, 아쉬웠던 점, 오류 제보 내역 및 CSV 추출
// 3. [👥 페르소나 4인방 프롬프트]: 준호, 채원, 민우, 유진의 성격, 말투 지침, 보이스 매핑 정보 확인
// 4. [⚡ 엔진 & 속도 최적화]: Single-pass 음성+감정 추론, ElevenLabs mp3_22050_32, 3.5s 서킷 브레이커 구조
// 5. [📱 테스트실 배포 & QR]: /demo/chat 공개 링크 복사 및 QR코드 다운로드

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Mic, Square, Volume2, Sparkles, RefreshCw, QrCode,
  ExternalLink, Copy, Check, Play, RotateCcw, Send,
  Activity, Zap, ShieldCheck, Heart, User, CheckCircle2,
  Clock, Award, Headphones, AlertCircle, ArrowRight,
  MessageSquare, Star, Download, Filter, AlertTriangle
} from "lucide-react";
import { PERSONAS, Persona } from "@/types";
import AudioWaveform from "@/app/components/AudioWaveform";
import { adminFetch } from "@/lib/firebase";
import type { VoiceBotSurveyDoc } from "@/app/api/demo/chat/survey/route";

interface Props {
  idToken: string;
}

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
  latencyMs?: number;
  timestamp?: number;
}

const PERSONA_META: Record<
  string,
  {
    avatar: string;
    gender: "남성" | "여성";
    personality: string;
    promptContext: string;
  }
> = {
  junho: {
    avatar: "👨‍💼",
    gender: "남성",
    personality: "차분하고 예의 바른 24세 대학생 선배, 면접/존댓말 특화",
    promptContext: "정중하고 격식 있는 존댓말로 상대방을 대하며, 취업/면접/직장 예절 상황에 맞춰 차분하게 경청하고 조언합니다.",
  },
  chaewon: {
    avatar: "👩‍💼",
    gender: "여성",
    personality: "발랄하면서도 똑 부러진 21세 동아리장, 또렷한 표준어 높임말",
    promptContext: "교수님이나 공식 석상에서 사용하는 세련된 높임말과 명확한 억양을 구사하며, 비즈니스 및 격식 대화 연습을 돕습니다.",
  },
  minwoo: {
    avatar: "🧑‍💻",
    gender: "남성",
    personality: "유쾌하고 긍정적인 20대 남사친, 편안하고 자연스러운 반말",
    promptContext: "또래 친구처럼 편안한 반말로 K-컬처, 맛집, 대학 생활 이야기를 나누며 자연스러운 한국어 구어체 실력을 길러줍니다.",
  },
  yujin: {
    avatar: "👩‍🎨",
    gender: "여성",
    personality: "다정하고 공감 넘치는 단짝 여사친, 따뜻한 리액션과 반말",
    promptContext: "사용자의 사소한 일상과 고민에도 깊이 공감해주며, 친근하고 따뜻한 어조로 친구와 카페에서 수다 떨듯 대화합니다.",
  },
};

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

export default function VoiceBotAdminSection({ idToken }: Props) {
  const [subTab, setSubTab] = useState<"simulator" | "surveys" | "personas" | "engine" | "share">("simulator");
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [origin, setOrigin] = useState("");
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  // 설문조사 관리 상태
  const [surveys, setSurveys] = useState<VoiceBotSurveyDoc[]>([]);
  const [surveyStats, setSurveyStats] = useState<any>(null);
  const [loadingSurveys, setLoadingSurveys] = useState(false);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const voiceBotUrl = origin ? `${origin}/demo/chat` : "/demo/chat";
  const voiceBotQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
    voiceBotUrl
  )}`;

  // 설문 데이터 로드
  const loadSurveys = useCallback(async () => {
    if (!idToken) return;
    setLoadingSurveys(true);
    try {
      const res = await adminFetch("/api/demo/chat/survey", { method: "GET" }, idToken);
      const data = await res.json();
      if (res.ok && data.surveys) {
        setSurveys(data.surveys);
        setSurveyStats(data.stats);
      }
    } catch (e) {
      console.error("보이스봇 설문 목록 로드 실패:", e);
    } finally {
      setLoadingSurveys(false);
    }
  }, [idToken]);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  // CSV 다운로드
  const downloadSurveyCsv = () => {
    if (surveys.length === 0) {
      alert("다운로드할 설문 응답 내역이 없습니다.");
      return;
    }

    const headers = [
      "일시",
      "모국어",
      "한국어수준",
      "페르소나",
      "만족도(5점)",
      "반응속도",
      "억양감정정확도",
      "좋았던점",
      "좋았던점상세",
      "아쉬웠던점",
      "아쉬웠던점상세",
      "오류여부",
      "오류유형",
      "오류상세",
      "연락처",
      "IP",
    ];

    const rows = surveys.map((s) => [
      formatDateTime(s.createdAt),
      s.nativeLanguage || "",
      s.koreanLevel || "",
      s.personaName || "",
      s.satisfaction,
      s.latencyRating || "",
      s.emotionAccuracy || "",
      (s.goodPoints || []).join(" / "),
      (s.goodPointComment || "").replace(/\n/g, " "),
      (s.badPoints || []).join(" / "),
      (s.badPointComment || "").replace(/\n/g, " "),
      s.experiencedError ? "오류발생" : "정상",
      (s.errorTypes || []).join(" / "),
      (s.errorDetail || "").replace(/\n/g, " "),
      s.contactEmail || "",
      s.clientIp || "",
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.map((h) => `"${h}"`).join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `소리튜터_보이스봇_설문결과_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 자동 스크롤
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

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
      console.warn("Web Speech API error:", e);
    }
  }, []);

  // 녹음 시작
  const startRecording = async () => {
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
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {});
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);

      // 무음 감지 루프
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const detectSilence = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
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
      alert("마이크 접근 권한이 필요합니다: " + e.message);
    }
  };

  // 녹음 중지
  const stopRecording = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  // 음성 전송 및 분석
  const handleSendVoice = async () => {
    if (!audioBlob) return;
    setLoading(true);
    const startMs = Date.now();

    try {
      const formData = new FormData();
      formData.append("action", "chat");
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("persona", selectedPersona.id);
      formData.append(
        "history",
        JSON.stringify(
          chatHistory.map((m) => ({
            role: m.role,
            text: m.text,
          }))
        )
      );

      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "응답 생성 중 오류가 발생했습니다.");
      }

      const data = await res.json();
      const elapsed = Date.now() - startMs;
      setLastLatency(elapsed);

      const userText = data.userText || "음성 메시지";
      const modelText = data.aiText || data.text || "";
      const mime = data.audioFormat || "audio/mp3";
      const modelAudio = data.audioContent
        ? `data:${mime};base64,${data.audioContent}`
        : null;
      const userMood = data.userMood || null;

      setChatHistory((prev) => [
        ...prev,
        {
          role: "user",
          text: userText,
          userMood,
          timestamp: Date.now(),
        },
        {
          role: "model",
          text: modelText,
          audio: modelAudio,
          latencyMs: elapsed,
          timestamp: Date.now(),
        },
      ]);

      setAudioUrl(null);
      setAudioBlob(null);

      // AI 음성 재생
      if (modelAudio) {
        const snd = new Audio(modelAudio);
        snd.play().catch(() => {
          speakWithBrowserTTS(modelText, selectedPersona.id);
        });
      } else {
        speakWithBrowserTTS(modelText, selectedPersona.id);
      }
    } catch (e: any) {
      alert("전송 실패: " + (e.message || "오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const copyVoiceBotLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(voiceBotUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const activeMeta = PERSONA_META[selectedPersona.id] || {
    avatar: "👤",
    gender: "남성",
    personality: selectedPersona.desc,
    promptContext: selectedPersona.desc,
  };

  return (
    <div className="space-y-6">
      {/* ── 1. 최상단 헤더 배너 ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-radial from-indigo-500/20 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wide bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-xs">
                VOICE-FIRST AI
              </span>
              <span className="text-xs text-indigo-300 font-medium">실전 한국어 말하기 & 억양 감정 분석</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2 text-white">
              🎙️ 보이스봇 관리 & 실시간 테스트실
            </h2>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              텍스트 채팅창을 배제하고 100% 음성으로만 진행되는 실전 회화 엔진입니다. 5턴 대화 후 자동 종료 안내 및 설문조사를 수집하여 정식 서비스 완성도를 높입니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/demo/chat"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/30 transition cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>/demo/chat 새 창 열기</span>
            </Link>
            <button
              type="button"
              onClick={copyVoiceBotLink}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10 cursor-pointer"
            >
              {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedLink ? "링크 복사됨!" : "링크 복사"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. 서브 탭 ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setSubTab("simulator")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            subTab === "simulator"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Mic size={14} />
          <span>🎙️ 실시간 시뮬레이터</span>
        </button>
        <button
          onClick={() => {
            setSubTab("surveys");
            loadSurveys();
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            subTab === "surveys"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <MessageSquare size={14} />
          <span>📊 설문 응답 & 피드백 ({surveys.length})</span>
        </button>
        <button
          onClick={() => setSubTab("personas")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            subTab === "personas"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <User size={14} />
          <span>👥 4인 페르소나 설정</span>
        </button>
        <button
          onClick={() => setSubTab("engine")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            subTab === "engine"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Zap size={14} />
          <span>⚡ 엔진 & 속도 최적화</span>
        </button>
        <button
          onClick={() => setSubTab("share")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            subTab === "share"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <QrCode size={14} />
          <span>📱 배포 & QR코드</span>
        </button>
      </div>

      {/* ── 3. 탭별 콘텐츠 ── */}

      {/* ── SUBTAB 1: 실시간 시뮬레이터 ── */}
      {subTab === "simulator" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 페르소나 선택 및 제어판 */}
          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="font-black text-sm text-slate-900 flex items-center justify-between">
                <span>페르소나 파트너 선택</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  {activeMeta.gender} 음성
                </span>
              </h3>

              <div className="grid grid-cols-2 gap-2">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona.id === p.id;
                  const meta = PERSONA_META[p.id] || { avatar: "👤", gender: "남성", personality: p.desc };
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersona(p)}
                      className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? "bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-200"
                          : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.avatar}</span>
                        <div>
                          <div className="text-xs font-black text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{p.speechStyle === "honorific" ? "존댓말" : "반말"}</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">
                        {p.role}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 현재 선택된 페르소나 프롬프트 특성 */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-500" />
                  <span>{selectedPersona.name}의 대화 특징</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {activeMeta.promptContext}
                </p>
                <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-200">
                  <span>Voice ID: {selectedPersona.elevenVoiceId ? "ElevenLabs" : "Gemini TTS"}</span>
                  <span>최대 2문장 구어체 답변</span>
                </div>
              </div>

              {/* 성능 모니터링 배지 */}
              {lastLatency && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span className="flex items-center gap-1">
                    <Clock size={13} className="text-emerald-600" /> 최근 턴 반응 속도
                  </span>
                  <span className="font-mono text-emerald-700">{(lastLatency / 1000).toFixed(2)}s</span>
                </div>
              )}
            </div>

            {/* 초기화 버튼 */}
            {chatHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("대화 기록을 모두 초기화하시겠습니까?")) {
                    setChatHistory([]);
                    setLastLatency(null);
                  }
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>시뮬레이터 대화 기록 초기화</span>
              </button>
            )}
          </div>

          {/* 우측: 대화창 및 실시간 마이크 컨트롤 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[640px] overflow-hidden">
            {/* 시뮬레이터 상단 바 */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeMeta.avatar}</span>
                <div>
                  <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span>{selectedPersona.name} ({selectedPersona.role})</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-[10px] text-slate-500">
                    실시간 억양 & 감정 유추 활성화 (Gemini Multimodal JSON)
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200">
                Turn Count: {chatHistory.filter((m) => m.role === "user").length}
              </span>
            </div>

            {/* 대화 내역 스크롤 */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Mic size={22} />
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    아래 마이크 버튼을 눌러 한국어로 말을 걸어보세요.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm">
                    사용자의 목소리 톤(자신감, 기쁨, 당황, 우울 등)과 억양을 실시간으로 분석하여 카드 형태로 표기하고 감정에 맞게 화답합니다.
                  </p>
                </div>
              )}

              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } space-y-1`}
                >
                  {/* 발화자 이름 */}
                  <span className="text-[10px] text-slate-400 px-1 font-medium">
                    {msg.role === "user" ? "나 (테스터)" : selectedPersona.name}
                  </span>

                  {/* 감정/억양 배지 (사용자 발화에 부착) */}
                  {msg.role === "user" && msg.userMood && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-200/80 rounded-xl text-[11px] font-bold text-indigo-950 mb-0.5 shadow-xs">
                      <span>{msg.userMood.emoji || "🎭"}</span>
                      <span className="text-indigo-700 font-black">
                        유추된 기분: {msg.userMood.mood}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-600 font-medium">
                        억양: {msg.userMood.intonation}
                      </span>
                    </div>
                  )}

                  {/* 말풍선 본문 */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-tr-xs"
                        : "bg-white text-slate-800 border border-slate-200 rounded-tl-xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>

                  {/* 봇 답변 부가정보: 레이턴시 & 음성 다시듣기 */}
                  {msg.role === "model" && (
                    <div className="flex items-center gap-2 px-1 text-[10px] text-slate-400">
                      {msg.latencyMs && (
                        <span>응답 속도: {(msg.latencyMs / 1000).toFixed(2)}s</span>
                      )}
                      {msg.audio && (
                        <button
                          type="button"
                          onClick={() => {
                            if (msg.audio) {
                              new Audio(msg.audio).play().catch(() => {});
                            }
                          }}
                          className="hover:text-indigo-600 flex items-center gap-0.5 font-bold cursor-pointer"
                        >
                          <Volume2 size={11} /> 다시듣기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* 분석 로딩 중 상태 */}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                    {activeMeta.avatar}
                  </div>
                  <div className="p-3 bg-white rounded-2xl rounded-tl-xs border border-indigo-200 shadow-xs flex items-center gap-2 text-xs text-indigo-900 font-bold">
                    <RefreshCw size={13} className="animate-spin text-indigo-600" />
                    <span>억양/감정 유추 및 맞춤 답변 생성 중...</span>
                  </div>
                </div>
              )}
            </div>

            {/* 시뮬레이터 마이크 하단 컨트롤 */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-col items-center justify-center gap-2">
              {!recording && !audioUrl && !loading && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 transition cursor-pointer"
                  >
                    <Mic size={18} />
                    <span>마이크 켜고 직접 말해보기</span>
                  </button>
                </div>
              )}

              {recording && (
                <div className="flex flex-col items-center gap-2 w-full animate-in fade-in">
                  <AudioWaveform
                    analyser={analyserRef.current}
                    isRecording={recording}
                    className="mb-1"
                    barColor="#6366f1"
                  />
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md animate-pulse cursor-pointer"
                  >
                    <Square size={14} className="fill-white" />
                    <span>말씀 완료 (정지 & 분석)</span>
                  </button>
                </div>
              )}

              {audioUrl && !recording && !loading && (
                <div className="flex items-center gap-2 w-full max-w-md animate-in slide-in-from-bottom">
                  <button
                    type="button"
                    onClick={() => {
                      setAudioUrl(null);
                      setAudioBlob(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={13} /> 다시 녹음
                  </button>
                  <button
                    type="button"
                    onClick={handleSendVoice}
                    className="flex-[2] py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Send size={14} /> AI 분석 & 전송
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUBTAB 2: 설문 응답 & 피드백 통계 ── */}
      {subTab === "surveys" && (
        <div className="space-y-6">
          {/* 상단 액션 바 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <MessageSquare className="text-indigo-600" />
                보이스봇 5턴 체험 설문조사 통계 ({surveys.length}건)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                체험자가 남긴 기본사항, 좋았던 점, 아쉬웠던 점, 시스템 오류 제보 내역입니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadSurveys}
                disabled={loadingSurveys}
                className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw size={13} className={loadingSurveys ? "animate-spin" : ""} />
                <span>새로고침</span>
              </button>
              <button
                type="button"
                onClick={downloadSurveyCsv}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md transition cursor-pointer"
              >
                <Download size={13} />
                <span>CSV 다운로드</span>
              </button>
            </div>
          </div>

          {/* 통계 요약 카드 4개 */}
          {surveyStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <span className="text-[11px] text-slate-400 font-bold block">총 설문 응답</span>
                <div className="text-2xl font-black text-slate-900 mt-1">{surveyStats.totalCount}명</div>
                <span className="text-[10px] text-indigo-600 font-bold">5턴 완주자 설문</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <span className="text-[11px] text-slate-400 font-bold block">평균 대화 만족도</span>
                <div className="text-2xl font-black text-amber-500 mt-1 flex items-center gap-1">
                  <Star size={20} className="fill-amber-400 text-amber-400" />
                  <span>{surveyStats.avgSatisfaction} / 5.0</span>
                </div>
                <span className="text-[10px] text-slate-400">전반적 음성 대화 만족</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <span className="text-[11px] text-slate-400 font-bold block">오류 보고율</span>
                <div className="text-2xl font-black text-red-600 mt-1">{surveyStats.errorRate}%</div>
                <span className="text-[10px] text-slate-500 font-medium">총 {surveyStats.errorCount}건 오류 제보</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <span className="text-[11px] text-slate-400 font-bold block">가장 많은 칭찬</span>
                <div className="text-xs font-black text-indigo-700 mt-1 line-clamp-2">
                  {Object.entries(surveyStats.goodCounts || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "데이터 수집 중"}
                </div>
              </div>
            </div>
          )}

          {/* 좋았던 점 & 아쉬운 점 랭킹 비교 */}
          {surveyStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 좋았던 점 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                  <span className="text-emerald-500">🌸</span>
                  <span>학습자가 꼽은 좋았던 점 순위</span>
                </h4>
                <div className="space-y-2">
                  {Object.entries(surveyStats.goodCounts || {})
                    .sort((a: any, b: any) => b[1] - a[1])
                    .map(([point, count]: [string, any], idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-medium truncate max-w-[80%]">{point}</span>
                          <span className="font-bold text-emerald-600 font-mono">{count}표</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (count / Math.max(1, surveyStats.totalCount)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  {Object.keys(surveyStats.goodCounts || {}).length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">아직 접수된 데이터가 없습니다.</div>
                  )}
                </div>
              </div>

              {/* 아쉬웠던 점 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                  <span className="text-amber-500">⚠️</span>
                  <span>개선이 필요한 아쉬웠던 점 순위</span>
                </h4>
                <div className="space-y-2">
                  {Object.entries(surveyStats.badCounts || {})
                    .sort((a: any, b: any) => b[1] - a[1])
                    .map(([point, count]: [string, any], idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-medium truncate max-w-[80%]">{point}</span>
                          <span className="font-bold text-amber-600 font-mono">{count}표</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (count / Math.max(1, surveyStats.totalCount)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  {Object.keys(surveyStats.badCounts || {}).length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">아직 접수된 데이터가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 설문 상세 목록 테이블 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-black text-sm text-slate-900">최근 설문 응답 상세 ({surveys.length}건)</h4>
              <span className="text-xs text-slate-400 font-medium">최신순 정렬</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">일시</th>
                    <th className="p-3">모국어 / 수준</th>
                    <th className="p-3">페르소나</th>
                    <th className="p-3">만족도</th>
                    <th className="p-3">반응속도 / 억양유추</th>
                    <th className="p-3">좋았던 점 & 아쉬운 점</th>
                    <th className="p-3">오류 여부</th>
                    <th className="p-3">알림 연락처</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {surveys.map((s, idx) => (
                    <tr key={s.id || idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900">{s.nativeLanguage}</span>
                        <span className="block text-[10px] text-slate-400">{s.koreanLevel}</span>
                      </td>
                      <td className="p-3 font-bold text-indigo-700 whitespace-nowrap">
                        {s.personaName}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                          <Star size={13} className="fill-amber-400" />
                          <span>{s.satisfaction}점</span>
                        </span>
                      </td>
                      <td className="p-3 text-[11px] whitespace-nowrap">
                        <div>속도: <span className="font-bold">{s.latencyRating}</span></div>
                        <div className="text-slate-400">억양: {s.emotionAccuracy}</div>
                      </td>
                      <td className="p-3 max-w-xs space-y-1">
                        {s.goodPoints && s.goodPoints.length > 0 && (
                          <div className="text-[11px] text-emerald-800 line-clamp-1">
                            <span className="font-bold">좋음:</span> {s.goodPoints.join(", ")}
                          </div>
                        )}
                        {s.badPoints && s.badPoints.length > 0 && (
                          <div className="text-[11px] text-amber-800 line-clamp-1">
                            <span className="font-bold">아쉬움:</span> {s.badPoints.join(", ")}
                          </div>
                        )}
                        {s.badPointComment && (
                          <p className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100 italic">
                            &quot;{s.badPointComment}&quot;
                          </p>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {s.experiencedError ? (
                          <div className="space-y-0.5">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-700">
                              오류 제보
                            </span>
                            {s.errorDetail && (
                              <p className="text-[10px] text-red-600 max-w-[140px] truncate" title={s.errorDetail}>
                                {s.errorDetail}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            원활함
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] font-mono text-slate-600 whitespace-nowrap">
                        {s.contactEmail ? (
                          <span className="text-indigo-600 font-bold">{s.contactEmail}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {surveys.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        아직 수집된 보이스봇 설문 응답이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBTAB 3: 4인 페르소나 설정 및 프롬프트 상세 ── */}
      {subTab === "personas" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-1">
            <h3 className="font-black text-base text-slate-900">
              👥 한국인 친구 4인방 페르소나 상세 설정
            </h3>
            <p className="text-xs text-slate-500">
              학습자가 지루하지 않게 다양한 연령대, 성별, 성향의 원어민과 대화할 수 있도록 설계된 4종 페르소나입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERSONAS.map((p) => {
              const meta = PERSONA_META[p.id] || { avatar: "👤", gender: "남성", personality: p.desc, promptContext: p.desc };
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-3xl p-2 bg-slate-50 rounded-2xl border border-slate-100">
                        {meta.avatar}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-slate-900">{p.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {meta.gender}
                          </span>
                        </div>
                        <span className="text-xs text-indigo-600 font-bold">{p.role}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                      ID: {p.id}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-700 block mb-0.5">성격 및 캐릭터 키워드</span>
                      <span className="text-slate-600 bg-slate-50 p-2 rounded-lg block text-[11px] border border-slate-100">
                        {meta.personality}
                      </span>
                    </div>

                    <div>
                      <span className="font-bold text-slate-700 block mb-0.5">주요 프롬프트 가이드 (Prompt Context)</span>
                      <p className="text-slate-600 bg-indigo-50/50 p-2.5 rounded-lg text-[11px] leading-relaxed border border-indigo-100">
                        {meta.promptContext}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">음성 합성 엔진</span>
                        <span className="font-bold text-slate-800">
                          {p.elevenVoiceId ? "ElevenLabs 한국어 모델" : "Gemini TTS 한국어"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">권장 응답 길이</span>
                        <span className="font-bold text-slate-800">1~2문장 (최대 120토큰)</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SUBTAB 4: 엔진 & 속도 최적화 현황 ── */}
      {subTab === "engine" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-1">
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
              <Zap className="text-amber-500" /> 보이스봇 처리 파이프라인 & 속도 최적화 구조
            </h3>
            <p className="text-xs text-slate-500">
              반응 속도(Latency)와 대화의 자연스러움을 극대화하기 위해 적용된 5가지 핵심 기술 스택입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">1</span>
                <span>Single-Pass STT + 억양 + 감정 분석</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                사용자의 음성 파일(WebM/WAV)을 전달받아 Gemini 2.5/Flash Multimodal 1회 호출로 <strong>STT 전사(텍스트), 유추된 기분(Mood), 억양(Intonation) 분석</strong>을 동시에 JSON으로 추출합니다. API 왕복 횟수를 1회로 줄여 STT+감정 분석을 1.2초 내에 완료합니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">2</span>
                <span>감정 연계형 즉각 공감 (Empathy Injection)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                유추된 사용자 감정(예: <code>기쁨</code>, <code>피로/지침</code>, <code>자신감 부족</code>)을 페르소나 시스템 프롬프트에 실시간 주입합니다. 페르소나는 사용자의 기분을 알아채고 자연스러운 리액션을 먼저 건넵니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">3</span>
                <span>ElevenLabs mp3_22050_32 스트리밍 최적화</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ElevenLabs TTS 호출 시 <code>output_format=mp3_22050_32</code> 옵션을 사용하여 오디오 전송 용량을 40% 이상 경량화했습니다. 모바일 네트워크에서도 버퍼링 없이 즉시 재생됩니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">4</span>
                <span>3.5초 서킷 브레이커 & Gemini TTS 폴백</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                해외망 통신 등으로 인해 ElevenLabs 응답이 3.5초 이상 지연되거나 Quota가 소진될 경우, 서킷 브레이커가 작동하여 즉각 무료 Gemini TTS 또는 브라우저 Web Speech로 자동 우회하여 멈춤 없는 대화를 보장합니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBTAB 5: 공개 배포 & QR코드 ── */}
      {subTab === "share" && (
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 text-center">
          <div>
            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-[11px] font-black rounded-full">
              모바일 & PC 즉시 접속
            </span>
            <h3 className="font-black text-lg text-slate-950 mt-2">
              보이스봇 전용 테스트실 배포 QR & 링크
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              테스터나 학생들에게 아래 QR코드나 링크를 전달하면 별도 로그인 없이 5턴 실전 음성 대화를 테스트할 수 있습니다.
            </p>
          </div>

          {/* QR 코드 이미지 */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={voiceBotQrUrl}
              alt="보이스봇 테스트실 QR코드"
              className="w-56 h-56 mx-auto rounded-xl bg-white"
            />
          </div>

          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-slate-700 block">테스트실 직통 URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={voiceBotUrl}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all"
              />
              <button
                type="button"
                onClick={copyVoiceBotLink}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
              >
                {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedLink ? "복사됨!" : "링크 복사"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link
              href="/demo/chat"
              target="_blank"
              rel="noreferrer"
              className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={14} /> 새 창에서 직접 체험
            </Link>
            <a
              href={voiceBotQrUrl}
              download="소리튜터_보이스봇_테스트QR.png"
              className="py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <QrCode size={14} /> QR 이미지 저장
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
