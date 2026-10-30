"use client";
// app/components/UnivPortalPage.tsx
// 대학교 전용 발음 훈련 포털 (동국대 / 단국대)
// 학생은 QR 코드로 접속하여 인증 신청 -> 관리자 승인 후 전용 코스 무료 이용

import { useState, useEffect, useRef } from "react";
import { auth, db, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, updateDoc, collection, getDocs, addDoc,
  query, orderBy, serverTimestamp, setDoc
} from "firebase/firestore";
import {
  Volume2, Mic, Square, RefreshCw, ChevronLeft, ChevronRight,
  Sparkles, CheckCircle2, Clock, AlertCircle, Languages, Loader2, LogOut
} from "lucide-react";
import AudioWaveform from "./AudioWaveform";
import { playScoreFeedback, getTier } from "@/lib/scoreSound";
import { useFeedbackVoices } from "@/hooks/useFeedbackVoices";

export interface UnivPortalConfig {
  univKey: "dongguk" | "dankook";
  univName: "동국대학교" | "단국대학교";
  title: string;
  subTitle: string;
  logoEmoji: string;
  themeColor: "amber" | "blue";
  curriculumCollection: string;
  statusField: string;
  studentIdField: string;
  appliedAtField: string;
  sampleProblems: any[];
}

export default function UnivPortalPage({ config }: { config: UnivPortalConfig }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  // 인증 신청
  const [studentIdInput, setStudentIdInput] = useState("");
  const [applying, setApplying] = useState(false);

  // 문제 & 연습
  const [problemList, setProblemList] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingProblems, setLoadingProblems] = useState(false);

  // 녹음 & 분석
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  // 번역
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // 오디오 재생
  const [playingAudio, setPlayingAudio] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // 녹음 참조
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechFramesRef = useRef<number>(0);

  const feedbackVoices = useFeedbackVoices();

  const isAmber = config.themeColor === "amber";
  const primaryBg = isAmber ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700";
  const primaryText = isAmber ? "text-amber-600" : "text-blue-600";
  const primaryLightBg = isAmber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";

  // 1. Auth & 유저 정보 로드
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        await loadUserData(user.email);
      } else {
        setUserData(null);
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, []);

  const loadUserData = async (email: string) => {
    try {
      const userRef = doc(db, "sori_users", email);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setUserData(snap.data());
      } else {
        const initData = {
          email,
          name: currentUser?.displayName || "학습자",
          role: "guest",
          free_hearts: 3,
          tokens: 0,
          joined_at: serverTimestamp(),
        };
        await setDoc(userRef, initData);
        setUserData(initData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 2. 문제 목록 로드
  const loadProblems = async () => {
    setLoadingProblems(true);
    try {
      const snap = await getDocs(
        query(collection(db, config.curriculumCollection), orderBy("chapter", "asc"))
      );
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        list = config.sampleProblems;
      }
      setProblemList(list);
      setCurrentIndex(0);
      setResult(null);
      setTranslation(null);
      setAudioUrl(null);
      setAudioBlob(null);
    } catch (e) {
      console.error(e);
      setProblemList(config.sampleProblems);
    } finally {
      setLoadingProblems(false);
    }
  };

  const studentStatus = userData?.[config.statusField] ?? "none";

  useEffect(() => {
    if (studentStatus === "approved") {
      loadProblems();
    }
  }, [studentStatus]);

  // 구글 로그인
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  // 승인 신청
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.email) return;
    if (!studentIdInput.trim()) return alert("학번 또는 이름을 입력해 주세요.");
    setApplying(true);
    try {
      const userRef = doc(db, "sori_users", currentUser.email);
      await updateDoc(userRef, {
        [config.statusField]: "pending",
        [config.studentIdField]: studentIdInput.trim(),
        [config.appliedAtField]: serverTimestamp(),
      });
      await loadUserData(currentUser.email);
      alert("선생님께 인증 요청을 보냈습니다! ⏳\n선생님 확인이 완료되면 바로 학습이 가능합니다.");
    } catch (e) {
      console.error(e);
      alert("인증 요청 실패");
    } finally {
      setApplying(false);
    }
  };

  // 녹음 시작
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
        stream.getTracks().forEach(t => t.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
      };
      mediaRecorderRef.current.start();
      setRecording(true);
      setResult(null);
      speechFramesRef.current = 0;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      detectSilence();
    } catch (e) {
      alert("마이크 사용 권한을 허용해 주세요.");
    }
  };

  const detectSilence = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
    const avg = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
    if (avg > 15) {
      speechFramesRef.current += 1;
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
    } else {
      if (!silenceTimer.current) {
        silenceTimer.current = setTimeout(stopRecording, 1500);
      }
    }
    animationFrameRef.current = requestAnimationFrame(detectSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    }
  };

  // 발음 분석 (전액 무료 + 학생 학습 기록 자동 저장)
  const handleAnalyze = async () => {
    if (!audioBlob || !currentProblem) return;
    setAnalyzing(true);
    setResult(null);
    setTranslation(null);

    const formData = new FormData();
    formData.append("audio", audioBlob);
    formData.append("targetText", currentProblem.text);
    if (currentProblem.pronunciation) {
      formData.append("targetPronunciation", currentProblem.pronunciation);
    }
    formData.append("speechFrames", String(speechFramesRef.current));
    formData.append("userNick", userData?.alias || userData?.name || "학생");

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setResult(data);
        const isSilence = !data.recognized || data.recognized === "(침묵)" || data.recognized === "(잡음)";
        const tier = getTier(data.score, isSilence);
        const voiceUrl = feedbackVoices[tier] ?? null;
        playScoreFeedback(data.score, isSilence, voiceUrl).catch(() => {});

        // 학생 학습 기록(history) Firestore 저장 (관리자 페이지에서 확인 가능)
        if (currentUser?.email) {
          try {
            await addDoc(collection(db, "sori_users", currentUser.email, "history"), {
              text: currentProblem.text,
              pronunciation: currentProblem.pronunciation ?? "",
              chapter: currentProblem.chapter ?? 1,
              score: data.score,
              recognized: data.recognized,
              correct: data.correct,
              feedback: data.explanation,
              advice: data.advice,
              type: config.univKey,
              date: serverTimestamp(),
            });
          } catch (saveErr) {
            console.warn("History save error:", saveErr);
          }
        }
      }
    } catch (e) {
      alert("분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 피드백 무료 번역
  const handleTranslate = async () => {
    if (!result) return;
    setTranslating(true);
    try {
      const formData = new FormData();
      formData.append("action", "translate");
      formData.append("text", `Explanation: ${result.explanation}\nAdvice: ${result.advice}`);
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.translatedText) {
        setTranslation(data.translatedText);
      }
    } catch (e) {
      alert("번역 실패");
    } finally {
      setTranslating(false);
    }
  };

  // 정답 오디오 재생
  const handlePlayModelAudio = (url?: string, text?: string) => {
    if (playingAudio) {
      audioPlayerRef.current?.pause();
      setPlayingAudio(false);
      return;
    }
    if (url) {
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      setPlayingAudio(true);
      audio.onended = () => setPlayingAudio(false);
      audio.play().catch(() => setPlayingAudio(false));
    } else if (text && typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 0.85;
      setPlayingAudio(true);
      u.onend = () => setPlayingAudio(false);
      window.speechSynthesis.speak(u);
    }
  };

  const currentProblem = problemList[currentIndex];

  const handleNext = () => {
    if (currentIndex < problemList.length - 1) {
      setCurrentIndex(p => p + 1);
      setResult(null);
      setTranslation(null);
      setAudioUrl(null);
      setAudioBlob(null);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(p => p - 1);
      setResult(null);
      setTranslation(null);
      setAudioUrl(null);
      setAudioBlob(null);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={32} className={`animate-spin ${primaryText}`} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-xl">

        {/* ── 전용 상단 헤더 ── */}
        <header className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config.logoEmoji}</span>
            <div>
              <h1 className="font-black text-slate-800 text-sm leading-tight">{config.title}</h1>
              <p className="text-[10px] text-slate-400 font-bold">{config.subTitle}</p>
            </div>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-bold">
                {userData?.name || currentUser.displayName || "학생"}
              </span>
              <button
                onClick={() => signOut(auth)}
                className="text-slate-400 hover:text-slate-600 p-1"
                title="로그아웃"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </header>

        {/* ── 본문 콘텐츠 ── */}
        <main className="flex-1 p-5 flex flex-col">

          {/* 1. 비로그인 상태 */}
          {!currentUser && (
            <div className="my-auto text-center space-y-6 py-10 animate-in fade-in">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-4xl shadow-sm">
                {config.logoEmoji}
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-800">{config.univName} 한국어</h2>
                <p className="text-xs text-slate-500">
                  수업 학생 전용 발음 교정 & 억양 훈련실입니다.<br />
                  구글 계정으로 로그인 후 이용해 주세요.
                </p>
              </div>
              <button
                onClick={handleGoogleLogin}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-lg transition flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Google 계정으로 시작하기
              </button>
            </div>
          )}

          {/* 2. 로그인 완료 & 승인 전 (신청 필요) */}
          {currentUser && studentStatus === "none" && (
            <div className="my-auto space-y-6 animate-in fade-in">
              <div className={`p-6 rounded-3xl ${primaryLightBg} space-y-3`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{config.logoEmoji}</span>
                  <h2 className="text-lg font-black text-slate-800">학생 인증 요청</h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {config.univName} 수업 학생이신가요?<br />
                  선생님께서 학생 본인 여부를 확인할 수 있도록 <strong>학번(또는 반과 이름)</strong>을 입력해 주세요.
                </p>
              </div>

              <form onSubmit={handleApply} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    학번 (또는 반 / 이름) *
                  </label>
                  <input
                    value={studentIdInput}
                    onChange={e => setStudentIdInput(e.target.value)}
                    placeholder="예: 2026123456 (또는 1급 3반 마이클)"
                    required
                    className="w-full border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={applying}
                  className={`w-full py-4 text-white font-black text-sm rounded-2xl shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2 ${primaryBg}`}
                >
                  {applying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {applying ? "요청 전송 중..." : "선생님께 인증 요청하기"}
                </button>
              </form>
            </div>
          )}

          {/* 3. 승인 대기 중 (Pending) */}
          {currentUser && studentStatus === "pending" && (
            <div className="my-auto text-center space-y-6 py-8 animate-in fade-in">
              <div className="w-20 h-20 mx-auto rounded-full bg-amber-50 border-2 border-amber-300 flex items-center justify-center text-amber-500 animate-pulse">
                <Clock size={40} />
              </div>
              <div className="space-y-2">
                <span className="text-xs font-black bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                  승인 대기 중 ⏳
                </span>
                <h2 className="text-xl font-black text-slate-800">선생님 확인을 기다리고 있어요</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  선생님께서 어드민 페이지에서 인증을 승인해 주시면<br />
                  바로 전용 문장 발음 연습이 열립니다!
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-1">
                <p className="text-slate-400">신청 정보</p>
                <p className="font-bold text-slate-700">이메일: {currentUser.email}</p>
                <p className="font-bold text-slate-700">입력 학번/이름: {userData?.[config.studentIdField] || "미입력"}</p>
              </div>

              <button
                onClick={() => loadUserData(currentUser.email)}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} /> 승인 상태 새로고침
              </button>
            </div>
          )}

          {/* 4. 승인 완료 (Approved) -> 전용 발음 연습 화면 */}
          {currentUser && studentStatus === "approved" && (
            <div className="flex-1 flex flex-col justify-between space-y-4 animate-in fade-in">

              {loadingProblems ? (
                <div className="my-auto text-center py-20 text-slate-400">
                  <Loader2 size={32} className={`animate-spin mx-auto mb-2 ${primaryText}`} />
                  문장 불러오는 중...
                </div>
              ) : currentProblem ? (
                <>
                  {/* 상단 진행률 & 챕터 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                      {currentProblem.chapter ? `${currentProblem.chapter}과` : "전용 코스"}
                    </span>
                    <span className="text-slate-400 font-bold">
                      {currentIndex + 1} / {problemList.length} 문장
                    </span>
                  </div>

                  {/* 문장 카드 */}
                  <div className="bg-gradient-to-b from-white to-slate-50/50 p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-2xl font-black text-slate-900 leading-snug">
                        {currentProblem.text}
                      </h2>
                      <button
                        onClick={() => handlePlayModelAudio(currentProblem.audio_path, currentProblem.pronunciation || currentProblem.text)}
                        className={`p-3 rounded-2xl border transition shadow-sm shrink-0 ${
                          playingAudio ? "bg-indigo-600 text-white border-indigo-600 animate-pulse" : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        }`}
                        title="원어민 발음 듣기"
                      >
                        <Volume2 size={22} />
                      </button>
                    </div>

                    {/* 소리나는 대로 발음 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">소리:</span>
                      <span className="text-sm font-black text-emerald-600 tracking-wide">
                        {currentProblem.pronunciation || `[${currentProblem.text}]`}
                      </span>
                    </div>

                    {/* 쉬운 발음 규칙 공식 */}
                    {currentProblem.rule_formula && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-900 font-mono flex items-start gap-2">
                        <Sparkles size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">발음 공식: </span>
                          <span>{currentProblem.rule_formula}</span>
                        </div>
                      </div>
                    )}

                    {currentProblem.meaning_ko && (
                      <p className="text-xs text-slate-500">
                        💬 {currentProblem.meaning_ko}
                      </p>
                    )}
                  </div>

                  {/* 분석 결과 카드 */}
                  {result && (
                    <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-lg space-y-3 animate-in slide-in-from-bottom">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-indigo-600">{result.score}점</span>
                          <span className="text-xs text-slate-400">
                            {result.score >= 80 ? "🎉 훌륭해요!" : result.score >= 60 ? "👍 좋아요!" : "💪 다시 해봐요!"}
                          </span>
                        </div>
                        <button
                          onClick={handleTranslate}
                          disabled={translating}
                          className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg transition"
                        >
                          <Languages size={12} />
                          {translating ? "번역 중..." : "무료 번역"}
                        </button>
                      </div>

                      {result.recognized && (
                        <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-slate-400 block mb-0.5">인식된 소리:</span>
                          <span className="font-bold text-slate-800">{result.recognized}</span>
                        </div>
                      )}

                      {result.explanation && (
                        <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                          {result.explanation}
                        </p>
                      )}

                      {translation && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 whitespace-pre-wrap">
                          <p className="font-bold mb-1">🌐 번역 피드백:</p>
                          {translation}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 녹음 & 제어 영역 */}
                  <div className="space-y-3 pt-2">
                    {/* 오디오 웨이브폼 */}
                    {recording && (
                      <div className="h-14 flex items-center justify-center">
                        <AudioWaveform isRecording={true} analyser={analyserRef.current} />
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="p-3.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 disabled:opacity-30 transition"
                        title="이전 문장"
                      >
                        <ChevronLeft size={20} />
                      </button>

                      {!recording ? (
                        <button
                          onClick={startRecording}
                          disabled={analyzing}
                          className={`flex-1 py-4 text-white font-black text-base rounded-2xl shadow-lg transition flex items-center justify-center gap-2 ${primaryBg} disabled:opacity-50`}
                        >
                          <Mic size={20} />
                          {audioBlob ? "다시 말하기" : "발음 연습하기"}
                        </button>
                      ) : (
                        <button
                          onClick={stopRecording}
                          className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white font-black text-base rounded-2xl shadow-lg transition flex items-center justify-center gap-2 animate-pulse"
                        >
                          <Square size={20} /> 녹음 멈추기
                        </button>
                      )}

                      <button
                        onClick={handleNext}
                        disabled={currentIndex === problemList.length - 1}
                        className="p-3.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 disabled:opacity-30 transition"
                        title="다음 문장"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    {/* 녹음 완료 후 채점 받기 버튼 */}
                    {audioBlob && !recording && !result && (
                      <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {analyzing ? "AI 발음 채점 중..." : "AI 발음 채점 받기 (무료)"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="my-auto text-center py-20 text-slate-400">
                  등록된 문장이 없습니다.
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
