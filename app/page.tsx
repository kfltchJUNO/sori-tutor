"use client";

import { useState, useRef, useEffect } from "react";
import Login from "./components/Login";
import HistoryItem from "./components/HistoryItem"; 
import { db, auth } from "@/lib/firebase"; 
import { signOut } from "firebase/auth"; 
import { 
  doc, getDoc, collection, getDocs, query, where, addDoc, serverTimestamp, orderBy, updateDoc, setDoc, increment, limit, writeBatch 
} from "firebase/firestore";
import { 
  Mic, MessageSquare, Trophy, Mail, X, ChevronLeft, Star, Heart, Coins, Volume2, Info, CheckCircle, Send, MessageCircle, PenTool
} from 'lucide-react';

// --- 환영 메시지 데이터 (업데이트됨) ---
const WELCOME_MESSAGE = {
  id: 'welcome-guide',
  from: '소리튜터 운영진',
  title: "🎉 소리튜터에 오신 것을 환영합니다! (사용 설명서 포함)",
  date: new Date(), 
  read: false,
  content: `안녕하세요, 새로운 학습자님! 👋

한국어 마스터를 향한 첫걸음을 떼신 것을 진심으로 환영합니다.
소리튜터(Sori-Tutor)는 AI와 함께 즐겁게 발음을 교정하고 회화를 연습하는 공간입니다.

🚀 **이렇게 시작해보세요!**
🎙️ **발음 테스트:** 홈 화면에서 '단어'나 '문장' 카드를 골라보세요. 마이크 버튼을 누르고 따라 읽으면 AI가 즉시 점수를 매겨줍니다. (100점에 도전해보세요!)
🎭 **실전 회화 (롤플레잉):** '실전 회화' 메뉴에서는 성우급 AI와 역할을 나눠 대화할 수 있습니다. 내가 주인공이 되어 드라마 속 주인공처럼 연기해보세요.
🗣️ **프리토킹 (Beta):** AI 친구 '지민'이와 자유롭게 대화해보세요. 정해진 대본 없이 실시간으로 대화하며 회화 자신감을 키울 수 있습니다. 대화가 끝나면 발음, 억양, 감정 표현까지 포함된 '종합 분석 리포트'를 제공해 드립니다.
📊 **랭킹 도전:** 매일 꾸준히 학습하면 '연속 학습일(Streak)'이 올라갑니다. 랭킹은 매주 월요일에 초기화되니, 이번 주 랭킹 1위를 노려보세요!

💡 **왜 소리튜터인가요?**
* **Expert-Led Content:** 교육 전문가가 엄선한 데이터를 주기적으로 업데이트합니다. 앱 하나로 계속 늘어나는 학습 자료를 평생 만나보세요.
* **High-End AI:** 무료 혹은 저가형 모델이 아닌, 구글의 고비용의 최신 유료 AI 모델(Chirp 3 HD, Gemini)을 탑재하여, 실제 사람과 같은 목소리와 정확한 피드백을 제공합니다. (커피 한 잔 값으로 개인 튜터를 고용하는 효과를 누려보세요.) 오프라인 학원 수강료 대비 합리적인 비용으로 24시간 코칭을 받아보세요.

📢 **충전 및 이용 안내 (Pre-Launch)** 정식 런칭 전까지 토큰 충전은 개인 통장 입금 방식으로 운영됩니다.
다소 번거로우시더라도, 수수료 절감분을 더 높은 퀄리티의 AI 모델 유지에 재투자하기 위함이니 양해 부탁드립니다.
초기 멤버분들을 위해, 베타 기간 동안 각종 이벤트를 통해 더 넉넉한 혜택을 제공할 예정입니다.
(추후 상위 이용자 대상 커피 쿠폰 제공 등의 이벤트 기획중)

🎁 **7일 연속 학습 챌린지!**
작심삼일은 이제 그만! 확실한 동기부여를 드립니다.
* 미션: 7일 동안 매일 5번 이상 연습하기
* 선물: 미션 성공 시 15 토큰 즉시 지급!

로그인 시 매일 무료 하트 3개가 충전됩니다. 부담없이 사용해 보세요.
학습 중 오류가 있거나 건의사항이 생기면 상단의 [📮]을 눌러 언제든 알려주세요.
학습이 끝나면 [👋] 아이콘으로 로그아웃 하시면 됩니다.
당신의 한국어가 유창해지는 그날까지 소리튜터가 함께하겠습니다. 화이팅! 💪

- 소리튜터 운영진 드림 -`
};

export default function Home() {
  // --- 상태 관리 ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("guest");
  
  const [hearts, setHearts] = useState(3);
  const [tokens, setTokens] = useState(0);
  const [userAlias, setUserAlias] = useState<string>(""); 
  
  const [streak, setStreak] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  // 메시지함 & 문의하기 상태
  const [inboxList, setInboxList] = useState<any[]>([]);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [inboxTab, setInboxTab] = useState<'received' | 'write'>('received'); // 탭 상태
  const [selectedMessage, setSelectedMessage] = useState<any>(null); 
  const [hasNewMail, setHasNewMail] = useState(false);
  
  // 문의 작성 상태
  const [inquiryCategory, setInquiryCategory] = useState("bug");
  const [inquiryContent, setInquiryContent] = useState("");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);

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
  const [historyTab, setHistoryTab] = useState<"all" | "word" | "sentence" | "dialogue">("all");
  
  const [parsedScript, setParsedScript] = useState<{role: string, text: string}[]>([]);
  const [myRole, setMyRole] = useState<"A" | "B">("A"); 
  const [targetLineIndex, setTargetLineIndex] = useState<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 3단 피드백 결과 상태
  const [result, setResult] = useState<{
    score: number;
    recognized: string;
    correct: string;
    explanation: string;
    advice: string;
  } | null>(null);

  // 프리토킹 상태
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [chatStatus, setChatStatus] = useState<'idle'|'active'|'ended'>('idle');
  const [chatFeedback, setChatFeedback] = useState<any>(null);

  const [ttsLoading, setTtsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // --- 유저 로드 ---
  const handleUserChange = async (user: any) => {
    setCurrentUser(user);
    if (user) {
      const userRef = doc(db, "sori_users", user.email);
      const userSnap = await getDoc(userRef);
      const today = new Date().toDateString(); 

      if (userSnap.exists()) {
        const data = userSnap.data();
        setUserRole(data.role || "guest");
        setTokens(data.tokens || 0);
        setUserAlias(data.alias || "");
        setStreak(data.streak || 0);
        
        if (data.last_access_date === today) {
             setTodayCount(data.today_count || 0);
        } else {
             setTodayCount(0); 
        }

        if (!data.alias) setShowNicknameModal(true);
        if (data.last_heart_reset !== today) { await updateDoc(userRef, { free_hearts: 3, last_heart_reset: today }); setHearts(3); }
        else setHearts(data.free_hearts ?? 3);
        checkNewMail(user.email);
      } else {
        await setDoc(userRef, {
          email: user.email, name: user.displayName, role: "guest",
          free_hearts: 3, tokens: 0, last_heart_reset: today, joined_at: serverTimestamp(), 
          error_count: 0, analysis_count: 0, alias: "",
          streak: 0, today_count: 0, last_access_date: today 
        });
        setUserRole("guest"); setHearts(3); setShowNicknameModal(true);
      }
    } else {
        setUserRole("guest");
        setHearts(3);
        setTokens(0);
        setUserAlias("");
    }
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
        await signOut(auth);
        setCurrentUser(null);
        alert("안녕히 가세요! 👋");
        window.location.reload(); 
    }
  };

  const checkNewMail = async (email: string) => {
    const q = query(collection(db, "sori_users", email, "inbox"), where("read", "==", false));
    const snap = await getDocs(q);
    setHasNewMail(!snap.empty); 
  };

  const fetchInbox = async () => {
    if (!currentUser) return;
    const q = query(collection(db, "sori_users", currentUser.email, "inbox"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    const dbMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const combinedMsgs = [WELCOME_MESSAGE, ...dbMsgs];
    setInboxList(combinedMsgs);
    setShowInboxModal(true);
    setInboxTab('received'); // 기본 탭: 받은 편지함
    
    // 읽음 처리
    const unread = dbMsgs.filter((m: any) => !m.read);
    if (unread.length > 0) {
      const batch = writeBatch(db);
      unread.forEach((m: any) => batch.update(doc(db, "sori_users", currentUser.email, "inbox", m.id), { read: true }));
      await batch.commit(); 
    }
    setHasNewMail(false);
  };

  // 문의하기 (오류 제보 등)
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
      alert("✅ 문의가 접수되었습니다. 소중한 의견 감사합니다!");
      setInquiryContent("");
      setInboxTab('received'); // 전송 후 받은편지함으로 이동
    } catch (e) {
      alert("전송 실패: 잠시 후 다시 시도해주세요.");
    }
  };

  const saveNickname = async (newAlias: string) => {
    const trimmed = newAlias.trim();
    if (!trimmed) return alert("닉네임 입력");
    const q = query(collection(db, "sori_users"), where("alias", "==", trimmed));
    const snap = await getDocs(q);
    if (!snap.empty) return alert("이미 사용 중인 닉네임");
    if (currentUser) { await updateDoc(doc(db, "sori_users", currentUser.email), { alias: trimmed }); setUserAlias(trimmed); setShowNicknameModal(false); alert(`환영합니다, ${trimmed}님!`); }
  };

  const fetchRanking = async () => { 
      const q = query(collection(db, "sori_users"), orderBy("analysis_count", "desc"), limit(10)); 
      const snap = await getDocs(q); 
      setRankingList(snap.docs.map(d => d.data())); 
      setShowRankingModal(true); 
  };

  // --- 학습 분석 로직 ---
  const analyzeAudio = async () => {
    if (!audioBlob || !currentProblem) return;
    if (userRole === "guest" && hearts <= 0) return setShowPaymentModal(true);
    if (userRole === "student" && tokens <= 0) return setShowPaymentModal(true);
    
    setLoading(true); 
    setResult(null);

    let targetText = currentProblem.text; 
    let contextInfo = ""; 
    
    if (courseType === "dialogue" && targetLineIndex !== null) { 
        targetText = parsedScript[targetLineIndex].text; 
        contextInfo = `상황: ${currentProblem.title} (${currentProblem.translation}), 역할: ${myRole}, 감정과 어조 분석 필요.`; 
    } else if (courseType === "sentence") {
        contextInfo = "문장의 종류(평서/의문/감탄)에 따른 어조 확인.";
    }

    const formData = new FormData(); 
    formData.append("audio", audioBlob); 
    formData.append("targetText", targetText); 
    formData.append("context", contextInfo);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      
      if (data.error) { 
        alert("분석 오류: " + data.error); 
      } else {
        setResult(data);

        // --- 재화 및 Streak 업데이트 ---
        const userRef = doc(db, "sori_users", currentUser.email);
        const today = new Date().toDateString();
        let newStreak = streak;
        if (todayCount === 4) newStreak = streak + 1;

        const updates: any = { 
            analysis_count: increment(1), 
            last_access_date: today,
            today_count: increment(1)
        };
        if (todayCount === 4) updates.streak = increment(1);
        if (userRole === "guest") { setHearts(p=>p-1); updates.free_hearts = hearts - 1; } 
        else { setTokens(p=>p-1); updates.tokens = tokens - 1; }

        await updateDoc(userRef, updates);
        setTodayCount(p => p + 1);
        if (todayCount === 4) setStreak(newStreak);

        if (courseType === "dialogue" && targetLineIndex !== null) {
          if (!completedLines.includes(targetLineIndex)) setCompletedLines(prev => [...prev, targetLineIndex]);
        }

        // History 저장
        await addDoc(collection(db, "sori_users", currentUser.email, "history"), { 
            text: targetText, 
            score: data.score, 
            recognized: data.recognized, 
            correct: data.correct,       
            feedback: data.explanation,  
            advice: data.advice,         
            type: courseType, 
            date: serverTimestamp() 
        });
      }
    } catch (error) { alert("서버 통신 오류"); } finally { setLoading(false); }
  };

  // --- 프리토킹 로직 ---
  const startFreeTalking = () => {
    if (tokens < 2 && userRole !== 'guest') { 
        if (userRole === 'guest' && hearts < 1) return setShowPaymentModal(true); 
        if (userRole === 'student' && tokens < 2) return setShowPaymentModal(true);
    }
    setViewMode("freetalking");
    setChatHistory([{role: "model", text: "안녕하세요! 만나서 반가워요. 이름이 뭐예요?"}]);
    setChatStatus('active');
    setChatFeedback(null);
    handleGoogleTTS("안녕하세요! 만나서 반가워요. 이름이 뭐예요?", null, "ko-KR-Chirp3-HD-Puck");
  };

  const handleChatSend = async () => {
    if (!audioBlob) return;
    
    if (userRole === 'guest') {
         if (hearts < 1) return setShowPaymentModal(true);
         setHearts(p => p-1);
         updateDoc(doc(db,"sori_users",currentUser.email), { free_hearts: increment(-1) });
    } else {
         if (tokens < 2) return setShowPaymentModal(true);
         setTokens(p => p-2);
         updateDoc(doc(db,"sori_users",currentUser.email), { tokens: increment(-2) });
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("action", "chat");
    formData.append("audio", audioBlob);
    formData.append("history", JSON.stringify(chatHistory));

    try {
        const res = await fetch("/api/chat", { method: "POST", body: formData });
        const data = await res.json();

        // 사용자 메시지 표시 (현재는 음성 메시지로 표기)
        const newHistory = [...chatHistory, {role: 'user', text: "🎤 (음성 메시지)"} as any, {role: 'model', text: data.text}];
        setChatHistory(newHistory);
        
        if (data.audioContent) {
            const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
            audio.play();
        }

        if (data.ended) {
            setChatStatus('ended');
        }

        setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    } catch(e) { alert("오류 발생"); } 
    finally { 
        setLoading(false); 
        setAudioUrl(null); 
        setAudioBlob(null); 
    }
  };

  const handleChatFeedback = async () => {
      setLoading(true);
      const formData = new FormData();
      formData.append("action", "feedback");
      formData.append("history", JSON.stringify(chatHistory));
      
      try {
          const res = await fetch("/api/chat", { method: "POST", body: formData });
          const data = await res.json();
          setChatFeedback(data);
      } catch(e) { alert("피드백 생성 실패"); }
      finally { setLoading(false); }
  };


  const getMailtoLink = (planName: string, price: string) => {
    return `mailto:ot.helper7@gmail.com?subject=${encodeURIComponent("[Sori-Tutor] "+planName+" 결제 문의")}`;
  };
  
  const selectCourse = async (type: any) => { 
    setCourseType(type); 
    if (type === "word") {
      const q = query(collection(db, "sori_curriculum_word"));
      const s = await getDocs(q);
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setProblemList(l);
      if (l.length > 0) initPractice(l); 
      setViewMode("practice");
    } else {
      const col = `sori_curriculum_${type}`; 
      const s = await getDocs(collection(db, col)); 
      const c = new Set<string>(); 
      s.forEach(d => c.add(d.data().category)); 
      setCategories(Array.from(c).sort()); 
      setViewMode("category"); 
    }
    setResult(null); 
  };
  
  const selectCategory = async (cat: string) => { 
    setSelectedCategory(cat); 
    const col = `sori_curriculum_${courseType}`; 
    const q = query(collection(db, col), where("category", "==", cat)); 
    const s = await getDocs(q); 
    const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
    setProblemList(l); 
    if (l.length > 0) initPractice(l);
    setViewMode("practice"); setResult(null); setAudioUrl(null); setAudioBlob(null); 
  };
  
  const initPractice = (list: any[]) => {
    if (list.length === 0) return;
    const r = Math.floor(Math.random() * list.length);
    updateCurrentProblem(list[r]);
    setHistoryStack([list[r]]); setHistoryIndex(0);
  };

  const handleNextProblem = () => {
    if (!problemList || problemList.length === 0) return;
    const r = Math.floor(Math.random() * problemList.length);
    const nextProb = problemList[r];
    setHistoryStack(prev => [...prev, nextProb]);
    setHistoryIndex(prev => prev + 1);
    updateCurrentProblem(nextProb);
  };

  const handlePrevProblem = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      updateCurrentProblem(historyStack[historyIndex - 1]);
    }
  };

  const updateCurrentProblem = (prob: any) => {
    setCurrentProblem(prob);
    setResult(null); setAudioUrl(null); setCompletedLines([]);
    if ((prob as any).script) parseDialogue((prob as any).script);
  };

  const parseDialogue = (script: string) => { if (!script) return; const l = script.split("|").map(line => { const [r, t] = line.split(":"); return { role: r?.trim(), text: t?.trim() }; }); setParsedScript(l); setTargetLineIndex(null); };
  
  const fetchHistory = async () => { 
    if (!currentUser) return; 
    setLoading(true); 
    const q = query(collection(db, "sori_users", currentUser.email, "history"), orderBy("date", "desc")); 
    const s = await getDocs(q); 
    const safeList = s.docs.map(d => {
        const data = d.data();
        return { 
            id: d.id, 
            ...data,
            recognized: data.recognized || "", 
            correct: data.correct || "",
            feedback: data.feedback || data.explanation || "내용 없음",
            advice: data.advice || ""
        };
    });
    setHistoryList(safeList); 
    setViewMode("history"); 
    setLoading(false); 
  };
  
  const startRecording = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorderRef.current = new MediaRecorder(s); mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); }; mediaRecorderRef.current.onstop = () => { const b = new Blob(chunksRef.current, { type: "audio/webm" }); setAudioUrl(URL.createObjectURL(b)); setAudioBlob(b); chunksRef.current = []; }; mediaRecorderRef.current.start(); setRecording(true); setResult(null); } catch (err) { alert("마이크 권한 필요"); } };
  const stopRecording = () => { if (mediaRecorderRef.current && recording) { mediaRecorderRef.current.stop(); setRecording(false); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); } };

  const handleGoogleTTS = async (textToRead: string | undefined, audioPath: string | null = null, specificVoice: string | null = null) => {
    if (!textToRead && !audioPath) return alert("읽을 텍스트가 없습니다.");
    if (audioPath) {
        try { new Audio(audioPath).play(); return; } catch (e) { console.error(e); }
    }
    if (textToRead?.startsWith("http")) return alert("텍스트 오류");
    if (ttsLoading) return; 
    try {
      setTtsLoading(true);
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: textToRead,
          voiceName: specificVoice || "ko-KR-Chirp3-HD-Kore" 
        }),
      });
      const data = await response.json();
      if (data.audioContent) { new Audio(`data:audio/mp3;base64,${data.audioContent}`).play(); }
    } catch (error) { alert("음성 재생 오류"); } finally { setTtsLoading(false); }
  };

  const isDialogueFinished = courseType === 'dialogue' && parsedScript.length > 0 && completedLines.length === parsedScript.length;

  // --- 로그인 전 화면 (수정됨: 깔끔한 디자인 + Footer) ---
  if (!currentUser) return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">
        <div className="text-center bg-white p-10 rounded-3xl shadow-2xl w-full border border-slate-100">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4 shadow-lg shadow-blue-200">S</div>
          <h1 className="text-4xl font-black text-slate-800 mb-2">Sori-Tutor</h1>
          <p className="text-slate-500 mb-8 font-medium text-sm">AI와 함께하는 한국어 발음 교정</p>
          <Login onUserChange={handleUserChange} />
          <p className="text-xs text-slate-400 mt-6">* 구글 로그인 시 무료 체험 (일 3회)</p>
        </div>
      </div>
      <footer className="w-full text-center p-4 text-xs text-slate-400">
        © 2026 Sori-Tutor. All rights reserved.
      </footer>
    </main>
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-slate-50 max-w-lg mx-auto shadow-2xl relative overflow-hidden">
      
      {/* 1. 상단 헤더 (수정됨: 오류 버튼 삭제, 편지함 통합) */}
      <header className="bg-white px-5 py-3 flex justify-between items-center flex-none z-40 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode("home")}>
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">S</div>
           <span className="font-bold text-lg text-slate-800">Sori-Tutor</span>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={fetchInbox} className="relative text-slate-600 hover:text-blue-600 transition p-1">
             <span className="text-2xl">📮</span> 
             {/* 읽지 않은 메시지 있으면 뱃지 */}
             {hasNewMail && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
           </button>
           
           <button onClick={handleLogout} className="text-xl hover:scale-110 transition ml-1" title="로그아웃">👋</button>
        </div>
      </header>

      {/* 서브 헤더 */}
      <div className="bg-white px-5 py-2 flex justify-between items-center border-b border-slate-50 text-sm flex-none">
         <div className="flex gap-2">
            <button onClick={fetchRanking} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full font-bold hover:bg-yellow-100 transition"><Trophy size={14} /> 랭킹</button>
            <button onClick={fetchHistory} className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold hover:bg-slate-200 transition">내 기록</button>
         </div>
         <div className="flex items-center gap-1 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded-full border border-slate-200" onClick={() => setShowPaymentModal(true)}>
            {userRole === 'guest' ? (<><Heart size={14} className="text-red-500" fill="currentColor"/><span className="font-bold text-slate-700">{hearts}</span></>) : (<><Coins size={14} className="text-yellow-500" fill="currentColor"/><span className="font-bold text-slate-700">{tokens}</span></>)}
         </div>
      </div>
      
      {/* --- 메인 컨텐츠 영역 --- */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide pb-24">
        {viewMode === "home" && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
            {/* Streak Card */}
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
              
              <button onClick={startFreeTalking} className="w-full p-5 rounded-2xl text-left bg-gradient-to-r from-green-50 to-emerald-50 shadow-sm border border-green-100 hover:border-green-500 transition group flex items-center gap-4 relative overflow-hidden">
                  <div className="absolute top-3 right-3 bg-white/80 backdrop-blur px-2 py-1 rounded-full text-[10px] font-bold text-green-700 border border-green-200">🪙 토큰 2개 / 턴</div>
                  <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform"><MessageCircle /></div>
                  <div><div className="text-lg font-bold text-slate-800">프리토킹 (Beta)</div><div className="text-sm text-slate-500">AI 친구 지민이와 자유 대화</div></div>
              </button>
            </div>
          </div>
        )}

        {viewMode === "category" && (
          <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 font-bold flex items-center gap-1 hover:text-blue-600"><ChevronLeft size={20}/> 메인으로</button>
            <h2 className="text-2xl font-black text-slate-900 mb-6">주제를 선택하세요</h2>
            <div className="grid grid-cols-2 gap-3">
                {categories.map(cat => (
                    <button key={cat} onClick={() => selectCategory(cat)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:text-blue-600 font-bold text-slate-700 text-lg transition">{cat}</button>
                ))}
            </div>
          </div>
        )}

        {viewMode === "history" && (
          <div className="space-y-3">
             <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 flex items-center gap-1"><ChevronLeft/> 메인으로</button>
             {historyList.map(h => ( <HistoryItem key={h.id} item={h} userEmail={currentUser.email} userRole={userRole} /> ))}
             {historyList.length === 0 && <p className="text-center text-slate-400 py-10">기록이 없습니다.</p>}
          </div>
        )}

        {/* 프리토킹 뷰 */}
        {viewMode === "freetalking" && (
          <div className="flex flex-col h-full">
             <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-50 z-10 py-2">
               <button onClick={() => setViewMode("home")} className="p-2 bg-white rounded-full border"><X size={20}/></button>
               <span className="font-bold text-slate-700">지민 (친구)</span>
               <div className="w-10"></div>
             </div>
             
             <div className="space-y-4 pb-4">
               {chatHistory.map((msg, idx) => (
                 <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                     {msg.text}
                   </div>
                 </div>
               ))}
               <div ref={chatScrollRef}></div>
             </div>

             {chatStatus === 'ended' && !chatFeedback && (
               <div className="bg-slate-800 text-white p-4 rounded-xl text-center animate-in fade-in">
                 <p className="mb-3 font-bold">대화가 종료되었습니다 👋</p>
                 <button onClick={handleChatFeedback} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 transition">📝 종합 피드백 받기</button>
               </div>
             )}

             {chatFeedback && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg animate-in slide-in-from-bottom">
                   <h3 className="font-bold text-lg mb-3 border-b pb-2">📋 대화 분석 리포트</h3>
                   <div className="space-y-3 text-sm">
                      <div><span className="font-bold text-blue-600 block">🗣️ 발음 및 전달력</span><p className="text-slate-700">{chatFeedback.pronunciation}</p></div>
                      <div><span className="font-bold text-purple-600 block">🎭 억양과 감정</span><p className="text-slate-700">{chatFeedback.intonation}</p></div>
                      <div><span className="font-bold text-green-600 block">💡 총평</span><p className="text-slate-700">{chatFeedback.general}</p></div>
                   </div>
                   <button onClick={() => setViewMode('home')} className="w-full mt-4 bg-slate-100 py-3 rounded-xl font-bold text-slate-600">메인으로</button>
                </div>
             )}
          </div>
        )}

        {/* 일반 연습 뷰 */}
        {viewMode === "practice" && currentProblem && (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
               <button onClick={() => setViewMode("home")}><X size={20}/></button>
               <div className="flex gap-2">
                 <button onClick={handlePrevProblem} disabled={historyIndex <= 0} className={`px-3 py-1 rounded-lg text-xs font-bold transition ${historyIndex > 0 ? 'bg-white text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-400'}`}>이전</button>
                 {courseType !== "dialogue" && <button onClick={handleNextProblem} className="px-3 py-1 rounded-lg text-xs font-bold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50">다음 ▶</button>}
               </div>
            </div>
            {courseType === "dialogue" ? (
               <div className="space-y-4 pb-20">
                  <div className="bg-purple-50 p-4 rounded-xl"><h1 className="font-bold text-lg">{currentProblem.title}</h1><p className="text-sm">{currentProblem.translation}</p></div>
                  {parsedScript.map((line, idx) => (
                      <div key={idx} onClick={() => { if(line.role===myRole){ setTargetLineIndex(idx); setResult(null); setAudioUrl(null); }}} className={`p-3 border-2 rounded-xl mb-2 ${targetLineIndex===idx?'border-blue-500 bg-blue-50':'border-transparent bg-white'}`}>
                          <span className="text-xs font-bold block opacity-70 mb-1">{line.role}</span>
                          {line.text}
                          <button onClick={(e)=>{e.stopPropagation(); handleGoogleTTS(line.text, currentProblem.audio_paths?.[idx])}} className="ml-2 bg-slate-200 rounded-full p-1"><Volume2 size={10}/></button>
                      </div>
                  ))}
               </div>
            ) : (
               <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center mb-6 mt-4">
                  <h1 className="text-3xl font-black text-slate-800 mb-4 break-keep">{currentProblem.text}</h1>
                  <p className="text-xl text-slate-500 font-serif mb-8 italic">{currentProblem.pronunciation}</p>
                  <div className="bg-slate-50 text-slate-600 text-sm font-medium p-3 rounded-xl inline-block border border-slate-200">💡 {courseType==="word" ? currentProblem.tip : currentProblem.translation}</div>
               </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 컨트롤 바 (Fixed) */}
      {(viewMode === "practice" || (viewMode === "freetalking" && chatStatus === 'active')) && (
        <div className="flex-none bg-white border-t p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] rounded-t-3xl z-50">
          
          {/* 프리토킹 모드 컨트롤 */}
          {viewMode === "freetalking" ? (
             <div className="flex flex-col items-center gap-4">
                 {loading && <div className="text-slate-500 animate-pulse font-bold text-sm">지민이가 생각하고 있어요... 🤔</div>}
                 {!recording && !loading && (
                     <button onClick={startRecording} className="w-16 h-16 rounded-full bg-green-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition"><Mic size={32} /></button>
                 )}
                 {recording && (
                     <div className="flex flex-col items-center">
                         <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-green-100"><div className="w-6 h-6 bg-white rounded-md"></div></button>
                         <span className="text-xs text-green-600 font-bold mt-2">말하는 중...</span>
                     </div>
                 )}
                 {audioUrl && !recording && !loading && (
                      <div className="flex gap-2 w-full animate-in slide-in-from-bottom">
                          <button onClick={() => {setAudioUrl(null); setAudioBlob(null);}} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
                          <button onClick={handleChatSend} className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2"><Send size={18}/> 전송 (-2🪙)</button>
                      </div>
                 )}
             </div>
          ) : (
            // 기존 연습 모드 컨트롤 (결과 화면 포함)
            result ? (
                <div className="animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[60vh]">
                   <div className="flex-1 overflow-y-auto pr-1 mb-4 space-y-4">
                       <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-2 border-b">
                           <h3 className="font-bold text-lg text-slate-800">분석 결과</h3>
                           <span className={`text-2xl font-black ${result.score >= 80 ? 'text-green-500' : 'text-orange-500'}`}>{result.score}점</span>
                       </div>
                       <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                           <div><span className="text-xs font-bold text-slate-400 block mb-1">인식된 소리</span><div className="text-lg font-bold text-red-500 tracking-wide bg-white p-2 rounded border border-red-100">{result.recognized}</div></div>
                           <div className="flex justify-center"><div className="w-0.5 h-3 bg-slate-300"></div></div>
                           <div><span className="text-xs font-bold text-slate-400 block mb-1">정답 소리</span><div className="text-lg font-bold text-green-600 tracking-wide bg-white p-2 rounded border border-green-100">{result.correct}</div></div>
                       </div>
                       <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
                           <div className="flex items-start gap-2"><CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0"/><div><span className="text-xs font-bold text-blue-500 block">발음 교정</span><p className="text-sm text-blue-800 font-bold leading-snug">{result.explanation}</p></div></div>
                           {result.advice && (<div className="flex items-start gap-2 pt-2 border-t border-blue-200"><Info size={16} className="text-indigo-500 mt-0.5 shrink-0"/><div><span className="text-xs font-bold text-indigo-500 block">억양 / 감정 Tip</span><p className="text-xs text-indigo-700 leading-relaxed">{result.advice}</p></div></div>)}
                       </div>
                   </div>
                   <button onClick={() => { setResult(null); setAudioUrl(null); if (courseType !== 'dialogue') handleNextProblem(); }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 shrink-0">{courseType === "dialogue" ? "확인" : "다음 문제 (랜덤)"}</button>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4">
                   {loading && <div className="text-slate-500 animate-pulse font-bold text-sm">AI가 소리를 분석 중입니다... 🎧</div>}
                   {!recording && !audioUrl && !loading && (<button onClick={startRecording} className="w-16 h-16 rounded-full bg-red-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition"><Mic size={32} /></button>)}
                   {recording && (<div className="flex flex-col items-center"><button onClick={stopRecording} className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100"><div className="w-6 h-6 bg-white rounded-md"></div></button><span className="text-xs text-red-500 font-bold mt-2">녹음 중...</span></div>)}
                   {audioUrl && !recording && !loading && (<div className="w-full space-y-3 animate-in fade-in zoom-in duration-200"><audio src={audioUrl} controls className="w-full h-10 rounded-lg shadow-sm border border-slate-200 bg-slate-50" /><div className="flex gap-2 w-full"><button onClick={() => {setAudioUrl(null); setAudioBlob(null);}} className="flex-1 py-3 bg-white text-slate-600 rounded-xl font-bold border">재녹음</button><button onClick={analyzeAudio} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md">피드백 받기</button></div></div>)}
                </div>
            )
          )}
        </div>
      )}

      {/* --- 모달 모음 --- */}

      {/* 1. 닉네임 설정 */}
      {showNicknameModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center shadow-2xl">
                  <h2 className="text-xl font-black mb-1 text-slate-800">닉네임 설정</h2>
                  <input className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mb-4 font-bold text-center" value={userAlias} onChange={e => setUserAlias(e.target.value)} placeholder="예: 열공하는개미" />
                  <button onClick={() => saveNickname(userAlias)} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">저장</button>
              </div>
          </div>
      )}

      {/* 2. 메시지함 (수정됨: 탭 기능 추가, 쓰기 기능 통합) */}
      {showInboxModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm">
              <div className="bg-white w-full h-full sm:h-[600px] sm:max-w-md sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                  
                  {/* 상세 보기 상태라면 헤더만 렌더링하고 내용 표시 */}
                  {selectedMessage ? (
                      <div className="flex flex-col h-full bg-white">
                          <div className="p-4 border-b flex items-center gap-2 bg-white sticky top-0 z-10">
                              <button onClick={() => setSelectedMessage(null)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={24}/></button>
                              <h3 className="font-bold text-slate-800">상세 내용</h3>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6">
                              <div className="mb-6 pb-4 border-b border-slate-100">
                                  <span className="inline-block px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded mb-2">공지</span>
                                  <h2 className="text-xl font-bold text-slate-900 leading-snug">{selectedMessage.title}</h2>
                                  <p className="text-sm text-slate-400 mt-2">{selectedMessage.date instanceof Date ? selectedMessage.date.toLocaleDateString() : selectedMessage.date?.toDate ? selectedMessage.date.toDate().toLocaleDateString() : ""}</p>
                              </div>
                              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                  {selectedMessage.content}
                              </div>
                          </div>
                          <div className="p-4 border-t"><button onClick={() => setSelectedMessage(null)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">목록으로</button></div>
                      </div>
                  ) : (
                      // 탭 뷰 (받은편지 / 문의하기)
                      <div className="flex flex-col h-full bg-slate-50">
                          {/* 헤더 & 탭 */}
                          <div className="bg-white sticky top-0 z-10 shadow-sm">
                              <div className="p-4 border-b flex justify-between items-center">
                                  <h3 className="font-bold text-lg flex items-center gap-2"><Mail size={18}/> 소리튜터 우체통</h3>
                                  <button onClick={() => setShowInboxModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18}/></button>
                              </div>
                              <div className="flex">
                                  <button onClick={() => setInboxTab('received')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab==='received'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>받은 편지함</button>
                                  <button onClick={() => setInboxTab('write')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${inboxTab==='write'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>문의하기</button>
                              </div>
                          </div>

                          {/* 컨텐츠 영역 */}
                          <div className="p-4 overflow-y-auto flex-1">
                              {inboxTab === 'received' ? (
                                  <div className="space-y-3">
                                      {inboxList.map((msg) => (
                                          <div key={msg.id} onClick={() => setSelectedMessage(msg)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer active:scale-98 transition relative">
                                              {!msg.read && <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-2 inline-block">{msg.from || "관리자"}</span>
                                              <h4 className="font-bold text-slate-800 text-sm truncate pr-4">{msg.title}</h4>
                                              <p className="text-xs text-slate-400 mt-1">{msg.date instanceof Date ? msg.date.toLocaleDateString() : msg.date?.toDate ? msg.date.toDate().toLocaleDateString() : ""}</p>
                                          </div>
                                      ))}
                                      {inboxList.length === 0 && <p className="text-slate-400 text-center py-10">새로운 메시지가 없습니다.</p>}
                                  </div>
                              ) : (
                                  // 문의하기 폼
                                  <div className="space-y-4 animate-in fade-in zoom-in duration-200">
                                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                                          <p className="text-sm text-blue-800 font-bold mb-1">📬 무엇을 도와드릴까요?</p>
                                          <p className="text-xs text-blue-600">오류 제보, 기능 건의, 혹은 응원의 메시지도 환영합니다!</p>
                                      </div>
                                      <select 
                                        className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={inquiryCategory}
                                        onChange={(e) => setInquiryCategory(e.target.value)}
                                      >
                                          <option value="bug">🐛 오류 제보</option>
                                          <option value="suggestion">💡 기능 건의</option>
                                          <option value="question">❓ 학습 질문</option>
                                          <option value="other">💬 기타 문의</option>
                                      </select>
                                      <textarea 
                                        className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        placeholder="내용을 자세히 적어주시면 빠르게 확인할 수 있습니다."
                                        value={inquiryContent}
                                        onChange={(e) => setInquiryContent(e.target.value)}
                                      ></textarea>
                                      <button onClick={handleSendInquiry} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2">
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

      {/* 3. 랭킹 모달 */}
      {showRankingModal && (<div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm"><div className="bg-white w-full h-[80vh] sm:h-[600px] sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col absolute bottom-0 sm:relative animate-in slide-in-from-bottom duration-300"><div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white relative"><button onClick={() => setShowRankingModal(false)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30"><X size={20} className="text-white"/></button><h3 className="font-bold text-2xl flex items-center gap-2"><Trophy className="text-yellow-300" fill="currentColor"/> 주간 랭킹</h3></div><div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">{rankingList.map((ranker, index) => (<div key={index} className={`flex items-center p-3 rounded-xl border ${ranker.email === currentUser.email ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-100' : 'bg-white border-slate-100 shadow-sm'}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 ${index < 3 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</div><div className="flex-1"><p className="font-bold text-sm text-slate-800 flex items-center gap-1">{ranker.alias || ranker.name}</p><p className="text-xs text-slate-400">{ranker.streak || 0}일 연속</p></div><div className="font-bold text-indigo-600 text-sm">{(ranker.analysis_count * 10).toLocaleString()} P</div></div>))}</div></div></div>)}
      
      {/* 4. 결제 모달 */}
      {showPaymentModal && (<div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"><div className="bg-slate-900 p-6 text-white text-center"><h2 className="text-xl font-bold">충전 필요</h2></div><div className="p-6"><p className="text-center text-slate-600 mb-6">토큰이 부족합니다.</p><button onClick={() => setShowPaymentModal(false)} className="w-full py-3 bg-slate-100 rounded-xl font-bold">닫기</button></div></div></div>)}
    </main>
  );
}