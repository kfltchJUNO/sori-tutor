"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Login from "./components/Login";
import AdModal from "./components/AdModal"; 

import { db, auth } from "@/lib/firebase"; 
import { signOut, onAuthStateChanged } from "firebase/auth"; 
import { 
  doc, getDoc, setDoc, collection, getDocs, query, where, addDoc, serverTimestamp, orderBy, updateDoc, increment, limit, writeBatch 
} from "firebase/firestore";
import { 
  Mic, MessageSquare, Trophy, Mail, X, ChevronLeft, Star, Heart, Coins, 
  Volume2, Info, CheckCircle, Send, MessageCircle, Languages, Crown, 
  Users, Sparkles, BookOpen, Headphones, Save, Bookmark, User, History, PieChart, TrendingDown, TrendingUp
} from 'lucide-react';

const WELCOME_MESSAGE = {
  id: 'welcome-guide',
  from: '소리튜터 운영진',
  title: "🎉 소리튜터에 오신 것을 환영합니다! (사용 설명서 포함)",
  date: new Date(), 
  read: true, 
  content: `안녕하세요, 새로운 학습자님! 👋\n\n한국어 마스터를 향한 첫걸음을 떼신 것을 진심으로 환영합니다.\n소리튜터(Sori-Tutor)는 AI와 함께 즐겁게 발음을 교정하고 회화를 연습하는 공간입니다.`
};

const PERSONAS = [
  { id: 'su', name: '수경', role: '대학생', desc: '활발한 20대 대학생', color: 'bg-pink-50 border-pink-200', img: '/images/수경.png', voice: 'ko-KR-Chirp3-HD-Zephyr' },
  { id: 'min', name: '민철', role: '카페 사장', desc: '감성적이고 따뜻한 30대 사장님', color: 'bg-amber-50 border-amber-200', img: '/images/민철.png', voice: 'ko-KR-Chirp3-HD-Rasalgethi' },
  { id: 'jin', name: '진성', role: '면접관', desc: '논리적이고 깐깐한 대기업 부장님', color: 'bg-slate-50 border-slate-300', img: '/images/진성.png', voice: 'ko-KR-Chirp3-HD-Algenib' },
  { id: 'seol', name: '설아', role: 'K-Culture 팬', desc: '텐션 높은 K-POP/드라마 덕후', color: 'bg-purple-50 border-purple-200', img: '/images/설아.png', voice: 'ko-KR-Chirp3-HD-Despina' },
  { id: 'do', name: '도식', role: '트레이너', desc: '에너지 넘치는 헬스 트레이너', color: 'bg-blue-50 border-blue-200', img: '/images/도식.png', voice: 'ko-KR-Chirp3-HD-Achird' },
  { id: 'ju', name: '주호', role: '여행 가이드', desc: '박식하고 친절한 한국 여행 가이드', color: 'bg-green-50 border-green-200', img: '/images/주호.png', voice: 'ko-KR-Chirp3-HD-Sadachbia' },
  { id: 'hye', name: '혜선', role: '상담사', desc: '지친 마음을 위로해주는 심리 상담가', color: 'bg-rose-50 border-rose-200', img: '/images/혜선.png', voice: 'ko-KR-Chirp3-HD-Aoede' },
  { id: 'woo', name: '우주', role: '중학생', desc: '축구와 게임을 좋아하는 개구쟁이', color: 'bg-yellow-50 border-yellow-200', img: '/images/우주.png', voice: 'ko-KR-Chirp3-HD-Charon' },
  { id: 'hyun', name: '현성', role: '소설가', desc: '지적이고 시니컬한 소설 작가', color: 'bg-stone-50 border-stone-200', img: '/images/현성.png', voice: 'ko-KR-Chirp3-HD-Zubenelgenubi' },
  { id: 'sun', name: '순자', role: '국밥집 할머니', desc: '구수한 사투리와 정이 넘치는 할머니', color: 'bg-orange-50 border-orange-200', img: '/images/순자.png', voice: 'ko-KR-Chirp3-HD-Vindemiatrix' },
];

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [userRole, setUserRole] = useState<string>("guest");
  const [hearts, setHearts] = useState(3);
  const [tokens, setTokens] = useState(0);
  const [userAlias, setUserAlias] = useState<string>(""); 
  
  const [streak, setStreak] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [sharedMemory, setSharedMemory] = useState("");
  const [chatCount, setChatCount] = useState(0);

  const [inboxList, setInboxList] = useState<any[]>([]);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [inboxTab, setInboxTab] = useState<'received' | 'write'>('received');
  const [selectedMessage, setSelectedMessage] = useState<any>(null); 
  const [hasNewMail, setHasNewMail] = useState(false);
  
  const [inquiryCategory, setInquiryCategory] = useState("bug");
  const [inquiryContent, setInquiryContent] = useState("");

  // 🔥 [수정] 토큰 관련 상태 확장
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [tokenLogs, setTokenLogs] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<'earn' | 'spend'>('earn');
  const [showSpendStats, setShowSpendStats] = useState(false);

  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showPersonaRanking, setShowPersonaRanking] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<any>(null); 
  const [showAdModal, setShowAdModal] = useState(false);

  const [viewMode, setViewMode] = useState("home"); 
  const [courseType, setCourseType] = useState<"word" | "sentence" | "dialogue" | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  const [problemList, setProblemList] = useState<any[]>([]); 
  const [currentProblem, setCurrentProblem] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<any[]>([]); 
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [completedLines, setCompletedLines] = useState<number[]>([]); 
  const [rankingList, setRankingList] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]); 
  const [historyTabState, setHistoryTabState] = useState<"all" | "word" | "sentence" | "dialogue" | "free_talking">("all");
  
  const [parsedScript, setParsedScript] = useState<{role: string, text: string}[]>([]);
  const [myRole, setMyRole] = useState<"A" | "B">("A"); 
  const [targetLineIndex, setTargetLineIndex] = useState<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [result, setResult] = useState<any>(null);
  const [translation, setTranslation] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', text: string, audio?: string}[]>([]);
  const [chatStatus, setChatStatus] = useState<'select_persona'|'active'|'ended'>('select_persona');
  const [selectedPersona, setSelectedPersona] = useState<string>('su');
  const [chatFeedback, setChatFeedback] = useState<any>(null);

  const [ttsLoading, setTtsLoading] = useState(false);

  const [isShadowingMode, setIsShadowingMode] = useState(false);
  const [selectedWordData, setSelectedWordData] = useState<any>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) { handleUserChange(user); } 
        else { setCurrentUser(null); }
        setIsAuthChecking(false);
    });
    
    // 인앱 브라우저 체크
    const userAgent = navigator.userAgent.toLowerCase();
    const targetUrl = window.location.href;
    const isInApp = userAgent.match(/kakaotalk|naver|line|instagram|facebook|tiktok/i);

    if (isInApp) {
      if (userAgent.match(/android/i)) {
        const intentUrl = `intent://${targetUrl.replace(/https?:\/\//i, '')}#Intent;scheme=https;package=com.android.chrome;end;`;
        window.location.href = intentUrl;
      } else {
        alert("🔒 보안을 위해 구글 로그인은 \n'크롬'이나 '사파리'에서만 가능합니다.");
      }
    }

    return () => unsubscribe();
  }, []);

  // 모달이 열릴 때 자동으로 히스토리 50개 불러오기 (통계를 위해 넉넉히)
  useEffect(() => {
    if (showPaymentModal) {
      fetchTokenLogs();
      setHistoryTab('earn'); // 기본 탭은 획득
      setShowSpendStats(false); // 통계 닫힘 상태 초기화
    }
  }, [showPaymentModal]);

  const handleUserChange = async (user: any) => {
    setCurrentUser(user);
    if (user) {
      const userRef = doc(db, "sori_users", user.email);
      const userSnap = await getDoc(userRef);
      const today = new Date().toDateString(); 

      if (userSnap.exists()) {
        const data = userSnap.data();
        let currentStreak = data.streak || 0;
        let currentTodayCount = data.today_count || 0;

        if (data.last_access_date !== today) {
            const lastDate = new Date(data.last_access_date);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const isConsecutive = lastDate.toDateString() === yesterday.toDateString();

            if (isConsecutive) {
                if (currentTodayCount < 5) currentStreak = 0;
            } else {
                currentStreak = 0;
            }

            await updateDoc(userRef, { 
                today_count: 0, 
                last_access_date: today,
                streak: currentStreak
            });
            currentTodayCount = 0;
        }

        setUserRole(data.role || "guest");
        setTokens(data.tokens || 0);
        setUserAlias(data.alias || "");
        setStreak(currentStreak);
        setTodayCount(currentTodayCount);
        setSharedMemory(data.shared_memory || ""); 
        setChatCount(data.chat_count || 0);
        
        if (!data.alias) setShowNicknameModal(true);
        if (data.last_heart_reset !== today) { 
            await updateDoc(userRef, { free_hearts: 3, last_heart_reset: today }); 
            setHearts(3); 
        } else {
            setHearts(data.free_hearts ?? 3);
        }
        checkNewMail(user.email);
      } else {
        await setDoc(userRef, {
          email: user.email, name: user.displayName, role: "guest",
          free_hearts: 3, tokens: 0, last_heart_reset: today, joined_at: serverTimestamp(), 
          error_count: 0, analysis_count: 0, alias: "",
          streak: 0, today_count: 0, last_access_date: today,
          shared_memory: "", chat_count: 0
        });
        setUserRole("guest"); setHearts(3); setShowNicknameModal(true);
      }
    }
  };

  const logTokenTransaction = async (amount: number, reason: string, type: 'earn' | 'spend') => {
      if (!currentUser) return;
      try {
          const logsRef = collection(db, "sori_users", currentUser.email, "token_logs");
          await addDoc(logsRef, { type, amount, reason, date: serverTimestamp() });
      } catch (e) {
          console.error("Token log error", e);
      }
  };

  const fetchTokenLogs = async () => {
      if (!currentUser) return;
      try {
          // 통계를 위해 넉넉히 50개 가져옴
          const q = query(collection(db, "sori_users", currentUser.email, "token_logs"), orderBy("date", "desc"), limit(50));
          const snapshot = await getDocs(q);
          const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTokenLogs(logs);
      } catch (e) {
          console.error(e);
      }
  };

  // 🔥 [신규] 지출 통계 계산 함수
  const getSpendStats = () => {
      const stats = { word: 0, sentence: 0, chat: 0, etc: 0 };
      tokenLogs.filter(l => l.type === 'spend').forEach(l => {
          if (l.reason.includes("단어") || l.reason.includes("Word")) stats.word += l.amount;
          else if (l.reason.includes("문장") || l.reason.includes("Sentence")) stats.sentence += l.amount;
          else if (l.reason.includes("회화") || l.reason.includes("프리토킹")) stats.chat += l.amount;
          else stats.etc += l.amount;
      });
      return stats;
  };

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
              setTokens(prev => prev + 15);
              logTokenTransaction(15, "7일 연속 학습 보상", "earn");
              await addDoc(collection(db, "sori_users", currentUser.email, "inbox"), {
                  from: "소리튜터 운영진",
                  title: "🏆 7일 연속 학습 달성 보상!",
                  content: "축하합니다! 👏 15토큰이 지급되었습니다.",
                  date: serverTimestamp(),
                  read: false
              });
              setHasNewMail(true);
              alert("🎉 축하합니다! 7일 연속 학습 달성으로 15토큰이 지급되었습니다!");
          }
      }
      setTodayCount(newTodayCount);
      setStreak(newStreak);
      await updateDoc(userRef, updates);
  };

  const checkNewMail = async (email: string) => {
    const q = query(collection(db, "sori_users", email, "inbox"), where("read", "==", false));
    const snap = await getDocs(q);
    setHasNewMail(!snap.empty); 
  };

  const fetchInbox = async () => {
    setShowInboxModal(true); 
    setInboxTab('received');
    setHasNewMail(false);
    if (!currentUser) return;
    setLoading(true);
    try {
        const q = query(collection(db, "sori_users", currentUser.email, "inbox"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        const dbMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const unread = dbMsgs.filter((m: any) => !m.read);
        if (unread.length > 0) {
          const batch = writeBatch(db);
          unread.forEach((m: any) => batch.update(doc(db, "sori_users", currentUser.email, "inbox", m.id), { read: true }));
          await batch.commit(); 
        }
        setInboxList([WELCOME_MESSAGE, ...dbMsgs.map((m: any) => ({ ...m, read: true }))]);
    } catch (e) { console.error(e); setInboxList([WELCOME_MESSAGE]); } finally { setLoading(false); }
  };

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
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSendInquiry = async () => {
    if (!inquiryContent.trim()) return alert("내용을 입력해주세요.");
    if (!confirm("문의를 보내시겠습니까?")) return;
    try {
      await addDoc(collection(db, "sori_inquiries"), {
        userId: currentUser.email,
        userName: userAlias || currentUser.displayName,
        category: inquiryCategory,
        content: inquiryContent,
        createdAt: serverTimestamp(),
        status: "pending",
        adminReply: null
      });
      alert("✅ 문의가 접수되었습니다!");
      setInquiryContent("");
      setInboxTab('received');
    } catch (e) { alert("전송 실패"); }
  };

  const handleLogout = async () => { if (confirm("로그아웃 하시겠습니까?")) { await signOut(auth); window.location.reload(); } };
  const saveNickname = async (n: string) => { if (!n.trim()) return alert("닉네임 입력"); if (currentUser) { await updateDoc(doc(db, "sori_users", currentUser.email), { alias: n }); setUserAlias(n); setShowNicknameModal(false); alert(`환영합니다, ${n}님!`); } };

  const handleGoogleTTS = async (text: string, path: string | null = null, voice: string | null = null) => {
    if (!text && !path) return alert("재생할 내용이 없습니다.");
    if (path) { try { new Audio(path).play(); } catch(e) { console.error(e); } return; }
    if (ttsLoading) return; 
    try {
      setTtsLoading(true);
      const cleanText = text.replace(/[\[\]]/g, "").replace(/-/g, " ").trim();
      const formData = new FormData();
      formData.append("action", "tts_simple");
      formData.append("text", cleanText);
      formData.append("voiceName", voice || "ko-KR-Chirp3-HD-Zephyr");
      const res = await fetch("/api/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (data.audioContent) { const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`); audio.play(); }
    } catch (e) { console.error(e); } finally { setTtsLoading(false); }
  };

  const handleAdReward = async (amount: number) => {
      setShowAdModal(false); 
      const userRef = doc(db, "sori_users", currentUser.email);
      if (userRole === 'guest') {
           setHearts(prev => prev + amount);
           await updateDoc(userRef, { free_hearts: increment(amount) });
           alert(`🎉 무료 하트 ${amount}개 획득!`);
      } else {
           setTokens(prev => prev + amount);
           await updateDoc(userRef, { tokens: increment(amount) });
           logTokenTransaction(amount, "광고 시청 보상", "earn");
           alert(`🎉 토큰 ${amount}개 획득!`);
      }
  };

  const handleManualCharge = async (tokenAmount: number, price: string) => {
      const depositorName = prompt(`[${price}] 입금을 진행하실 분의 성함을 입력해주세요.`);
      if (!depositorName || depositorName.trim() === "") return;
      if (!confirm(`${depositorName}님 명의로 충전을 요청하시겠습니까?`)) return;
      try {
          await addDoc(collection(db, "sori_charge_requests"), {
              userId: currentUser.email, userAlias: userAlias || "이름없음", amount: tokenAmount, price: price, depositor: depositorName, status: "pending", createdAt: serverTimestamp()     
          });
          alert(`✅ 요청 완료! 입금 확인 후 충전됩니다.\n\n🏦 카카오뱅크 3333-29-9690780 (오준호)`);
          setShowPaymentModal(false); 
      } catch (e) { console.error(e); alert("요청 오류"); }
  };

  const enterFreeTalking = () => {
    if (tokens < 2 && userRole !== 'guest') { 
        if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true); 
        if (userRole === 'student' && tokens < 2) return setShowPaymentModal(true);
    }
    setViewMode("freetalking");
    setChatStatus('select_persona'); 
  };

  const startChatWithPersona = (personaId: string) => {
      setSelectedPersona(personaId);
      const persona = PERSONAS.find(p => p.id === personaId);
      const suffix = (persona?.name.charCodeAt(persona.name.length - 1) || 0 - 0xAC00) % 28 > 0 ? "이에요" : "예요";
      const greeting = `안녕하세요! 저는 ${persona?.name}${suffix}. 우리 대화할까요?`;
      setChatHistory([{role: "model", text: greeting}]);
      setChatStatus('active');
      setChatFeedback(null);
      handleGoogleTTS(greeting, null, persona?.voice);
  };

  const handleChatSend = async () => {
    if (!audioBlob) return;
    if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true);
    if (userRole !== 'guest' && tokens < 2) return setShowPaymentModal(true);

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
        if (data.error) { alert(data.error); setLoading(false); return; }

        if (userRole === 'guest') { 
            setHearts(p => p-1); 
            updateDoc(doc(db,"sori_users",currentUser.email), { free_hearts: increment(-1) }); 
        } else { 
            setTokens(p => p-2); 
            updateDoc(doc(db,"sori_users",currentUser.email), { tokens: increment(-2) }); 
            logTokenTransaction(2, "실전 회화 (1턴)", "spend");
        }

        const newHistory = [...chatHistory, {role: 'user', text: data.userText} as any, {role: 'model', text: data.aiText, audio: data.audioContent ? `data:audio/mp3;base64,${data.audioContent}` : null}];
        setChatHistory(newHistory);
        if (data.audioContent) { new Audio(`data:audio/mp3;base64,${data.audioContent}`).play(); }
        if (data.ended) setChatStatus('ended');
        setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch(e) { alert("통신 오류"); } finally { setLoading(false); setAudioUrl(null); setAudioBlob(null); }
  };

  const handleMemoryUpdate = async (dialog: string) => {
    try {
       const newCount = chatCount + 1;
       const mode = newCount % 5 === 0 ? 'compress' : 'append';
       const formData = new FormData();
       formData.append("action", "memory_sync");
       formData.append("currentMemory", sharedMemory);
       formData.append("newDialog", dialog);
       formData.append("mode", mode);
       const res = await fetch("/api/chat", { method: "POST", body: formData });
       const data = await res.json();
       if (data.summary && data.summary !== "정보 없음") {
           const newMemory = mode === 'compress' ? data.summary : sharedMemory + " " + data.summary;
           setSharedMemory(newMemory);
           await updateDoc(doc(db, "sori_users", currentUser.email), { shared_memory: newMemory, chat_count: newCount });
           setChatCount(newCount);
       }
    } catch(e) { console.error("Memory sync fail", e); }
  };

  const handleChatFeedback = async () => {
      if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true);
      if (userRole !== 'guest' && tokens < 2) return setShowPaymentModal(true);
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append("action", "feedback");
          formData.append("history", JSON.stringify(chatHistory));
          const res = await fetch("/api/chat", { method: "POST", body: formData });
          const data = await res.json();
          if (data.error) { alert(data.error); return; }
          setChatFeedback(data);
          
          if (userRole === 'guest') { 
              setHearts(p => p-1); 
              updateDoc(doc(db,"sori_users",currentUser.email), { free_hearts: increment(-1) }); 
          } else { 
              setTokens(p => p-2); 
              updateDoc(doc(db,"sori_users",currentUser.email), { tokens: increment(-2) }); 
              logTokenTransaction(2, "회화 피드백 분석", "spend");
          }
          updateDoc(doc(db,"sori_users",currentUser.email), { points: increment(10) });
          await updateDailyProgress();

          const currentPersona = PERSONAS.find(p=>p.id===selectedPersona);
          const pName = currentPersona?.name || "AI";
          await addDoc(collection(db, "sori_users", currentUser.email, "history"), {
            text: `${pName}와의 대화`, score: 0, recognized: "", correct: "",
            feedback: `🗣️ 발음: ${data.pronunciation}\n🎭 억양: ${data.intonation}\n💡 총평: ${data.general}`, advice: data.general, type: "free_talking", date: serverTimestamp()
          });
          const fullDialog = chatHistory.map(m => `${m.role}:${m.text}`).join("\n");
          handleMemoryUpdate(fullDialog);
      } catch(e) { alert("피드백 생성 실패"); } finally { setLoading(false); }
  };

  const handleTranslateFeedback = async () => {
      if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true);
      if (userRole !== 'guest' && tokens < 0.5) return setShowPaymentModal(true);
      if(!confirm("번역하시겠습니까? (0.5🪙)")) return; 
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append("action", "translate");
          const text = chatFeedback ? `Pronunciation: ${chatFeedback.pronunciation}\nGeneral: ${chatFeedback.general}` : `Explanation: ${result.explanation}\nAdvice: ${result.advice}`;
          formData.append("text", text);
          const res = await fetch("/api/chat", { method: "POST", body: formData });
          const data = await res.json();
          if (data.error) { alert(data.error); return; }
          setTranslation(data.translatedText);
          if (userRole === 'guest') { 
              setHearts(p=>p-1); updateDoc(doc(db,"sori_users",currentUser.email), { free_hearts: increment(-1) }); 
          } else { 
              setTokens(p=>p-0.5); updateDoc(doc(db,"sori_users",currentUser.email), { tokens: increment(-0.5) }); 
              logTokenTransaction(0.5, "피드백 번역", "spend");
          }
          if (!showTranslateModal && viewMode === 'freetalking') setShowTranslateModal(true);
      } catch(e) { alert("번역 실패"); } finally { setLoading(false); }
  };

  const handleHistoryTranslate = async (item: any) => {
      if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true);
      if (userRole !== 'guest' && tokens < 0.5) return setShowPaymentModal(true);
      if (!confirm("이 기록을 번역하시겠습니까? (0.5🪙)")) return;
      const text = item.feedback || item.explanation || item.advice;
      if (!text) return alert("내용이 없습니다.");
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append("action", "translate");
          formData.append("text", text);
          const res = await fetch("/api/chat", { method: "POST", body: formData });
          const data = await res.json();
          if (data.error) { alert(data.error); return; }
          alert(`[번역 결과]\n${data.translatedText}`); 
          if (userRole === 'guest') { 
              setHearts(p=>p-1); updateDoc(doc(db,"sori_users",currentUser.email), { free_hearts: increment(-1) }); 
          } else { 
              setTokens(p=>p-0.5); updateDoc(doc(db,"sori_users",currentUser.email), { tokens: increment(-0.5) }); 
              logTokenTransaction(0.5, "기록 번역", "spend");
          }
      } catch(e) { alert("오류"); } finally { setLoading(false); }
  };

  const selectCourse = async (type: any) => { 
      setCourseType(type); setResult(null); setCompletedLines([]);
      if(type === "word" || type === "dialogue"){ 
          const s = await getDocs(query(collection(db, type === "word" ? "sori_curriculum_word" : "sori_curriculum_dialogue"))); 
          const list = s.docs.map(d=>({id:d.id,...d.data()}));
          setProblemList(list); if(list.length > 0) initPractice(list); setViewMode("practice"); 
      } else { 
          const s = await getDocs(collection(db,`sori_curriculum_${type}`)); 
          const c = new Set<string>(); s.forEach(d=>c.add(d.data().category)); 
          setCategories(Array.from(c).sort()); setViewMode("category"); 
      } 
  };

  const selectCategory = async (cat: string) => { setSelectedCategory(cat); const q=query(collection(db,`sori_curriculum_${courseType}`),where("category","==",cat)); const s=await getDocs(q); setProblemList(s.docs.map(d=>({id:d.id,...d.data()}))); if(!s.empty) initPractice(s.docs.map(d=>d.data())); setViewMode("practice"); setResult(null); setAudioUrl(null); };
  const initPractice = (list: any[]) => { const r=Math.floor(Math.random()*list.length); updateCurrentProblem(list[r]); setHistoryStack([list[r]]); setHistoryIndex(0); };
  const handleNextProblem = () => { if(problemList.length>0){ const r=Math.floor(Math.random()*problemList.length); updateCurrentProblem(problemList[r]); }};
  const handlePrevProblem = () => { if(historyIndex>0){ setHistoryIndex(p=>p-1); updateCurrentProblem(historyStack[historyIndex-1]); }};
  const updateCurrentProblem = (prob: any) => { setCurrentProblem(prob); setResult(null); setAudioUrl(null); setCompletedLines([]); setTranslation(null); if(prob.script) parseDialogue(prob.script); };
  const parseDialogue = (s: string) => { if (!s) { setParsedScript([]); return; } setParsedScript(s.split("|").map(l => { const parts = l.split(":"); return { role: parts[0]?.trim() || "System", text: parts[1]?.trim() || "" }; })); setTargetLineIndex(null); };
  
  const handleWordClick = async (word: string, context: string) => {
      const cleanWord = word.replace(/[.,?!~]/g, "");
      if (!cleanWord) return;
      if (userRole !== 'guest' && tokens < 0.5) { alert("단어 검색에는 0.5 토큰이 필요합니다."); setShowPaymentModal(true); return; }
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append("action", "define");
          formData.append("word", cleanWord);
          formData.append("context", context);
          const res = await fetch("/api/chat", { method: "POST", body: formData });
          const data = await res.json();
          if(data.error) throw new Error(data.error);
          setSelectedWordData(data);
          setShowWordModal(true);
          if (userRole !== 'guest') {
              setTokens(p => p - 0.5);
              updateDoc(doc(db, "sori_users", currentUser.email), { tokens: increment(-0.5) });
              logTokenTransaction(0.5, "단어 뜻 검색", "spend");
              alert("🔍 단어 검색으로 0.5 토큰이 차감되었습니다.");
          }
      } catch (e) { alert("단어 정보 로딩 실패"); } finally { setLoading(false); }
  };

  const saveVocabulary = async () => {
      if (!selectedWordData || !currentUser) return;
      try {
          await addDoc(collection(db, "sori_users", currentUser.email, "vocabulary"), {
              word: selectedWordData.word,
              meaning_kr: selectedWordData.meaning_kr,
              meaning_en: selectedWordData.meaning_en,
              example: selectedWordData.example,
              savedAt: serverTimestamp()
          });
          alert("저장되었습니다!"); setShowWordModal(false);
      } catch (e) { alert("저장 실패"); }
  };

  const renderClickableMessage = (text: string, role: string) => {
      const words = text.split(" ");
      return ( <p className="leading-relaxed"> {words.map((word, idx) => ( <span key={idx} onClick={() => handleWordClick(word, text)} className={`inline-block mr-1 cursor-pointer rounded px-0.5 transition ${role === 'model' ? 'hover:bg-slate-200' : 'hover:bg-blue-500 hover:text-white'}`}> {word} </span> ))} </p> );
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = () => { const blob = new Blob(chunksRef.current, { type: "audio/webm" }); setAudioUrl(URL.createObjectURL(blob)); setAudioBlob(blob); chunksRef.current = []; stream.getTracks().forEach(track => track.stop()); if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); if(audioContextRef.current) audioContextRef.current.close(); };
      mediaRecorderRef.current.start();
      setRecording(true);
      setResult(null);
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      dataArrayRef.current = dataArray;
      detectSilence(); 
    } catch (e) { alert("마이크 권한 필요"); }
  };

  const detectSilence = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
    const average = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
    const SILENCE_THRESHOLD = 15; 
    if (average > SILENCE_THRESHOLD) { if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; } } 
    else { if (!silenceTimer.current) { silenceTimer.current = setTimeout(() => { stopRecording(); }, 1500); } }
    animationFrameRef.current = requestAnimationFrame(detectSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') { mediaRecorderRef.current.stop(); setRecording(false); if (silenceTimer.current) clearTimeout(silenceTimer.current); }
  };
  
  const analyzeAudio = async () => {
    if (!audioBlob || !currentProblem) return;
    if (userRole === "guest" && hearts <= 0) return setShowPaymentModal(true);
    const cost = courseType === 'word' ? 0.5 : 1;
    if (userRole === "student" && tokens < cost) return setShowPaymentModal(true);
    setLoading(true); setResult(null); setTranslation(null);
    let targetText = currentProblem.text; let contextInfo = ""; 
    if (courseType === "dialogue" && targetLineIndex !== null) { targetText = parsedScript[targetLineIndex].text; contextInfo = `상황: ${currentProblem.title}, 역할: ${myRole}`; }
    const formData = new FormData(); 
    formData.append("audio", audioBlob); formData.append("targetText", targetText); formData.append("context", contextInfo); formData.append("userNick", userAlias || "학습자");
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); } else {
        setResult(data);
        const userRef = doc(db, "sori_users", currentUser.email);
        const earnedPoints = courseType === 'word' ? 2 : 3;
        if (userRole === "guest") { setHearts(p=>p-1); await updateDoc(userRef, { free_hearts: increment(-1), points: increment(earnedPoints) }); }
        else { setTokens(p=>p-cost); await updateDoc(userRef, { tokens: increment(-cost), points: increment(earnedPoints) }); logTokenTransaction(cost, `발음 분석 (${courseType})`, "spend"); }
        await updateDailyProgress();
        if (courseType === "dialogue" && targetLineIndex !== null) { if (!completedLines.includes(targetLineIndex)) setCompletedLines(prev => [...prev, targetLineIndex]); }
        await addDoc(collection(db, "sori_users", currentUser.email, "history"), { text: targetText, score: data.score, recognized: data.recognized, correct: data.correct, feedback: data.explanation, advice: data.advice, type: courseType, date: serverTimestamp() });
      }
    } catch (error) { alert("서버 오류"); } finally { setLoading(false); }
  };

  const isAllMyLinesFinished = () => {
      if (courseType !== 'dialogue') return false;
      if (!parsedScript || !completedLines) return false;
      const myLinesIndices = parsedScript.map((line, idx) => line.role === myRole ? idx : -1).filter(i => i !== -1);
      return myLinesIndices.every(i => completedLines.includes(i));
  };

  if (isAuthChecking) return <div className="flex h-screen items-center justify-center bg-slate-50">로딩 중...</div>;

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col">
        <nav className="flex justify-between items-center p-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-200">S</div>
            <span className="font-black text-2xl text-slate-800">Sori-Tutor</span>
          </div>
          <div><Login onUserChange={handleUserChange} /></div>
        </nav>
        <section className="flex-1 flex flex-col justify-center items-center text-center px-6 py-12 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-4 px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold inline-block">✨ AI 기반 한국어 회화 코칭</div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight mb-6">한국어, <br className="md:hidden" />이제 <span className="text-blue-600">AI 친구</span>와<br /> 실전처럼 연습하세요.</h1>
          <p className="text-slate-500 text-lg md:text-xl mb-10 leading-relaxed max-w-2xl">단어 연습부터 프리토킹까지.<br />구글의 최신 AI 기술이 당신의 발음과 억양을<br className="md:hidden" /> 실시간으로 교정해 드립니다.</p>
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm transform hover:scale-105 transition duration-300">
             <p className="text-slate-500 mb-6 font-bold text-sm">👇 3초 만에 시작하기</p>
             <Login onUserChange={handleUserChange} />
             <p className="text-xs text-slate-400 mt-4">* 회원가입 시 매일 무료 하트 제공</p>
          </div>
        </section>
        <footer className="bg-slate-50 py-8 text-center text-xs text-slate-400 border-t border-slate-200">
          <p className="mb-4">© 2026 Sori-Tutor. All rights reserved.</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-slate-50 max-w-lg mx-auto shadow-2xl relative overflow-hidden">
      <header className="bg-white px-5 py-3 flex justify-between items-center flex-none z-40 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode("home")}>
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">S</div>
           <span className="font-bold text-lg text-slate-800">Sori-Tutor</span>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={fetchInbox} className="relative text-slate-600 hover:text-blue-600 transition p-1">
             <span className="text-2xl">📮</span> 
             {hasNewMail && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
           </button>
           <button onClick={handleLogout} className="text-xl hover:scale-110 transition ml-1" title="로그아웃">👋</button>
        </div>
      </header>

      <div className="bg-white px-5 py-2 flex justify-between items-center border-b border-slate-50 text-sm flex-none">
         <div className="flex gap-2">
            <button onClick={fetchRanking} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full font-bold hover:bg-yellow-100 transition"><Trophy size={14} /> 랭킹</button>
            <button onClick={fetchHistory} className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold hover:bg-slate-200 transition">내 기록</button>
         </div>
         <div className="flex items-center gap-1 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded-full border border-slate-200" onClick={() => setShowPaymentModal(true)}>
            {userRole === 'guest' ? (
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((i) => (
                  <Heart key={i} size={16} className={i <= hearts ? "text-red-500 fill-red-500" : "text-slate-300"} />
                ))}
              </div>
            ) : (
              <><Coins size={14} className="text-yellow-500" fill="currentColor"/><span className="font-bold text-slate-700">{tokens.toFixed(1).replace(/\.0$/, '')}</span></>
            )}
         </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide pb-24">
        {viewMode === "home" && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <h3 className="font-bold text-slate-800 text-lg">{userAlias || currentUser?.displayName}님</h3>
                   <button onClick={() => setShowNicknameModal(true)} className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50">변경</button>
                 </div>
                 <div className="mt-2">
                    <p className="text-xs text-slate-500 mb-1">일일 목표 <span className="font-bold text-orange-500">{Math.min(todayCount, 5)}/5</span></p>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500 transition-all duration-500 ease-out" style={{ width: `${Math.min((todayCount / 5) * 100, 100)}%` }}></div></div>
                 </div>
               </div>
               <div className="text-center bg-orange-50 px-4 py-3 rounded-xl min-w-[80px]"><p className="text-2xl font-black text-orange-500 mb-1">{streak} <span className="text-sm font-bold text-orange-400">일</span></p><p className="text-[10px] text-orange-700 font-bold">연속 학습중</p></div>
            </div>

            <div className="grid gap-3">
              {[
                {id:'word', t:'단어 발음 연습', d:'기초 어휘 마스터', icon: <Mic />, color: 'blue'}, 
                {id:'sentence', t:'문장 억양 연습', d:'자연스러운 억양 익히기', icon: <Star />, color: 'indigo'}, 
                {id:'dialogue', t:'실전 회화', d:'AI와 역할극 대화', icon: <MessageSquare />, color: 'purple'}
              ].map((item) => (
                <button key={item.id} onClick={() => selectCourse(item.id as any)} className={`w-full p-5 rounded-2xl text-left bg-white shadow-sm border border-slate-100 hover:border-${item.color}-500 hover:bg-${item.color}-50 transition group flex items-center gap-4`}>
                  <div className={`w-12 h-12 rounded-full bg-${item.color}-100 text-${item.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform`}>{item.icon}</div>
                  <div><div className="text-lg font-bold text-slate-800 group-hover:text-${item.color}-700">{item.t}</div><div className="text-sm text-slate-500">{item.d}</div></div>
                </button>
              ))}
              
              <button onClick={enterFreeTalking} className="w-full p-5 rounded-2xl text-left bg-gradient-to-r from-green-50 to-emerald-50 shadow-sm border border-green-100 hover:border-green-500 transition group flex items-center gap-4 relative overflow-hidden">
                  <div className="absolute top-3 right-3 bg-white/80 backdrop-blur px-2 py-1 rounded-full text-[10px] font-bold text-green-700 border border-green-200">🪙 토큰 2개 / 턴</div>
                  <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform"><MessageCircle /></div>
                  <div><div className="text-lg font-bold text-slate-800">한국어 자유 회화 (Beta)</div><div className="text-sm text-slate-500">AI와 자유 대화</div></div>
              </button>
            </div>
          </div>
        )}

        {viewMode === "category" && (
          <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 font-bold flex items-center gap-1 hover:text-blue-600"><ChevronLeft size={20}/> 메인으로</button>
            <div className="grid grid-cols-2 gap-3">{categories.map(cat => <button key={cat} onClick={() => selectCategory(cat)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:text-blue-600 font-bold text-slate-700 text-lg transition">{cat}</button>)}</div>
          </div>
        )}

        {viewMode === "history" && (
          <div className="space-y-4">
             <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 flex items-center gap-1"><ChevronLeft/> 메인으로</button>
             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {['all', 'word', 'sentence', 'dialogue', 'free_talking'].map(tab => (
                    <button key={tab} onClick={() => setHistoryTabState(tab as any)} className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition border ${historyTabState === tab ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>{tab === 'all' ? '전체' : tab === 'word' ? '단어' : tab === 'sentence' ? '문장' : '회화'}</button>
                ))}
             </div>
             <div className="space-y-3">
               {historyList.filter(h => historyTabState === 'all' || h.type === historyTabState || (historyTabState === 'dialogue' && h.type === 'free_talking')).map(h => ( 
                   <div key={h.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                       <div className="text-[10px] text-slate-400 mb-1">{h.date?.toDate ? h.date.toDate().toLocaleDateString() : new Date().toLocaleDateString()}</div>
                       <div className="flex justify-between items-start mb-2">
                           <h4 className="font-bold text-slate-800 text-lg truncate pr-10">{h.text}</h4>
                           {h.type !== 'free_talking' && <span className={`text-sm font-black px-2 py-1 rounded ${h.score >= 80 ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{h.score}점</span>}
                       </div>
                       <div className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2 line-clamp-2">
                           {h.feedback || h.explanation || h.advice || "내용 없음"}
                       </div>
                       <div className="flex justify-end gap-2">
                           <button onClick={() => setShowFeedbackModal(h)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1 text-slate-500">📄 자세히</button>
                           <button onClick={() => handleHistoryTranslate(h)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1 text-slate-500"><Languages size={10}/> 번역 (0.5🪙)</button>
                       </div>
                   </div>
               ))}
               {historyList.length === 0 && <p className="text-center text-slate-400 py-10">기록이 없습니다.</p>}
             </div>
          </div>
        )}

        {viewMode === "freetalking" && (
          <div className="flex flex-col h-full pb-24">
             {chatStatus === 'select_persona' && (
               <div className="animate-in fade-in zoom-in space-y-4">
                 <div className="flex items-center justify-between mb-2">
                   <button onClick={() => setViewMode("home")} className="p-2 bg-white rounded-full border"><ChevronLeft/></button>
                   <h2 className="text-lg font-bold">대화 상대를 선택하세요</h2>
                   <button onClick={() => setShowPersonaRanking(true)} className="p-2 bg-yellow-100 text-yellow-700 rounded-full font-bold text-xs flex items-center gap-1"><Crown size={14}/> 인기순위</button>
                 </div>
                 <div className="grid grid-cols-2 gap-3 pb-20">
                   {PERSONAS.map(p => (
                     <div key={p.id} onClick={() => startChatWithPersona(p.id)} className={`p-3 rounded-2xl border-2 cursor-pointer transition hover:scale-105 ${p.color} bg-white shadow-sm flex flex-col items-center text-center`}>
                        <div className="w-20 h-20 rounded-full overflow-hidden mb-2 border-2 border-white shadow-md"><img src={p.img} alt={p.name} className="w-full h-full object-cover object-top" /></div>
                        <h3 className="text-lg font-black text-slate-800">{p.name}</h3>
                        <span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full mb-1 text-slate-600">{p.role}</span>
                        <p className="text-xs opacity-70 leading-tight mt-1">{p.desc}</p>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             {chatStatus !== 'select_persona' && (
               <>
                 <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-50 z-10 py-2">
                   <button onClick={() => setViewMode("home")} className="p-2 bg-white rounded-full border"><X size={20}/></button>
                   <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full overflow-hidden border"><img src={PERSONAS.find(p=>p.id===selectedPersona)?.img} className="w-full h-full object-cover object-top"/></div>
                       <span className="font-bold text-slate-700">{PERSONAS.find(p=>p.id===selectedPersona)?.name}</span>
                   </div>
                   <div className="w-10"></div>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                   <div className="text-center text-xs text-slate-400 my-2">💡 모르는 단어를 클릭하면 뜻을 볼 수 있어요!</div>
                   {chatHistory.map((msg, idx) => (
                     <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed relative group ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                         {renderClickableMessage(msg.text, msg.role)}
                         {msg.role === 'model' && msg.audio && (
                           <button onClick={() => new Audio(msg.audio).play()} className="absolute -right-8 top-2 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm text-slate-500 hover:text-blue-600"><Volume2 size={14} /></button>
                         )}
                       </div>
                     </div>
                   ))}
                   <div ref={chatScrollRef}></div>
                 </div>
                 {chatStatus === 'ended' && !chatFeedback && (
                   <div className="bg-slate-800 text-white p-4 rounded-xl text-center animate-in fade-in">
                     {loading ? (
                        <div className="flex flex-col items-center gap-2 py-4"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div><p className="text-sm font-bold leading-relaxed text-center opacity-90">AI가 분석중입니다... 📝</p></div>
                     ) : (
                        <><p className="mb-3 font-bold">대화가 종료되었습니다 👋</p><button onClick={handleChatFeedback} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 transition">📝 종합 피드백 받기</button></>
                     )}
                   </div>
                 )}
                 {chatFeedback && (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg animate-in slide-in-from-bottom relative">
                       <button onClick={handleTranslateFeedback} className="absolute top-4 right-4 text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1"><Languages size={12}/> {translation ? "번역 내용 보기" : "번역 (0.5🪙)"}</button>
                       <h3 className="font-bold text-lg mb-3 border-b pb-2">📋 대화 분석 리포트</h3>
                       <div className="space-y-3 text-sm">
                          <div><span className="font-bold text-blue-600 block">🗣️ 발음 및 어휘</span><p className="text-slate-700">{chatFeedback.pronunciation || "내용 없음"}</p></div>
                          <div><span className="font-bold text-purple-600 block">🎭 억양과 감정</span><p className="text-slate-700">{chatFeedback.intonation || "내용 없음"}</p></div>
                          <div><span className="font-bold text-green-600 block">💡 총평</span><p className="text-slate-700">{chatFeedback.general || "내용 없음"}</p></div>
                          {translation && (<div className="mt-3 pt-3 border-t border-slate-100"><p className="text-xs font-bold text-purple-600 mb-1">🌏 번역된 피드백</p><p className="text-xs text-slate-700 whitespace-pre-wrap">{translation}</p></div>)}
                       </div>
                       <button onClick={() => setViewMode('home')} className="w-full mt-4 bg-slate-100 py-3 rounded-xl font-bold text-slate-600">메인으로</button>
                    </div>
                 )}
               </>
             )}
          </div>
        )}

        {viewMode === "practice" && currentProblem && (
          <div className="flex flex-col h-full pb-24">
            <div className="flex justify-between items-center mb-4">
               <button onClick={() => setViewMode("home")}><X size={20}/></button>
               {courseType === 'dialogue' && (
                   <div className="flex gap-2">
                       <button onClick={() => setMyRole("A")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${myRole === "A" ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}>A (나)</button>
                       <button onClick={() => setMyRole("B")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${myRole === "B" ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}>B (나)</button>
                   </div>
               )}
               {courseType !== 'dialogue' && (
                   <div className="flex items-center gap-2">
                       <span className={`text-xs font-bold ${isShadowingMode ? "text-purple-600" : "text-slate-400"}`}>쉐도잉 모드</span>
                       <button onClick={() => setIsShadowingMode(!isShadowingMode)} className={`w-10 h-5 rounded-full relative transition ${isShadowingMode ? "bg-purple-600" : "bg-slate-300"}`}>
                           <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${isShadowingMode ? "left-6" : "left-1"}`}></div>
                       </button>
                   </div>
               )}
            </div>
            {result ? (
                <div className="flex flex-col gap-4 h-full overflow-y-auto">
                   <div className="flex-1 space-y-4">
                       <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-2 border-b">
                           <h3 className="font-bold text-lg text-slate-800">분석 결과</h3>
                           <span className={`text-2xl font-black ${result.score >= 80 ? 'text-green-500' : 'text-orange-500'}`}>{result.score}점</span>
                       </div>
                       <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                           <div><span className="text-xs font-bold text-slate-400 block mb-1">인식된 소리</span><div className="text-lg font-bold text-red-500 tracking-wide bg-white p-2 rounded border border-red-100">{result.recognized}</div></div>
                           <div className="flex justify-center"><div className="w-0.5 h-3 bg-slate-300"></div></div>
                           <div><span className="text-xs font-bold text-slate-400 block mb-1">정답 소리</span><div className="text-lg font-bold text-green-600 tracking-wide bg-white p-2 rounded border border-green-100">{result.correct}</div></div>
                       </div>
                       <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3 relative">
                           <button onClick={handleTranslateFeedback} className="absolute top-4 right-4 text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded shadow-sm hover:bg-blue-100 flex items-center gap-1"><Languages size={12}/> 번역 (0.5🪙)</button>
                           <div className="flex items-start gap-2"><CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0"/><div><span className="text-xs font-bold text-blue-500 block">발음 교정</span><p className="text-sm text-blue-800 font-bold leading-snug">{result.explanation}</p></div></div>
                           {result.advice && (<div className="flex items-start gap-2 pt-2 border-t border-blue-200"><Info size={16} className="text-indigo-500 mt-0.5 shrink-0"/><div><span className="text-xs font-bold text-indigo-500 block">억양 / 감정 Tip</span><p className="text-xs text-indigo-700 leading-relaxed">{result.advice}</p></div></div>)}
                           {translation && (<div className="mt-3 pt-3 border-t border-blue-200 animate-in fade-in"><p className="text-xs font-bold text-purple-600 mb-1">🌏 번역된 피드백</p><p className="text-xs text-slate-700 whitespace-pre-wrap">{translation}</p></div>)}
                       </div>
                   </div>
                   <div className="flex flex-col gap-2 shrink-0 bg-white pt-2 border-t mt-4">
                       <button onClick={() => { setResult(null); setAudioUrl(null); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition"><Mic size={18}/> 다시 녹음하기</button>
                       <button onClick={() => { setResult(null); setAudioUrl(null); if (courseType !== 'dialogue') handleNextProblem(); }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 shrink-0 shadow-lg">{courseType === "dialogue" ? "확인" : "다음 문제 (랜덤)"}</button>
                   </div>
                </div>
            ) : (
               <div className="flex flex-col h-full">
                   {isShadowingMode && courseType !== 'dialogue' && (
                       <div className="bg-purple-50 text-purple-700 text-xs p-2 rounded-lg mb-4 text-center animate-in fade-in">
                           🎧 <b>Shadowing:</b> 원어민 음성을 듣고 동시에 따라 말해보세요!<br/>억양과 속도를 맞추는 데 효과적입니다.
                       </div>
                   )}
                   {courseType === "dialogue" ? (
                       <div className="space-y-6 flex-1 pb-10">
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                              <h1 className="font-bold text-lg text-purple-900">{currentProblem.title}</h1>
                              <p className="text-sm text-purple-700 mt-1">{currentProblem.translation}</p>
                          </div>
                          <div className="space-y-4">
                              {parsedScript.map((line, idx) => {
                                  const isMe = line.role === myRole;
                                  const isCompleted = completedLines.includes(idx);
                                  return (
                                      <div key={idx} onClick={() => { if(isMe){ setTargetLineIndex(idx); setResult(null); setAudioUrl(null); }}} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                          <div className={`max-w-[85%] p-3 rounded-2xl relative cursor-pointer border-2 transition-all 
                                              ${isMe 
                                                  ? (targetLineIndex === idx ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-200' : isCompleted ? 'bg-blue-50 border-blue-200 opacity-60' : 'bg-blue-50 border-blue-300 shadow-sm text-slate-800') 
                                                  : 'bg-white border-gray-200 text-slate-600'} 
                                              ${isMe ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                                              
                                              <span className="text-[10px] font-bold block opacity-50 mb-1">{line.role}</span>
                                              <p className={`text-base font-medium leading-snug ${isMe ? 'text-slate-900' : 'text-slate-700'}`}>{line.text}</p>
                                              <button onClick={(e)=>{e.stopPropagation(); handleGoogleTTS(line.text, currentProblem.audio_paths?.[idx], null)}} className="absolute -right-2 -bottom-2 bg-white border rounded-full p-1 shadow-sm hover:bg-gray-50"><Volume2 size={12} className="text-gray-500"/></button>
                                              {isMe && isCompleted && (<div className="absolute -left-6 top-1/2 -translate-y-1/2 text-green-500"><CheckCircle size={16}/></div>)}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                       </div>
                    ) : (
                       <div className="flex-1 flex flex-col justify-center items-center pb-20 animate-in zoom-in duration-300">
                           <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center mb-6 w-full relative">
                              <button onClick={(e) => {e.stopPropagation(); const textToRead = currentProblem.pronunciation ? currentProblem.pronunciation : currentProblem.text; handleGoogleTTS(textToRead, currentProblem.audio_path);}} className="absolute top-4 right-4 bg-blue-100 text-blue-600 p-3 rounded-full hover:bg-blue-200 transition hover:scale-110">
                                {ttsLoading ? (<div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>) : (<Volume2 size={24} />)}
                              </button>
                              <h1 className="text-4xl font-black text-slate-800 mb-4 break-keep leading-tight">{currentProblem.text}</h1>
                              {currentProblem.pronunciation && (<p className="text-xl text-slate-500 font-serif mb-8 italic">{currentProblem.pronunciation}</p>)}
                              <div className="bg-slate-50 text-slate-600 text-sm font-medium p-3 rounded-xl inline-block border border-slate-200">💡 {courseType==="word" ? currentProblem.tip : currentProblem.translation}</div>
                           </div>
                       </div>
                    )}
               </div>
            )}
          </div>
        )}
      </div>

      {/* 녹음 UI */}
      {((viewMode === "freetalking" && chatStatus === 'active') || (viewMode === "practice" && !result)) && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] rounded-t-3xl z-50">
             <div className="flex flex-col items-center gap-4">
                 {loading && <div className="text-slate-500 animate-pulse font-bold text-sm">{viewMode === 'freetalking' ? 'AI가 답변을 생각하고 있어요... 🤔' : 'AI가 소리를 분석 중입니다... 🎧'}</div>}
                 
                 {!recording && !audioUrl && !loading && isShadowingMode && viewMode === 'practice' && courseType !== 'dialogue' && (
                     <button 
                        onClick={() => {
                            const audioPath = currentProblem.audio_path;
                            if(audioPath) {
                                new Audio(audioPath).play();
                                setTimeout(() => startRecording(), 500); 
                            } else {
                                handleGoogleTTS(currentProblem.text);
                                setTimeout(() => startRecording(), 2000);
                            }
                        }}
                        className="w-16 h-16 rounded-full bg-purple-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition animate-pulse"
                     >
                        <Headphones size={28}/>
                     </button>
                 )}

                 {!recording && !audioUrl && !loading && (!isShadowingMode || viewMode !== 'practice' || courseType === 'dialogue') && (
                    <button onClick={startRecording} className="w-16 h-16 rounded-full bg-green-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition"><Mic size={32}/></button>
                 )}
                 {recording && (
                    <div className="flex flex-col items-center"><button onClick={stopRecording} className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100"><div className="w-6 h-6 bg-white rounded-md"></div></button><span className="text-xs text-red-500 font-bold mt-2">녹음 중...</span></div>
                 )}
                 {audioUrl && !recording && !loading && (
                      <div className="flex gap-2 w-full animate-in slide-in-from-bottom">
                          <button onClick={() => {setAudioUrl(null); setAudioBlob(null);}} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
                          {viewMode === 'freetalking' 
                            ? <button onClick={handleChatSend} className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2"><Send size={18}/> 전송 (-2🪙)</button>
                            : <button onClick={analyzeAudio} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md">피드백 받기</button>
                          }
                      </div>
                 )}

                 {!audioUrl && !recording && !loading && viewMode === 'practice' && courseType === 'dialogue' && isAllMyLinesFinished() && (
                     <div className="w-full animate-in slide-in-from-bottom">
                         <button onClick={handleNextProblem} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:scale-[1.02] transition">🎉 참 잘했어요! 다음 대화로 이동 ▶</button>
                     </div>
                 )}
             </div>
        </div>
      )}

      {/* 🌟 충전소(PaymentModal) + 토큰 히스토리 탭 추가 (업그레이드됨) */}
      {showPaymentModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
                  <div className="bg-slate-900 p-5 text-white text-center flex-none relative">
                      <h2 className="text-xl font-bold">충전소 & 히스토리</h2>
                      <button onClick={() => setShowPaymentModal(false)} className="absolute top-5 right-5 text-white/70 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                      <div className="mb-6">
                          <h3 className="text-sm font-bold text-slate-500 mb-3 block">⚡ 토큰 충전</h3>
                          <div className="grid grid-cols-1 gap-2">
                              <button onClick={() => handleManualCharge(100, "2,900원")} className="w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold hover:bg-blue-100 flex justify-between px-4"><span>💎 100 토큰</span><span>2,900원</span></button>
                              <button onClick={() => handleManualCharge(250, "5,900원")} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg flex justify-between px-4"><span>💎 250 토큰</span><span>5,900원</span></button>
                              <button onClick={() => { setShowPaymentModal(false); setShowAdModal(true); }} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200 text-sm flex items-center justify-center gap-2 mt-2">📺 광고 보고 무료 충전</button>
                          </div>
                      </div>
                      
                      <div className="pt-6 border-t border-slate-100">
                          <div className="flex justify-between items-center mb-3">
                              <h3 className="text-sm font-bold text-slate-500 flex items-center gap-1"><History size={14}/> 최근 사용 내역</h3>
                              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                                  <button onClick={() => setHistoryTab('earn')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${historyTab === 'earn' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>획득</button>
                                  <button onClick={() => setHistoryTab('spend')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${historyTab === 'spend' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>차감</button>
                              </div>
                          </div>

                          <div className="bg-slate-50 rounded-xl p-1 min-h-[150px] border border-slate-100">
                              {historyTab === 'spend' && (
                                  <div className="mb-2 px-2">
                                      <button onClick={() => setShowSpendStats(!showSpendStats)} className="w-full py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-1 hover:bg-slate-50 mb-2">
                                          {showSpendStats ? <TrendingDown size={14}/> : <PieChart size={14}/>} {showSpendStats ? "지출 통계 접기" : "지출 유형별 분석 보기"}
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
                                  {tokenLogs.filter(l => l.type === historyTab).slice(0, 5).map((log) => (
                                      <div key={log.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                                          <div>
                                              <span className="font-bold text-slate-700 text-xs block">{log.reason}</span>
                                              <span className="text-slate-400 text-[10px]">{log.date?.toDate().toLocaleDateString()}</span>
                                          </div>
                                          <span className={`font-bold text-xs ${log.type === 'earn' ? 'text-green-600' : 'text-red-500'}`}>
                                              {log.type === 'earn' ? '+' : '-'}{log.amount}
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

      {/* ... (나머지 모달들 유지) ... */}
      {showAdModal && (<AdModal onClose={() => setShowAdModal(false)} onReward={handleAdReward} />)}
      {showTranslateModal && translation && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl">
                  <button onClick={() => setShowTranslateModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  <h2 className="text-lg font-black mb-3 text-purple-700 flex items-center gap-2"><Languages size={18}/> 번역 결과</h2>
                  <div className="max-h-[60vh] overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{translation}</div>
              </div>
          </div>
      )}
      {showFeedbackModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl flex flex-col max-h-[80vh]">
                  <button onClick={() => setShowFeedbackModal(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  <h2 className="text-lg font-black mb-4">📝 상세 피드백</h2>
                  <div className="flex-1 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{showFeedbackModal.feedback || showFeedbackModal.explanation || showFeedbackModal.advice}</div>
                  <div className="mt-4 pt-3 border-t flex justify-end"><button onClick={() => { setShowFeedbackModal(null); handleHistoryTranslate(showFeedbackModal); }} className="text-xs bg-slate-100 px-3 py-2 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-200"><Languages size={12}/> 번역하기 (0.5🪙)</button></div>
              </div>
          </div>
      )}
      {showPersonaRanking && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white w-full max-w-xs rounded-3xl p-6 relative shadow-2xl">
                  <button onClick={() => setShowPersonaRanking(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  <h2 className="text-xl font-black mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" fill="currentColor"/> 인기 AI 랭킹</h2>
                  <div className="space-y-3">
                      {[PERSONAS[0], PERSONAS[1], PERSONAS[3]].map((p, i) => ( 
                          <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <div className={`w-8 h-8 flex items-center justify-center font-black rounded-full ${i===0?'bg-yellow-100 text-yellow-600':i===1?'bg-gray-200 text-gray-600':'bg-orange-100 text-orange-700'}`}>{i+1}</div>
                              <div className="w-10 h-10 rounded-full overflow-hidden border"><img src={p.img} className="w-full h-full object-cover object-top"/></div>
                              <div><div className="font-bold text-sm">{p.name}</div><div className="text-[10px] text-slate-500">{p.role}</div></div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
      {showNicknameModal && (<div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center shadow-2xl"><h2 className="text-xl font-black mb-1 text-slate-800">닉네임 설정</h2><input className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mb-4 font-bold text-center" value={userAlias} onChange={e => setUserAlias(e.target.value)} placeholder="예: 열공하는개미" /><button onClick={() => saveNickname(userAlias)} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">저장</button></div></div>)}
      {showInboxModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm">
              <div className="bg-white w-full h-full sm:h-[600px] sm:max-w-md sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                  {selectedMessage ? (
                      <div className="flex flex-col h-full bg-white">
                          <div className="p-4 border-b flex items-center gap-2 bg-white sticky top-0 z-10"><button onClick={() => setSelectedMessage(null)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={24}/></button><h3 className="font-bold text-slate-800">상세 내용</h3></div>
                          <div className="flex-1 overflow-y-auto p-6">
                              <div className="mb-6 pb-4 border-b border-slate-100"><span className="inline-block px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded mb-2">공지</span><h2 className="text-xl font-bold text-slate-900 leading-snug">{selectedMessage.title}</h2><p className="text-sm text-slate-400 mt-2">{selectedMessage.date instanceof Date ? selectedMessage.date.toLocaleDateString() : selectedMessage.date?.toDate ? selectedMessage.date.toDate().toLocaleDateString() : ""}</p></div>
                              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{selectedMessage.content}</div>
                          </div>
                          <div className="p-4 border-t"><button onClick={() => setSelectedMessage(null)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">목록으로</button></div>
                      </div>
                  ) : (
                      <div className="flex flex-col h-full bg-slate-50">
                          <div className="bg-white sticky top-0 z-10 shadow-sm">
                              <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold text-lg flex items-center gap-2"><Mail size={18}/> 소리튜터 우체통</h3><button onClick={() => setShowInboxModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18}/></button></div>
                              <div className="flex"><button onClick={() => setInboxTab('received')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab==='received'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>받은 편지함</button><button onClick={() => setInboxTab('write')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab==='write'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>문의하기</button></div>
                          </div>
                          <div className="p-4 overflow-y-auto flex-1">
                              {inboxTab === 'received' ? (
                                  <div className="space-y-3">
                                      {inboxList.map((msg) => (<div key={msg.id} onClick={() => setSelectedMessage(msg)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer active:scale-98 transition relative">{!msg.read && <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}<span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-2 inline-block">{msg.from || "관리자"}</span><h4 className="font-bold text-slate-800 text-sm truncate pr-4">{msg.title}</h4><p className="text-xs text-slate-400 mt-1">{msg.date instanceof Date ? msg.date.toLocaleDateString() : msg.date?.toDate ? msg.date.toDate().toLocaleDateString() : ""}</p></div>))}
                                      {inboxList.length === 0 && <p className="text-slate-400 text-center py-10">새로운 메시지가 없습니다.</p>}
                                  </div>
                              ) : (
                                  <div className="space-y-4 animate-in fade-in zoom-in duration-200">
                                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4"><p className="text-sm text-blue-800 font-bold mb-1">📬 무엇을 도와드릴까요?</p><p className="text-xs text-blue-600">오류 제보, 기능 건의, 혹은 응원의 메시지도 환영합니다!</p></div>
                                      <select className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={inquiryCategory} onChange={(e) => setInquiryCategory(e.target.value)}><option value="bug">🐛 오류 제보</option><option value="suggestion">💡 기능 건의</option><option value="question">❓ 학습 질문</option><option value="other">💬 기타 문의</option></select>
                                      <textarea className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="내용을 자세히 적어주시면 빠르게 확인할 수 있습니다." value={inquiryContent} onChange={(e) => setInquiryContent(e.target.value)}></textarea>
                                      <button onClick={handleSendInquiry} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2"><Send size={18} /> 보내기</button>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
      {showWordModal && selectedWordData && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white w-full max-w-xs rounded-3xl p-6 relative shadow-2xl">
                  <button onClick={() => setShowWordModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  
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

                  <button onClick={saveVocabulary} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition">
                      <Save size={18}/> 단어장에 저장
                  </button>
              </div>
          </div>
      )}
    </main>
  );
}