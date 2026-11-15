"use client";
// app/demo/chat/page.tsx
// 독립형 보이스봇(챗봇) 실전 음성 대화 & 억양/감정 인식 테스트실

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Mic, Square, Volume2, Sparkles, RefreshCw, ChevronLeft,
  ArrowRight, Activity, CheckCircle2, AlertCircle, Headphones,
  Send, X, MessageSquare, Play, RotateCcw
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

export default function DemoVoiceChatPage() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // 음성 파형 및 무음 감지 Ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        setAudioBlob(blob);
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
      };

      mediaRecorderRef.current.start();
      setRecording(true);
      speechFramesRef.current = 0;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      detectSilence();
    } catch (e) {
      alert("마이크 사용 권한을 허용해 주세요.");
    }
  };

  // ── 무음 감지 (발화 시작 확인 후 3초 무음 시 자연스러운 종료) ──
  const detectSilence = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
    const avg = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;

    if (avg > 18) {
      speechFramesRef.current += 1;
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
    } else {
      // 사용자가 실제로 말을 시작한 후(8프레임 이상) 무음이 3초간 지속되면 정지
      if (speechFramesRef.current >= 8 && !silenceTimer.current) {
        silenceTimer.current = setTimeout(stopRecording, 3000);
      }
    }
    animationFrameRef.current = requestAnimationFrame(detectSilence);
  };

  // ── 녹음 정지 ──
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    }
  };

  // ── 음성 대화 전송 (보이스봇 API 호출) ──
  const handleSendVoice = async () => {
    if (!audioBlob) return;
    setLoading(true);

    const fd = new FormData();
    fd.append("action", "chat");
    fd.append("audio", audioBlob, "recording.webm");
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
                억양·감정인식
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
        {/* 상단 페르소나 선택 바 */}
        <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-1">대화 상대:</span>
          {PERSONAS.map((p) => {
            const isSelected = selectedPersona.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPersona(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition shrink-0 ${
                  isSelected
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
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

        {/* 대화 스트림 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          <div className="text-center py-1">
            <span className="text-[11px] text-slate-400 bg-white border border-slate-200/60 px-3 py-1 rounded-full shadow-2xs font-medium">
              💡 마이크로 자유롭게 한국어로 말해보세요. AI가 억양과 기분을 인식합니다.
            </span>
          </div>

          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed relative group ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-none shadow-xs font-medium"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-xs"
                }`}
              >
                {msg.text}

                {/* AI 말풍선 음성 다시 듣기 */}
                {msg.role === "model" && (
                  <button
                    onClick={() => playModelAudio(msg.text, selectedPersona.id, msg.audio)}
                    className="absolute -right-8 top-2 bg-white border border-slate-200 rounded-full p-1.5 shadow-xs text-slate-500 hover:text-indigo-600 transition"
                    title="음성 다시 듣기"
                  >
                    <Volume2 size={13} />
                  </button>
                )}
              </div>

              {/* 🎙️ 사용자 억양 및 기분 분석 배지 */}
              {msg.role === "user" && msg.userMood && (
                <div className="mt-1.5 mr-1 max-w-[90%] flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200/80 px-3 py-1.5 rounded-xl shadow-2xs animate-in fade-in">
                  <span className="text-sm shrink-0">{msg.userMood.emoji || "🎙️"}</span>
                  <span className="text-indigo-700 font-black shrink-0">
                    기분: {msg.userMood.mood}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600 font-medium">
                    억양: {msg.userMood.intonation}
                  </span>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl w-fit shadow-xs animate-pulse">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-600">
                AI가 목소리와 억양을 분석하고 있어요... 🎧
              </span>
            </div>
          )}

          <div ref={chatScrollRef} />
        </div>

        {/* ── 하단 음성 발화 바 (Pure Voice-First) ── */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col items-center gap-3">
          {/* 1. 대기 상태: 대형 마이크 버튼 */}
          {!recording && !audioUrl && !loading && (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <button
                type="button"
                onClick={startRecording}
                className="w-18 h-18 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xl shadow-indigo-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition ring-4 ring-indigo-100"
                title="탭하여 한국어로 말하기"
              >
                <Mic size={32} className="stroke-[2.5]" />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 mt-1">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                <span>마이크를 누르고 한국어로 말해보세요</span>
              </div>
              <p className="text-[11px] text-slate-400">
                말이 끝나면 자동으로 분석되거나 탭하여 전송할 수 있습니다.
              </p>
            </div>
          )}

          {/* 2. 녹음 진행 중: 파형 + 정지 버튼 */}
          {recording && (
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
                className="w-16 h-16 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-200"
              >
                <Square size={22} className="fill-red-500 text-red-500" />
              </button>
              <span className="text-xs text-red-600 font-black animate-pulse">
                🎙️ 말씀하시는 중... (다 말씀하시면 탭하세요)
              </span>
            </div>
          )}

          {/* 3. 녹음 완료: 오디오 확인 및 전송 버튼 */}
          {audioUrl && !recording && !loading && (
            <div className="flex items-center gap-2.5 w-full animate-in slide-in-from-bottom">
              <button
                type="button"
                onClick={() => {
                  setAudioUrl(null);
                  setAudioBlob(null);
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1"
              >
                <RotateCcw size={14} /> 다시 말하기
              </button>
              <button
                type="button"
                onClick={handleSendVoice}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Send size={15} /> AI에게 음성 전송하기
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── 하단 설명 카드 ── */}
      <footer className="w-full max-w-lg mt-3 text-center text-xs text-slate-400 pb-4">
        <span>Sori-Tutor Voice Bot Testbed · Gemini Multimodal Tone & Emotion Analysis</span>
      </footer>
    </div>
  );
}
