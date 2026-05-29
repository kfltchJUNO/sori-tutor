"use client";

// app/page.tsx — 묶음 A~E 전체 통합본
// 변경 요약:
//   A: 토큰 조작 → useTokenTransaction(서버 API), 관리자 이메일 하드코딩 제거
//   B: AdModal → CheckinModal (출석 체크 방식)
//   C: useCurriculum SWR 캐싱, HomeView/PracticeView 분리
//   D: 없음 (admin 페이지 전용)
//   E: LicenseModal + useDeepLink, purchasedSteps 상태

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Login from "./components/Login";
import CheckinModal from "./components/CheckinModal";
import LicenseModal, { useDeepLink } from "./components/LicenseModal";
import HomeView from "./components/views/HomeView";
import PracticeView from "./components/views/PracticeView";

import { db, auth } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, setDoc, collection, getDocs, query, where,
  addDoc, serverTimestamp, orderBy, updateDoc, increment,
  limit, writeBatch, arrayUnion,
} from "firebase/firestore";
import {
  Mic, MessageSquare, Trophy, X, ChevronLeft, Star, Heart, Coins,
  Volume2, Info, CheckCircle, Send, MessageCircle, Languages, Crown,
  Headphones, Save, History, PieChart, TrendingDown, BookOpen, Mail,
} from "lucide-react";
import { useTokenTransaction } from "@/hooks/useTokenTransaction";
import { useCurriculum } from "@/hooks/useCurriculum";
import { useFeedbackVoices } from "@/hooks/useFeedbackVoices";
import { playScoreFeedback, getTier } from "@/lib/scoreSound";
import LandingPage from "./components/LandingPage";
import AdUnit from "./components/AdUnit";

// ────────────────────────────────────────
const WELCOME_MESSAGE = {
  id: "welcome-guide",
  from: "소리튜터 운영진",
  title: "🎉 소리튜터에 오신 것을 환영합니다! (사용 설명서 포함)",
  date: new Date(),
  read: true,
  content: `안녕하세요, 새로운 학습자님! 👋\n\n소리튜터(Sori-Tutor)는 AI와 함께 발음을 교정하고 회화를 연습하는 공간입니다.`,
};

const PERSONAS = [
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
];

// ────────────────────────────────────────
export default function Home() {
  // ── 인증 ──────────────────────────────
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [userRole, setUserRole] = useState("guest");
  const [hearts, setHearts] = useState(3);
  const [tokens, setTokens] = useState(0);
  const [userAlias, setUserAlias] = useState("");
  const [streak, setStreak] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [sharedMemory, setSharedMemory] = useState("");
  const [chatCount, setChatCount] = useState(0);

  // ── E: 교재 연계 ──────────────────────
  const [purchasedSteps, setPurchasedSteps] = useState<number[]>([]);
  const [showLicenseModal, setShowLicenseModal] = useState(false);

  // ── B: 체크인 (AdModal 교체) ──────────
  const [showCheckinModal, setShowCheckinModal] = useState(false);

  // ── 메일함 ────────────────────────────
  const [inboxList, setInboxList] = useState<any[]>([]);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [inboxTab, setInboxTab] = useState<"received" | "write">("received");
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [hasNewMail, setHasNewMail] = useState(false);
  const [inquiryCategory, setInquiryCategory] = useState("bug");
  const [inquiryContent, setInquiryContent] = useState("");

  // ── 결제/토큰 ─────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [tokenLogs, setTokenLogs] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<"earn" | "spend">("earn");
  const [showSpendStats, setShowSpendStats] = useState(false);

  // ── 모달 플래그 ───────────────────────
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [rankingList, setRankingList] = useState<any[]>([]);
  const [showPersonaRanking, setShowPersonaRanking] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<any>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  const [selectedWordData, setSelectedWordData] = useState<any>(null);

  // ── 뷰 / 코스 ─────────────────────────
  const [viewMode, setViewMode] = useState("home");
  const [courseType, setCourseType] = useState<"word" | "sentence" | "dialogue" | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [problemList, setProblemList] = useState<any[]>([]);
  const [currentProblem, setCurrentProblem] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ── 연습 ──────────────────────────────
  const [result, setResult] = useState<any>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [parsedScript, setParsedScript] = useState<{ role: string; text: string }[]>([]);
  const [myRole, setMyRole] = useState<"A" | "B">("A");
  const [targetLineIndex, setTargetLineIndex] = useState<number | null>(null);
  const [completedLines, setCompletedLines] = useState<number[]>([]);
  const [isShadowingMode, setIsShadowingMode] = useState(false);

  // ── 회화 ──────────────────────────────
  const [chatStatus, setChatStatus] = useState<"select_persona" | "active" | "ended">("select_persona");
  const [selectedPersona, setSelectedPersona] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [chatFeedback, setChatFeedback] = useState<any>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ── 히스토리 ──────────────────────────
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyTabState, setHistoryTabState] = useState<"all" | "word" | "sentence" | "dialogue" | "free_talking">("all");

  // ── 오디오/녹음 ───────────────────────
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 훅 ────────────────────────────────
  const { spendToken, claimCheckin } = useTokenTransaction();
  const feedbackVoices = useFeedbackVoices();

  // ── E: 딥링크 처리 ──────────────────
  useDeepLink(async (step, unit) => {
    if (!currentUser) return;
    // step/unit 필터링해서 바로 연습 모드로 이동
    try {
      const snap = await getDocs(
        query(
          collection(db, "sori_curriculum_word"),
          where("step", "==", step),
          where("unit", "==", unit)
        )
      );
      if (!snap.empty) {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProblemList(list);
        setCourseType("word");
        initPractice(list);
        setViewMode("practice");
      }
    } catch (e) { console.error("Deep link error:", e); }
  });

  // ── 인증 / 유저 로드 ──────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
      if (user) handleUserChange(user);
    });
    return () => unsub();
  }, []);

  const handleUserChange = async (user: any) => {
    if (!user?.email) return;
    const today = new Date().toDateString();
    const userRef = doc(db, "sori_users", user.email);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      setUserRole(data.role ?? "guest");
      setUserAlias(data.alias ?? "");
      setSharedMemory(data.shared_memory ?? "");
      setChatCount(data.chat_count ?? 0);
      setStreak(data.streak ?? 0);
      setTodayCount(data.last_access_date === today ? (data.today_count ?? 0) : 0);
      setPurchasedSteps(data.purchased_steps ?? []);  // E: 교재 구매 목록
      if (data.last_access_date !== today) {
        await updateDoc(userRef, { last_access_date: today, today_count: 0 });
      }
      setTokens(data.role === "guest" ? 0 : (data.tokens ?? 0));
      setHearts(data.role === "guest" ? (data.free_hearts ?? 3) : 3);
      fetchTokenLogs(user.email);
      checkNewMail(user.email);
      // Gumroad 미가입 구매자 대기 토큰/라이선스 처리
      processPendingCharges(user.email);
    } else {
      await setDoc(userRef, {
        email: user.email, name: user.displayName, role: "guest",
        free_hearts: 3, tokens: 0, last_heart_reset: today,
        joined_at: serverTimestamp(), error_count: 0, analysis_count: 0,
        alias: "", streak: 0, today_count: 0, last_access_date: today,
        shared_memory: "", chat_count: 0, purchased_steps: [],
      });
      setUserRole("guest"); setHearts(3); setShowNicknameModal(true);
    }
  };

  // ── Gumroad 미가입 대기 처리 ─────────
  const processPendingCharges = async (email: string) => {
    try {
      // 대기 토큰
      const tokenSnap = await getDocs(
        query(collection(db, "sori_pending_charges"),
          where("email", "==", email), where("processed", "==", false))
      );
      for (const d of tokenSnap.docs) {
        const data = d.data();
        await updateDoc(doc(db, "sori_users", email), { tokens: increment(data.tokenAmount) });
        await updateDoc(doc(db, "sori_pending_charges", d.id), { processed: true });
        setTokens(p => p + data.tokenAmount);
        alert(`🎉 Gumroad 구매 ${data.tokenAmount}토큰이 충전되었습니다!`);
      }

      // 대기 라이선스
      const licenseSnap = await getDocs(
        query(collection(db, "sori_pending_licenses"),
          where("email", "==", email), where("processed", "==", false))
      );
      for (const d of licenseSnap.docs) {
        const data = d.data();
        await updateDoc(doc(db, "sori_users", email), { purchased_steps: arrayUnion(data.step) });
        await updateDoc(doc(db, "sori_pending_licenses", d.id), { processed: true });
        setPurchasedSteps(p => [...new Set([...p, data.step])]);
      }
    } catch (e) { console.error("Pending charge process error:", e); }
  };

  // ── 토큰 로그 ─────────────────────────
  const fetchTokenLogs = async (email: string) => {
    try {
      const q = query(
        collection(db, "sori_users", email, "token_logs"),
        orderBy("date", "desc"), limit(50)
      );
      const snap = await getDocs(q);
      setTokenLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const getSpendStats = () => {
    const stats = { word: 0, sentence: 0, chat: 0, etc: 0 };
    tokenLogs.filter(l => l.type === "spend").forEach(l => {
      if (l.reason.includes("단어") || l.reason.includes("Word")) stats.word += l.amount;
      else if (l.reason.includes("문장") || l.reason.includes("Sentence")) stats.sentence += l.amount;
      else if (l.reason.includes("회화") || l.reason.includes("프리토킹")) stats.chat += l.amount;
      else stats.etc += l.amount;
    });
    return stats;
  };

  // ── 일일 진도 업데이트 ────────────────
  const updateDailyProgress = async () => {
    if (!currentUser) return;
    const userRef = doc(db, "sori_users", currentUser.email);
    const newTodayCount = todayCount + 1;
    const updates: any = { today_count: newTodayCount };
    let newStreak = streak;
    if (newTodayCount === 5) {
      newStreak += 1;
      updates.streak = newStreak;
      if (newStreak === 7) {
        updates.tokens = increment(15);
        setTokens(p => p + 15);
        await addDoc(collection(db, "sori_users", currentUser.email, "inbox"), {
          from: "소리튜터 운영진", title: "🏆 7일 연속 학습 달성 보상!",
          content: "축하합니다! 👏 15토큰이 지급되었습니다.",
          date: serverTimestamp(), read: false,
        });
        setHasNewMail(true);
        alert("🎉 7일 연속 학습 달성으로 15토큰이 지급되었습니다!");
      }
    }
    setTodayCount(newTodayCount);
    setStreak(newStreak);
    await updateDoc(userRef, updates);
  };

  // ── 메일함 ────────────────────────────
  const checkNewMail = async (email: string) => {
    const q = query(collection(db, "sori_users", email, "inbox"), where("read", "==", false));
    const snap = await getDocs(q);
    setHasNewMail(!snap.empty);
  };

  const fetchInbox = async () => {
    setShowInboxModal(true); setInboxTab("received"); setHasNewMail(false);
    if (!currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, "sori_users", currentUser.email, "inbox"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const unread = msgs.filter((m: any) => !m.read);
      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach((m: any) => batch.update(doc(db, "sori_users", currentUser.email, "inbox", m.id), { read: true }));
        await batch.commit();
      }
      setInboxList([WELCOME_MESSAGE, ...msgs.map((m: any) => ({ ...m, read: true }))]);
    } catch (e) { setInboxList([WELCOME_MESSAGE]); } finally { setLoading(false); }
  };

  // ── 랭킹 ──────────────────────────────
  const fetchRanking = async () => {
    setShowRankingModal(true);
    if (!currentUser) return;
    setLoading(true);
    try {
      const s = await getDocs(query(collection(db, "sori_users"), orderBy("points", "desc"), limit(10)));
      setRankingList(s.docs.map(d => d.data()));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchHistory = async () => {
    if (!currentUser) return alert("로그인 후 이용해주세요.");
    setLoading(true);
    try {
      const q = query(collection(db, "sori_users", currentUser.email, "history"), orderBy("date", "desc"));
      const s = await getDocs(q);
      setHistoryList(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setViewMode("history");
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // ── 문의 ──────────────────────────────
  const handleSendInquiry = async () => {
    if (!inquiryContent.trim()) return alert("내용을 입력해주세요.");
    if (!confirm("문의를 보내시겠습니까?")) return;
    try {
      await addDoc(collection(db, "sori_inquiries"), {
        userId: currentUser.email,
        userName: userAlias || currentUser.displayName,
        category: inquiryCategory, content: inquiryContent,
        createdAt: serverTimestamp(), status: "pending", adminReply: null,
      });
      alert("✅ 문의가 접수되었습니다!");
      setInquiryContent(""); setInboxTab("received");
    } catch (e) { alert("전송 실패"); }
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) { await signOut(auth); window.location.reload(); }
  };

  const saveNickname = async (n: string) => {
    if (!n.trim()) return alert("닉네임 입력");
    if (currentUser) {
      await updateDoc(doc(db, "sori_users", currentUser.email), { alias: n });
      setUserAlias(n); setShowNicknameModal(false);
      alert(`환영합니다, ${n}님!`);
    }
  };

  // ── TTS ───────────────────────────────
  const handleGoogleTTS = async (text: string, path?: string | null, voice?: string | null) => {
    if (!text && !path) return;
    if (path) { try { new Audio(path).play(); } catch (e) { console.error(e); } return; }
    if (ttsLoading) return;
    try {
      setTtsLoading(true);
      const cleanText = text.replace(/[\[\]]/g, "").replace(/-/g, " ").trim();
      const formData = new FormData();
      formData.append("action", "tts_simple");
      formData.append("text", cleanText);
      formData.append("voiceName", voice ?? "ko-KR-Chirp3-HD-Zephyr");
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.audioContent) new Audio(`data:audio/mp3;base64,${data.audioContent}`).play();
    } catch (e) { console.error(e); } finally { setTtsLoading(false); }
  };

  // ── B: 출석 체크 보상 ─────────────────
  const handleCheckinReward = (amount: number) => {
    setTokens(p => p + amount);
    fetchTokenLogs(currentUser.email);
  };

  // ── 수동 충전 ─────────────────────────
  const handleManualCharge = async (tokenAmount: number, price: string) => {
    const depositorName = prompt(`[${price}] 입금하실 분의 성함을 입력해주세요.`);
    if (!depositorName?.trim()) return;
    if (!confirm(`${depositorName}님 명의로 충전을 요청하시겠습니까?`)) return;
    try {
      await addDoc(collection(db, "sori_charge_requests"), {
        userId: currentUser.email, userAlias: userAlias || "이름없음",
        amount: tokenAmount, price, depositor: depositorName,
        status: "pending", createdAt: serverTimestamp(),
      });
      alert(`✅ 요청 완료! 입금 확인 후 충전됩니다.\n\n🏦 카카오뱅크 3333-29-9690780 (오준호)`);
      setShowPaymentModal(false);
    } catch (e) { alert("요청 오류"); }
  };

  // ── 프리토킹 진입 ─────────────────────
  const enterFreeTalking = () => {
    if (userRole === "guest" && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== "guest" && tokens < 2) return setShowPaymentModal(true);
    setViewMode("freetalking");
    setChatStatus("select_persona");
  };

  const startChatWithPersona = async (personaId: string) => {
    setSelectedPersona(personaId);
    const persona = PERSONAS.find(p => p.id === personaId);
    const suffix = (persona?.name.charCodeAt(persona.name.length - 1) ?? 0 - 0xac00) % 28 > 0 ? "이에요" : "예요";
    const greeting = `안녕하세요! 저는 ${persona?.name}${suffix}. 우리 대화할까요?`;
    setChatHistory([{ role: "model", text: greeting }]);
    setChatStatus("active");
    setChatFeedback(null);

    // ttsLoading 상태와 무관하게 인사말 TTS 직접 호출
    try {
      setTtsLoading(true);
      const formData = new FormData();
      formData.append("action", "tts_simple");
      formData.append("text", greeting);
      formData.append("voiceName", persona?.voice ?? "ko-KR-Chirp3-HD-Zephyr");
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.audioContent) {
        new Audio(`data:audio/mp3;base64,${data.audioContent}`).play();
      }
    } catch (e) {
      console.error("인사말 TTS 실패:", e);
    } finally {
      setTtsLoading(false);
    }
  };

  // ── 회화 전송 — A: 서버 토큰 차감 ────
  const handleChatSend = async () => {
    if (!audioBlob) return;
    const currency = userRole === "guest" ? "heart" : "token";
    if (userRole === "guest" && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== "guest" && tokens < 2) return setShowPaymentModal(true);

    setLoading(true);
    const formData = new FormData();
    formData.append("action", "chat");
    formData.append("audio", audioBlob);
    formData.append("history", JSON.stringify(chatHistory));
    formData.append("persona", selectedPersona);
    formData.append("sharedMemory", sharedMemory);

    try {
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }

      // A: 서버에서 토큰 차감
      const spendRes = await spendToken("실전 회화 (1턴)", currency);
      if (!spendRes.success) { alert(spendRes.error); return; }
      if (currency === "heart") setHearts(p => p - 1);
      else setTokens(spendRes.remaining ?? tokens - 2);

      const newHistory = [
        ...chatHistory,
        { role: "user", text: data.userText },
        { role: "model", text: data.aiText, audio: data.audioContent ? `data:audio/mp3;base64,${data.audioContent}` : null },
      ];
      setChatHistory(newHistory);
      if (data.audioContent) new Audio(`data:audio/mp3;base64,${data.audioContent}`).play();
      if (data.ended) setChatStatus("ended");
      setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { alert("통신 오류"); } finally { setLoading(false); setAudioUrl(null); setAudioBlob(null); }
  };

  // ── 메모리 동기화 ─────────────────────
  const handleMemoryUpdate = async (dialog: string) => {
    try {
      const newCount = chatCount + 1;
      const mode = newCount % 5 === 0 ? "compress" : "append";
      const formData = new FormData();
      formData.append("action", "memory_sync");
      formData.append("currentMemory", sharedMemory);
      formData.append("newDialog", dialog);
      formData.append("mode", mode);
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.summary && data.summary !== "정보 없음") {
        const newMemory = mode === "compress" ? data.summary : sharedMemory + " " + data.summary;
        setSharedMemory(newMemory);
        await updateDoc(doc(db, "sori_users", currentUser.email), { shared_memory: newMemory, chat_count: newCount });
        setChatCount(newCount);
      }
    } catch (e) { console.error("Memory sync fail", e); }
  };

  // ── 피드백 — A: 서버 토큰 차감 ───────
  const handleChatFeedback = async () => {
    const currency = userRole === "guest" ? "heart" : "token";
    if (userRole === "guest" && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== "guest" && tokens < 2) return setShowPaymentModal(true);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("action", "feedback");
      formData.append("history", JSON.stringify(chatHistory));
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }

      const spendRes = await spendToken("회화 피드백 분석", currency);
      if (!spendRes.success) { alert(spendRes.error); return; }
      if (currency === "heart") setHearts(p => p - 1);
      else setTokens(spendRes.remaining ?? tokens - 2);

      setChatFeedback(data);
      await updateDoc(doc(db, "sori_users", currentUser.email), { points: increment(10) });
      await updateDailyProgress();

      const currentPersona = PERSONAS.find(p => p.id === selectedPersona);
      await addDoc(collection(db, "sori_users", currentUser.email, "history"), {
        text: `${currentPersona?.name ?? "AI"}와의 대화`, score: 0,
        recognized: "", correct: "",
        feedback: `🗣️ 발음: ${data.pronunciation}\n🎭 억양: ${data.intonation}\n💡 총평: ${data.general}`,
        advice: data.general, type: "free_talking", date: serverTimestamp(),
      });
      const fullDialog = chatHistory.map(m => `${m.role}:${m.text}`).join("\n");
      handleMemoryUpdate(fullDialog);
    } catch (e) { alert("피드백 생성 실패"); } finally { setLoading(false); }
  };

  // ── 번역 — A: 서버 토큰 차감 ─────────
  const handleTranslateFeedback = async () => {
    const currency = userRole === "guest" ? "heart" : "token";
    if (userRole === "guest" && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== "guest" && tokens < 0.5) return setShowPaymentModal(true);
    if (!confirm("번역하시겠습니까? (0.5🪙)")) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("action", "translate");
      const text = chatFeedback
        ? `Pronunciation: ${chatFeedback.pronunciation}\nGeneral: ${chatFeedback.general}`
        : `Explanation: ${result?.explanation}\nAdvice: ${result?.advice}`;
      formData.append("text", text);
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setTranslation(data.translatedText);

      const spendRes = await spendToken("피드백 번역", currency);
      if (spendRes.success) {
        if (currency === "heart") setHearts(p => p - 1);
        else setTokens(spendRes.remaining ?? tokens - 0.5);
      }
      if (!showTranslateModal && viewMode === "freetalking") setShowTranslateModal(true);
    } catch (e) { alert("번역 실패"); } finally { setLoading(false); }
  };

  const handleHistoryTranslate = async (item: any) => {
    const currency = userRole === "guest" ? "heart" : "token";
    if (userRole === "guest" && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== "guest" && tokens < 0.5) return setShowPaymentModal(true);
    if (!confirm("번역하시겠습니까? (0.5🪙)")) return;
    const text = item.feedback || item.explanation || item.advice;
    if (!text) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("action", "translate");
      formData.append("text", text);
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      alert(`[번역 결과]\n${data.translatedText}`);
      const spendRes = await spendToken("기록 번역", currency);
      if (spendRes.success) {
        if (currency === "heart") setHearts(p => p - 1);
        else setTokens(spendRes.remaining ?? tokens - 0.5);
      }
    } catch (e) { alert("오류"); } finally { setLoading(false); }
  };

  // ── 커리큘럼 선택 ─────────────────────
  const selectCourse = async (type: "word" | "sentence" | "dialogue") => {
    setCourseType(type); setResult(null); setCompletedLines([]);
    if (type === "word" || type === "dialogue") {
      const s = await getDocs(collection(db, type === "word" ? "sori_curriculum_word" : "sori_curriculum_dialogue"));
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setProblemList(list);
      if (list.length > 0) initPractice(list);
      setViewMode("practice");
    } else {
      const s = await getDocs(collection(db, "sori_curriculum_sentence"));
      const c = new Set<string>();
      s.forEach(d => c.add(d.data().category));
      setCategories(Array.from(c).sort());
      setViewMode("category");
    }
  };

  const selectCategory = async (cat: string) => {
    setSelectedCategory(cat);
    const q = query(collection(db, `sori_curriculum_${courseType}`), where("category", "==", cat));
    const s = await getDocs(q);
    const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
    setProblemList(list);
    if (!s.empty) initPractice(list);
    setViewMode("practice"); setResult(null); setAudioUrl(null);
  };

  const initPractice = (list: any[]) => {
    const r = Math.floor(Math.random() * list.length);
    updateCurrentProblem(list[r]); setHistoryStack([list[r]]); setHistoryIndex(0);
  };

  const handleNextProblem = () => {
    if (problemList.length > 0) {
      const r = Math.floor(Math.random() * problemList.length);
      updateCurrentProblem(problemList[r]);
    }
  };

  const updateCurrentProblem = (prob: any) => {
    setCurrentProblem(prob); setResult(null); setAudioUrl(null);
    setCompletedLines([]); setTranslation(null);
    if (prob.script) parseDialogue(prob.script);
  };

  const parseDialogue = (s: string) => {
    if (!s) { setParsedScript([]); return; }
    setParsedScript(s.split("|").map(l => {
      const parts = l.split(":");
      return { role: parts[0]?.trim() ?? "System", text: parts[1]?.trim() ?? "" };
    }));
    setTargetLineIndex(null);
  };

  // ── 단어 검색 — A: 서버 토큰 차감 ────
  const handleWordClick = async (word: string, context: string) => {
    const cleanWord = word.replace(/[.,?!~]/g, "");
    if (!cleanWord) return;
    // student 계정만 토큰 차감 (guest는 무료)
    if (userRole === "student" && tokens < 0.5) {
      alert("0.5 토큰이 필요합니다.");
      setShowPaymentModal(true);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("action", "define");
      formData.append("word", cleanWord);
      formData.append("context", context);
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelectedWordData(data);
      setShowWordModal(true);
      // student만 토큰 차감
      if (userRole === "student") {
        const spendRes = await spendToken("단어 뜻 검색");
        if (spendRes.success) setTokens(spendRes.remaining ?? tokens - 0.5);
      }
    } catch (e) {
      alert("단어 정보 로딩 실패");
    } finally {
      setLoading(false);
    }
  };

  const saveVocabulary = async () => {
    if (!selectedWordData || !currentUser) return;
    try {
      await addDoc(collection(db, "sori_users", currentUser.email, "vocabulary"), {
        word: selectedWordData.word, meaning_kr: selectedWordData.meaning_kr,
        meaning_en: selectedWordData.meaning_en, example: selectedWordData.example,
        savedAt: serverTimestamp(),
      });
      alert("저장되었습니다!"); setShowWordModal(false);
    } catch (e) { alert("저장 실패"); }
  };

  const renderClickableMessage = (text: string, role: string) => (
    <p className="leading-relaxed">
      {text.split(" ").map((word, idx) => (
        <span
          key={idx}
          onClick={() => handleWordClick(word, text)}
          className={`inline-block mr-1 cursor-pointer rounded px-0.5 transition ${role === "model" ? "hover:bg-slate-200" : "hover:bg-blue-500 hover:text-white"}`}
        >
          {word}
        </span>
      ))}
    </p>
  );

  // ── 발음 분석 — A: 서버 토큰 차감 ────
  const analyzeAudio = async () => {
    if (!audioBlob || !currentProblem) return;
    const currency = userRole === "guest" ? "heart" : "token";
    const cost = courseType === "word" ? 0.5 : 1;
    if (userRole === "guest" && hearts <= 0) return setShowPaymentModal(true);
    if (userRole === "student" && tokens < cost) return setShowPaymentModal(true);
    setLoading(true); setResult(null); setTranslation(null);

    let targetText = currentProblem.text; let contextInfo = "";
    if (courseType === "dialogue" && targetLineIndex !== null) {
      targetText = parsedScript[targetLineIndex].text;
      contextInfo = `상황: ${currentProblem.title}, 역할: ${myRole}`;
    }

    const formData = new FormData();
    formData.append("audio", audioBlob); formData.append("targetText", targetText);
    formData.append("context", contextInfo); formData.append("userNick", userAlias || "학습자");

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); } else {
        setResult(data);

        // 효과음 + 멘트 재생
        const isSilence = !data.recognized || data.recognized === "(침묵)" || data.recognized === "(잡음)";
        const tier = getTier(data.score, isSilence);
        const voiceUrl = feedbackVoices[tier] ?? null;
        playScoreFeedback(data.score, isSilence, voiceUrl).catch(() => {});

        // A: 서버에서 토큰 차감
        const reason = courseType === "word" ? "발음 분석 (word)" : courseType === "sentence" ? "발음 분석 (sentence)" : "발음 분석 (dialogue)";
        const spendRes = await spendToken(reason as any, currency);
        if (spendRes.success) {
          if (currency === "heart") setHearts(p => p - 1);
          else setTokens(spendRes.remaining ?? tokens - cost);
        }

        await updateDoc(doc(db, "sori_users", currentUser.email), { points: increment(courseType === "word" ? 2 : 3) });
        await updateDailyProgress();
        if (courseType === "dialogue" && targetLineIndex !== null) {
          if (!completedLines.includes(targetLineIndex)) setCompletedLines(prev => [...prev, targetLineIndex]);
        }
        await addDoc(collection(db, "sori_users", currentUser.email, "history"), {
          text: targetText, score: data.score, recognized: data.recognized,
          correct: data.correct, feedback: data.explanation, advice: data.advice,
          type: courseType, date: serverTimestamp(),
        });
      }
    } catch (e) { alert("서버 오류"); } finally { setLoading(false); }
  };

  // ── 녹음 ──────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob)); setAudioBlob(blob);
        chunksRef.current = []; stream.getTracks().forEach(t => t.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
      };
      mediaRecorderRef.current.start();
      setRecording(true); setResult(null);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser); sourceRef.current = source;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      detectSilence();
    } catch (e) { alert("마이크 권한 필요"); }
  };

  const detectSilence = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
    const avg = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
    if (avg > 15) { if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; } }
    else { if (!silenceTimer.current) { silenceTimer.current = setTimeout(stopRecording, 1500); } }
    animationFrameRef.current = requestAnimationFrame(detectSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop(); setRecording(false);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    }
  };

  const isAllMyLinesFinished = () => {
    if (courseType !== "dialogue") return false;
    const myLines = parsedScript.map((l, i) => l.role === myRole ? i : -1).filter(i => i !== -1);
    return myLines.every(i => completedLines.includes(i));
  };

  // ── 로딩 / 비로그인 화면 ──────────────
  if (isAuthChecking) return <div className="flex h-screen items-center justify-center bg-slate-50">로딩 중...</div>;

  if (!currentUser) {
    return <LandingPage onUserChange={handleUserChange} />;
  }

  // ── 메인 앱 ───────────────────────────
  return (
    <main className="flex h-[100dvh] flex-col bg-slate-50 max-w-lg mx-auto shadow-2xl relative overflow-hidden">
      {/* 헤더 */}
      <header className="bg-white px-5 py-3 flex justify-between items-center flex-none z-40 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode("home")}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">S</div>
          <span className="font-bold text-lg text-slate-800">Sori-Tutor</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 관리자 어드민 버튼 — admin 계정에서만 표시 */}
          {userRole === "admin" && (
            <a
              href="/admin"
              className="flex items-center gap-1 bg-slate-800 text-white px-2.5 py-1 rounded-full text-xs font-bold hover:bg-slate-700 transition"
            >
              ⚙️ 어드민
            </a>
          )}
          {/* E: 교재 연동 버튼 */}
          <button
            onClick={() => setShowLicenseModal(true)}
            className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold hover:bg-amber-100 transition"
          >
            <BookOpen size={12} /> 교재 연동
          </button>
          <button onClick={fetchInbox} className="relative text-slate-600 hover:text-blue-600 transition p-1">
            <span className="text-2xl">📮</span>
            {hasNewMail && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />}
          </button>
          <button onClick={handleLogout} className="text-xl hover:scale-110 transition" title="로그아웃">👋</button>
        </div>
      </header>

      {/* 토큰/하트 표시 바 */}
      <div className="bg-white px-5 py-2 flex justify-between items-center border-b border-slate-50 text-sm flex-none">
        <div className="flex gap-2">
          <button onClick={fetchRanking} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full font-bold hover:bg-yellow-100 transition">
            <Trophy size={14} /> 랭킹
          </button>
          <button onClick={fetchHistory} className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold hover:bg-slate-200 transition">
            내 기록
          </button>
        </div>
        <div
          className="flex items-center gap-1 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded-full border border-slate-200"
          onClick={() => setShowPaymentModal(true)}
        >
          {userRole === "guest" ? (
            [1, 2, 3].map(i => <Heart key={i} size={16} className={i <= hearts ? "text-red-500 fill-red-500" : "text-slate-300"} />)
          ) : (
            <><Coins size={14} className="text-yellow-500" fill="currentColor" /><span className="font-bold text-slate-700">{tokens.toFixed(1).replace(/\.0$/, "")}</span></>
          )}
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide pb-24">

        {/* ── 홈 — C: HomeView 컴포넌트 ── */}
        {viewMode === "home" && (
          <div className="space-y-4">
            {/* E: 교재 연동 배너 */}
            {purchasedSteps.length === 0 && (
              <button
                onClick={() => setShowLicenseModal(true)}
                className="w-full p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-center gap-3 hover:border-amber-400 transition group"
              >
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                  <BookOpen size={20} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-amber-800 text-sm">STEP Korean 교재 연동</p>
                  <p className="text-xs text-amber-600">교재 구매 시 라이선스 키로 심화 커리큘럼 잠금 해제</p>
                </div>
                <span className="ml-auto text-amber-400 text-xs font-bold">연동하기 →</span>
              </button>
            )}
            {purchasedSteps.length > 0 && (
              <div className="w-full p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                <span className="text-green-600 font-bold text-sm">✅ 활성화된 교재:</span>
                <div className="flex gap-1 flex-wrap">
                  {purchasedSteps.map(s => (
                    <span key={s} className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      Step {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <HomeView
              user={{
                email: currentUser.email, name: currentUser.displayName,
                alias: userAlias, role: userRole as any,
                free_hearts: hearts, tokens, points: 0,
                streak, today_count: todayCount,
                last_access_date: "", shared_memory: sharedMemory, chat_count: chatCount,
              }}
              onSelectCourse={selectCourse}
              onEnterFreeTalking={enterFreeTalking}
              onFetchRanking={fetchRanking}
              onFetchHistory={fetchHistory}
              onOpenNickname={() => setShowNicknameModal(true)}
            />

            {/* 광고 #4: 홈 화면 하단 */}
            <div className="w-full mt-2 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
              <AdUnit slot="SLOT_ID_4" format="auto" />
            </div>
          </div>
        )}

        {/* ── 카테고리 선택 ── */}
        {viewMode === "category" && (
          <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 font-bold flex items-center gap-1 hover:text-blue-600">
              <ChevronLeft size={20} /> 메인으로
            </button>
            <div className="grid grid-cols-2 gap-3">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => selectCategory(cat)}
                  className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:text-blue-600 font-bold text-slate-700 text-lg transition"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 히스토리 ── */}
        {viewMode === "history" && (
          <div className="space-y-4">
            <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 flex items-center gap-1"><ChevronLeft /> 메인으로</button>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {(["all", "word", "sentence", "dialogue", "free_talking"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setHistoryTabState(tab)}
                  className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap border ${historyTabState === tab ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}
                >
                  {tab === "all" ? "전체" : tab === "word" ? "단어" : tab === "sentence" ? "문장" : tab === "dialogue" ? "담화" : "회화"}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {historyList.filter(h => historyTabState === "all" || h.type === historyTabState).map(h => (
                <div key={h.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                  <div className="text-[10px] text-slate-400 mb-1">{h.date?.toDate?.().toLocaleDateString()}</div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-800 text-lg truncate pr-10">{h.text}</h4>
                    {h.type !== "free_talking" && (
                      <span className={`text-sm font-black px-2 py-1 rounded ${h.score >= 80 ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}>{h.score}점</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2 line-clamp-2">
                    {h.feedback || h.explanation || h.advice || "내용 없음"}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowFeedbackModal(h)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1 text-slate-500">📄 자세히</button>
                    <button onClick={() => handleHistoryTranslate(h)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1 text-slate-500"><Languages size={10} /> 번역 (0.5🪙)</button>
                  </div>
                </div>
              ))}
              {historyList.length === 0 && <p className="text-center text-slate-400 py-10">기록이 없습니다.</p>}
            </div>
          </div>
        )}

        {/* ── 프리토킹 ── */}
        {viewMode === "freetalking" && (
          <div className="flex flex-col h-full pb-24">
            {chatStatus === "select_persona" && (
              <div className="animate-in fade-in zoom-in space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setViewMode("home")} className="p-2 bg-white rounded-full border"><ChevronLeft /></button>
                  <h2 className="text-lg font-bold">대화 상대를 선택하세요</h2>
                  <button onClick={() => setShowPersonaRanking(true)} className="p-2 bg-yellow-100 text-yellow-700 rounded-full font-bold text-xs flex items-center gap-1">
                    <Crown size={14} /> 인기순위
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 pb-20">
                  {PERSONAS.map(p => (
                    <div key={p.id} onClick={() => startChatWithPersona(p.id)} className={`p-3 rounded-2xl border-2 cursor-pointer transition hover:scale-105 ${p.color} bg-white shadow-sm flex flex-col items-center text-center`}>
                      <div className="w-20 h-20 rounded-full overflow-hidden mb-2 border-2 border-white shadow-md">
                        <img src={p.img} alt={p.name} className="w-full h-full object-cover object-top" />
                      </div>
                      <h3 className="text-lg font-black text-slate-800">{p.name}</h3>
                      <span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full mb-1 text-slate-600">{p.role}</span>
                      <p className="text-xs opacity-70 leading-tight mt-1">{p.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chatStatus !== "select_persona" && (
              <>
                <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-50 z-10 py-2">
                  <button onClick={() => setViewMode("home")} className="p-2 bg-white rounded-full border"><X size={20} /></button>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden border">
                      <img src={PERSONAS.find(p => p.id === selectedPersona)?.img} className="w-full h-full object-cover object-top" />
                    </div>
                    <span className="font-bold text-slate-700">{PERSONAS.find(p => p.id === selectedPersona)?.name}</span>
                  </div>
                  <div className="w-10" />
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                  <div className="text-center text-xs text-slate-400 my-2">💡 모르는 단어를 클릭하면 뜻을 볼 수 있어요!</div>
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm relative group ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"}`}>
                        {renderClickableMessage(msg.text, msg.role)}
                        {msg.role === "model" && msg.audio && (
                          <button onClick={() => new Audio(msg.audio).play()} className="absolute -right-8 top-2 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm text-slate-500 hover:text-blue-600">
                            <Volume2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatScrollRef} />
                </div>
                {chatStatus === "ended" && !chatFeedback && (
                  <div className="bg-slate-800 text-white p-4 rounded-xl text-center animate-in fade-in">
                    {loading ? (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        <p className="text-sm font-bold">AI가 분석중입니다... 📝</p>
                      </div>
                    ) : (
                      <>
                        <p className="mb-3 font-bold">대화가 종료되었습니다 👋</p>
                        <button onClick={handleChatFeedback} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 transition">📝 종합 피드백 받기</button>
                      </>
                    )}
                  </div>
                )}
                {chatFeedback && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg animate-in slide-in-from-bottom relative">
                    <button onClick={handleTranslateFeedback} className="absolute top-4 right-4 text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1">
                      <Languages size={12} /> {translation ? "번역 내용 보기" : "번역 (0.5🪙)"}
                    </button>
                    <h3 className="font-bold text-lg mb-3 border-b pb-2">📋 대화 분석 리포트</h3>
                    <div className="space-y-3 text-sm">
                      <div><span className="font-bold text-blue-600 block">🗣️ 발음 및 어휘</span><p className="text-slate-700">{chatFeedback.pronunciation}</p></div>
                      <div><span className="font-bold text-purple-600 block">🎭 억양과 감정</span><p className="text-slate-700">{chatFeedback.intonation}</p></div>
                      <div><span className="font-bold text-green-600 block">💡 총평</span><p className="text-slate-700">{chatFeedback.general}</p></div>
                      {translation && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs font-bold text-purple-600 mb-1">🌏 번역된 피드백</p>
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{translation}</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setViewMode("home")} className="w-full mt-4 bg-slate-100 py-3 rounded-xl font-bold text-slate-600">메인으로</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 연습 — C: PracticeView 컴포넌트 ── */}
        {viewMode === "practice" && currentProblem && (
          <PracticeView
            courseType={courseType!}
            currentProblem={currentProblem}
            result={result}
            translation={translation}
            parsedScript={parsedScript}
            myRole={myRole}
            targetLineIndex={targetLineIndex}
            completedLines={completedLines}
            isShadowingMode={isShadowingMode}
            ttsLoading={ttsLoading}
            loading={loading}
            recording={recording}
            audioUrl={audioUrl}
            onBack={() => setViewMode("home")}
            onSetMyRole={setMyRole}
            onSetTargetLine={(i) => { setTargetLineIndex(i); setResult(null); setAudioUrl(null); }}
            onToggleShadowing={() => setIsShadowingMode(p => !p)}
            onPlayTTS={handleGoogleTTS}
            onRetry={() => { setResult(null); setAudioUrl(null); }}
            onNext={() => { setResult(null); setAudioUrl(null); if (courseType !== "dialogue") handleNextProblem(); }}
            onTranslate={handleTranslateFeedback}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onCancelAudio={() => { setAudioUrl(null); setAudioBlob(null); }}
            onAnalyze={analyzeAudio}
            onNextDialogue={handleNextProblem}
            isAllMyLinesFinished={isAllMyLinesFinished}
          />
        )}

        {/* 프리토킹 하단 녹음 바 */}
        {viewMode === "freetalking" && chatStatus === "active" && (
          <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] rounded-t-3xl z-50">
            <div className="flex flex-col items-center gap-4">
              {loading && <div className="text-slate-500 animate-pulse font-bold text-sm">AI가 답변을 생각하고 있어요... 🤔</div>}
              {!recording && !audioUrl && !loading && (
                <button onClick={startRecording} className="w-16 h-16 rounded-full bg-green-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition"><Mic size={32} /></button>
              )}
              {recording && (
                <div className="flex flex-col items-center">
                  <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100">
                    <div className="w-6 h-6 bg-white rounded-md" />
                  </button>
                  <span className="text-xs text-red-500 font-bold mt-2">녹음 중...</span>
                </div>
              )}
              {audioUrl && !recording && !loading && (
                <div className="flex gap-2 w-full animate-in slide-in-from-bottom">
                  <button onClick={() => { setAudioUrl(null); setAudioBlob(null); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
                  <button onClick={handleChatSend} className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2">
                    <Send size={18} /> 전송 (-2🪙)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ───────── 모달들 ───────── */}

      {/* B: 출석 체크 모달 */}
      {showCheckinModal && (
        <CheckinModal
          onClose={() => setShowCheckinModal(false)}
          onReward={handleCheckinReward}
        />
      )}

      {/* E: 라이선스 모달 */}
      {showLicenseModal && (
        <LicenseModal
          onClose={() => setShowLicenseModal(false)}
          purchasedSteps={purchasedSteps}
          onUnlock={(step) => setPurchasedSteps(prev => [...new Set([...prev, step])])}
        />
      )}

      {/* 충전소 + 토큰 히스토리 */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 p-5 text-white text-center flex-none relative">
              <h2 className="text-xl font-bold">충전소 & 히스토리</h2>
              <button onClick={() => setShowPaymentModal(false)} className="absolute top-5 right-5 text-white/70 hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-slate-500 mb-3">⚡ 토큰 충전</h3>
                <div className="grid gap-2">
                  <button onClick={() => handleManualCharge(100, "2,900원")} className="w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold flex justify-between px-4 hover:bg-blue-100"><span>💎 100 토큰</span><span>2,900원</span></button>
                  <button onClick={() => handleManualCharge(250, "5,900원")} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex justify-between px-4 hover:bg-blue-700 shadow-lg"><span>💎 250 토큰</span><span>5,900원</span></button>
                  {/* B: 광고 버튼 → 출석 체크로 교체 */}
                  <button
                    onClick={() => { setShowPaymentModal(false); setShowCheckinModal(true); }}
                    className="w-full py-3 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 mt-2 hover:bg-orange-100"
                  >
                    ✅ 오늘의 출석 체크 (무료 토큰 1개)
                  </button>
                </div>
              </div>
              <div className="pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-slate-500 flex items-center gap-1"><History size={14} /> 최근 사용 내역</h3>
                  <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setHistoryTab("earn")} className={`px-3 py-1 text-xs font-bold rounded-md transition ${historyTab === "earn" ? "bg-white shadow text-slate-800" : "text-slate-400"}`}>획득</button>
                    <button onClick={() => setHistoryTab("spend")} className={`px-3 py-1 text-xs font-bold rounded-md transition ${historyTab === "spend" ? "bg-white shadow text-slate-800" : "text-slate-400"}`}>차감</button>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-1 min-h-[150px] border border-slate-100">
                  {historyTab === "spend" && (
                    <div className="mb-2 px-2">
                      <button onClick={() => setShowSpendStats(!showSpendStats)} className="w-full py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-1 hover:bg-slate-50 mb-2">
                        {showSpendStats ? <TrendingDown size={14} /> : <PieChart size={14} />} {showSpendStats ? "지출 통계 접기" : "지출 유형별 분석"}
                      </button>
                      {showSpendStats && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs mb-2 animate-in slide-in-from-top-2">
                          <div className="flex justify-between mb-1"><span>단어/문장 연습</span><span className="font-bold">{getSpendStats().word + getSpendStats().sentence} 토큰</span></div>
                          <div className="flex justify-between mb-1"><span>실전/자유 회화</span><span className="font-bold">{getSpendStats().chat} 토큰</span></div>
                          <div className="flex justify-between border-t pt-1 mt-1"><span>기타(번역 등)</span><span className="font-bold">{getSpendStats().etc} 토큰</span></div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-1 px-2 pb-2">
                    {tokenLogs.filter(l => l.type === historyTab).slice(0, 5).map(log => (
                      <div key={log.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <div>
                          <span className="font-bold text-slate-700 text-xs block">{log.reason}</span>
                          <span className="text-slate-400 text-[10px]">{log.date?.toDate?.().toLocaleDateString()}</span>
                        </div>
                        <span className={`font-bold text-xs ${log.type === "earn" ? "text-green-600" : "text-red-500"}`}>
                          {log.type === "earn" ? "+" : "-"}{log.amount}
                        </span>
                      </div>
                    ))}
                    {tokenLogs.filter(l => l.type === historyTab).length === 0 && (
                      <p className="text-center text-slate-400 py-8 text-xs">내역이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 번역 모달 */}
      {showTranslateModal && translation && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl">
            <button onClick={() => setShowTranslateModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            <h2 className="text-lg font-black mb-3 text-purple-700 flex items-center gap-2"><Languages size={18} /> 번역 결과</h2>
            <div className="max-h-[60vh] overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap">{translation}</div>
          </div>
        </div>
      )}

      {/* 피드백 상세 모달 */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl flex flex-col max-h-[80vh]">
            <button onClick={() => setShowFeedbackModal(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            <h2 className="text-lg font-black mb-4">📝 상세 피드백</h2>
            <div className="flex-1 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap">{showFeedbackModal.feedback || showFeedbackModal.explanation || showFeedbackModal.advice}</div>
            <div className="mt-4 pt-3 border-t flex justify-end">
              <button onClick={() => { setShowFeedbackModal(null); handleHistoryTranslate(showFeedbackModal); }} className="text-xs bg-slate-100 px-3 py-2 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-200">
                <Languages size={12} /> 번역하기 (0.5🪙)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 페르소나 인기순위 */}
      {showPersonaRanking && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 relative shadow-2xl">
            <button onClick={() => setShowPersonaRanking(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            <h2 className="text-xl font-black mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" fill="currentColor" /> 인기 AI 랭킹</h2>
            <div className="space-y-3">
              {[PERSONAS[0], PERSONAS[1], PERSONAS[3]].map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className={`w-8 h-8 flex items-center justify-center font-black rounded-full ${i === 0 ? "bg-yellow-100 text-yellow-600" : i === 1 ? "bg-gray-200 text-gray-600" : "bg-orange-100 text-orange-700"}`}>{i + 1}</div>
                  <div className="w-10 h-10 rounded-full overflow-hidden border"><img src={p.img} className="w-full h-full object-cover object-top" /></div>
                  <div><div className="font-bold text-sm">{p.name}</div><div className="text-[10px] text-slate-500">{p.role}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 닉네임 설정 */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center shadow-2xl">
            <h2 className="text-xl font-black mb-1 text-slate-800">닉네임 설정</h2>
            <input
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mb-4 font-bold text-center"
              value={userAlias} onChange={e => setUserAlias(e.target.value)} placeholder="예: 열공하는개미"
            />
            <button onClick={() => saveNickname(userAlias)} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">저장</button>
          </div>
        </div>
      )}

      {/* 랭킹 */}
      {showRankingModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl">
            <button onClick={() => setShowRankingModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            <h2 className="text-xl font-black mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" /> TOP 10 랭킹</h2>
            <div className="space-y-2">
              {rankingList.map((u, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? "bg-yellow-400 text-white" : i === 1 ? "bg-gray-300 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-slate-200 text-slate-600"}`}>{i + 1}</span>
                  <span className="font-bold text-slate-800 flex-1">{u.alias || u.name}</span>
                  <span className="text-xs font-bold text-orange-500">{u.points ?? 0}P</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 메일함 */}
      {showInboxModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm">
          <div className="bg-white w-full h-full sm:h-[600px] sm:max-w-md sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
            {selectedMessage ? (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b flex items-center gap-2 bg-white sticky top-0 z-10">
                  <button onClick={() => setSelectedMessage(null)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={24} /></button>
                  <h3 className="font-bold text-slate-800">상세 내용</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="mb-6 pb-4 border-b border-slate-100">
                    <span className="inline-block px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded mb-2">공지</span>
                    <h2 className="text-xl font-bold text-slate-900">{selectedMessage.title}</h2>
                    <p className="text-sm text-slate-400 mt-2">{selectedMessage.date instanceof Date ? selectedMessage.date.toLocaleDateString() : selectedMessage.date?.toDate?.().toLocaleDateString()}</p>
                  </div>
                  <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{selectedMessage.content}</div>
                </div>
                <div className="p-4 border-t">
                  <button onClick={() => setSelectedMessage(null)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">목록으로</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full bg-slate-50">
                <div className="bg-white sticky top-0 z-10 shadow-sm">
                  <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Mail size={18} /> 소리튜터 우체통</h3>
                    <button onClick={() => setShowInboxModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18} /></button>
                  </div>
                  <div className="flex">
                    <button onClick={() => setInboxTab("received")} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab === "received" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>받은 편지함</button>
                    <button onClick={() => setInboxTab("write")} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab === "write" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>문의하기</button>
                  </div>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  {inboxTab === "received" ? (
                    <div className="space-y-3">
                      {inboxList.map(msg => (
                        <div key={msg.id} onClick={() => setSelectedMessage(msg)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer relative">
                          {!msg.read && <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-2 inline-block">{msg.from ?? "관리자"}</span>
                          <h4 className="font-bold text-slate-800 text-sm truncate">{msg.title}</h4>
                          <p className="text-xs text-slate-400 mt-1">{msg.date instanceof Date ? msg.date.toLocaleDateString() : msg.date?.toDate?.().toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <select className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 text-sm focus:outline-none" value={inquiryCategory} onChange={e => setInquiryCategory(e.target.value)}>
                        <option value="bug">🐛 오류 제보</option>
                        <option value="suggestion">💡 기능 건의</option>
                        <option value="question">❓ 학습 질문</option>
                        <option value="other">💬 기타 문의</option>
                      </select>
                      <textarea
                        className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none resize-none"
                        placeholder="내용을 자세히 적어주세요."
                        value={inquiryContent} onChange={e => setInquiryContent(e.target.value)}
                      />
                      <button onClick={handleSendInquiry} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                        <Send size={18} /> 보내기
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 단어 모달 */}
      {showWordModal && selectedWordData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 relative shadow-2xl">
            <button onClick={() => setShowWordModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 mb-1">{selectedWordData.word}</h2>
              <p className="text-sm text-slate-400">Contextual Dictionary</p>
            </div>
            <div className="space-y-4 mb-6">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <span className="text-xs font-bold text-blue-500 block mb-1">뜻 (Korean)</span>
                <p className="font-bold text-slate-700">{selectedWordData.meaning_kr}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-1">English</span>
                <p className="text-sm text-slate-600">{selectedWordData.meaning_en}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-400 block mb-1">예문</span>
                <p className="text-sm text-slate-600 italic">"{selectedWordData.example}"</p>
              </div>
            </div>
            <button onClick={saveVocabulary} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2">
              <Save size={18} /> 단어장에 저장
            </button>
          </div>
        </div>
      )}
    </main>
  );
}