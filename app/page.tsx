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
  Mic, MessageSquare, Trophy, Mail, X, ChevronLeft, Star, Heart, Coins, Volume2, Info
} from 'lucide-react';

// --- 환영 메시지 데이터 ---
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
🎙️ **발음 테스트:** 홈 화면에서 '단어'나 '문장' 카드를 골라보세요. 마이크 버튼을 누르고 따라 읽으면 AI가 즉시 점수를 매겨줍니다.
🎭 **실전 회화 (롤플레잉):** '실전 회화' 메뉴에서는 성우급 AI와 역할을 나눠 대화할 수 있습니다.
📊 **랭킹 도전:** 매일 5번 이상 연습하면 '연속 학습일(Streak)'이 올라갑니다.

💡 **왜 소리튜터인가요?**
* **Expert-Led Content:** 교육 전문가가 엄선한 데이터를 주기적으로 업데이트합니다.
* **High-End AI:** 구글의 최신 유료 AI 모델(Chirp 3 HD, Gemini)을 탑재하여 정확한 피드백을 제공합니다.

📢 **충전 및 이용 안내 (Pre-Launch)** 정식 런칭 전까지 토큰 충전은 개인 통장 입금 방식으로 운영됩니다.
다소 번거로우시더라도 양해 부탁드립니다.

🎁 **7일 연속 학습 챌린지!**
* 미션: 7일 동안 매일 5번 이상 연습하기
* 선물: 미션 성공 시 15 토큰 즉시 지급!

로그인 시 매일 무료 하트 3개가 충전됩니다. 부담없이 사용해 보세요.
학습 중 오류가 있거나 건의사항이 생기면 상단의 [🚨] 아이콘을 눌러 언제든 알려주세요.
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
  const [todayCount, setTodayCount] = useState(0); // 🔥 오늘 학습 횟수

  const [inboxList, setInboxList] = useState<any[]>([]);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any>(null); 
  const [hasNewMail, setHasNewMail] = useState(false);

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
  
  // 🔥 결과 데이터 구조 (3단 피드백)
  const [result, setResult] = useState<{
    score: number;
    recognized: string;
    correct: string;
    explanation: string;
    advice: string;
  } | null>(null);

  const [ttsLoading, setTtsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
        
        // 날짜가 바뀌었는지 확인하여 오늘 횟수 리셋
        if (data.last_access_date === today) {
             setTodayCount(data.today_count || 0);
        } else {
             setTodayCount(0);
        }

        if (!data.alias) setShowNicknameModal(true);
        // 무료 하트 리셋 로직
        if (data.last_heart_reset !== today) { 
            await updateDoc(userRef, { free_hearts: 3, last_heart_reset: today }); 
            setHearts(3); 
        } else {
            setHearts(data.free_hearts ?? 3);
        }
        checkNewMail(user.email);
      } else {
        // 신규 유저 생성
        await setDoc(userRef, {
          email: user.email, name: user.displayName, role: "guest",
          free_hearts: 3, tokens: 0, last_heart_reset: today, joined_at: serverTimestamp(), 
          error_count: 0, analysis_count: 0, alias: "",
          streak: 0, today_count: 0, last_access_date: today 
        });
        setUserRole("guest"); setHearts(3); setShowNicknameModal(true);
      }
    } else {
        // 로그아웃 초기화
        setUserRole("guest"); setHearts(3); setTokens(0); setUserAlias("");
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

  const handleBugReport = () => {
    const email = "ot.helper7@gmail.com";
    const subject = "소리튜터 오류 제보";
    const body = `[소리튜터 피드백]\n1. 사용 기기: \n2. 문제 내용: \n3. 건의 사항: `;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    
    setInboxList([WELCOME_MESSAGE, ...dbMsgs]);
    setShowInboxModal(true);
    
    // 안 읽은 메시지 읽음 처리
    const unread = dbMsgs.filter((m: any) => !m.read);
    if (unread.length > 0) {
      const batch = writeBatch(db);
      unread.forEach((m: any) => batch.update(doc(db, "sori_users", currentUser.email, "inbox", m.id), { read: true }));
      await batch.commit(); 
    }
    setHasNewMail(false);
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

  // 🔥 [핵심] 오디오 분석 및 Streak 로직
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
        contextInfo = `상황: ${currentProblem.title} (${currentProblem.translation}), 화자 역할: ${myRole}, 전체 맥락 속에서 감정과 억양을 중요하게 평가할 것.`; 
    } else if (courseType === "sentence") {
        contextInfo = "문장의 종류(평서문/의문문 등)에 따른 적절한 어조와 억양인지 확인할 것.";
    } else {
        contextInfo = "단어의 정확한 음가와 음운 변동(비음화, 유음화 등)을 중점적으로 확인할 것.";
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
        await updateDoc(doc(db, "sori_users", currentUser.email), { error_count: increment(1) });
      } else {
        setResult(data);

        // --- Streak 및 카운트 업데이트 ---
        const userRef = doc(db, "sori_users", currentUser.email);
        const today = new Date().toDateString();
        
        let newStreak = streak;
        // 오늘 4회에서 5회째로 넘어가는 순간 Streak 증가
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

        // 히스토리 저장 (오디오 제외, 텍스트 결과만)
        await addDoc(collection(db, "sori_users", currentUser.email, "history"), { 
            text: targetText, 
            score: data.score, 
            recognized: data.recognized, 
            feedback: data.explanation, 
            advice: data.advice, 
            type: courseType, 
            date: serverTimestamp() 
        });
        
        if (courseType === "dialogue" && targetLineIndex !== null) {
          if (!completedLines.includes(targetLineIndex)) setCompletedLines(prev => [...prev, targetLineIndex]);
        }
      }
    } catch (error) { alert("서버 통신 오류"); } finally { setLoading(false); }
  };

  // 🔥 [TTS 우선순위 재생] 관리자 생성 파일 -> 없으면 API
  const handleGoogleTTS = async (text: string, path: string | null = null) => {
    if (!text && !path) return;
    
    // 1. 관리자 생성 파일 우선 재생
    if (path) {
        try { const audio = new Audio(path); await audio.play(); return; } catch(e) { console.log("File play error", e); }
    }
    
    // 2. 파일 없으면 실시간 생성 (결과 화면 등에서 사용)
    if (ttsLoading) return;
    try {
      setTtsLoading(true);
      const res = await fetch("/api/tts", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceName: "ko-KR-Chirp3-HD-Kore" }) 
      });
      const data = await res.json();
      if(data.audioContent) { new Audio(`data:audio/mp3;base64,${data.audioContent}`).play(); }
    } catch(e) { alert("재생 오류"); } finally { setTtsLoading(false); }
  };

  const getMailtoLink = (planName: string, price: string) => {
    return `mailto:ot.helper7@gmail.com?subject=${encodeURIComponent("[Sori-Tutor] "+planName+" 결제 문의")}`;
  };

  // 녹음 관련
  const startRecording = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorderRef.current = new MediaRecorder(s); mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); }; mediaRecorderRef.current.onstop = () => { const b = new Blob(chunksRef.current, { type: "audio/webm" }); setAudioUrl(URL.createObjectURL(b)); setAudioBlob(b); chunksRef.current = []; }; mediaRecorderRef.current.start(); setRecording(true); setResult(null); } catch (err) { alert("마이크 권한 필요"); } };
  const stopRecording = () => { if (mediaRecorderRef.current && recording) { mediaRecorderRef.current.stop(); setRecording(false); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); } };

  // --- 네비게이션 ---
  const selectCourse = async (type: any) => { 
    setCourseType(type); 
    setProblemList([]); 
    if (type === "word") fetchData("sori_curriculum_word");
    else if (type === "sentence") fetchData("sori_curriculum_sentence");
    else fetchData("sori_curriculum_dialogue");
    setViewMode("practice"); 
  };
  
  const selectCategory = async (cat: string) => { 
      setSelectedCategory(cat); 
      const col = `sori_curriculum_${courseType}`; 
      const q = query(collection(db, col), where("category", "==", cat)); 
      const s = await getDocs(q); 
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setProblemList(l);
      if(l.length > 0) initPractice(l);
      setViewMode("practice");
  };
  
  const fetchData = async (col: string) => {
      const q = query(collection(db, col));
      const s = await getDocs(q);
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setProblemList(l);
      if(l.length > 0) initPractice(l);
  };

  const initPractice = (list: any[]) => {
    const r = Math.floor(Math.random() * list.length);
    setCurrentProblem(list[r]);
    setHistoryStack([list[r]]); setHistoryIndex(0);
    if(list[r].script) parseDialogue(list[r].script);
  };

  const handleNextProblem = () => {
    if (!problemList.length) return;
    const r = Math.floor(Math.random() * problemList.length);
    const next = problemList[r];
    setHistoryStack(p => [...p, next]); setHistoryIndex(p => p + 1);
    setCurrentProblem(next); setResult(null); setAudioUrl(null); setAudioBlob(null); setCompletedLines([]);
    if(next.script) parseDialogue(next.script);
  };

  const handlePrevProblem = () => {
      if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1);
        const prev = historyStack[historyIndex - 1];
        setCurrentProblem(prev); setResult(null); setAudioUrl(null); setAudioBlob(null); setCompletedLines([]);
        if(prev.script) parseDialogue(prev.script);
      }
  };

  const parseDialogue = (script: string) => { const l = script.split("|").map(line => { const [r, t] = line.split(":"); return { role: r?.trim(), text: t?.trim() }; }); setParsedScript(l); setTargetLineIndex(null); };
  const fetchHistory = async () => { if (!currentUser) return; setLoading(true); const q = query(collection(db, "sori_users", currentUser.email, "history"), orderBy("date", "desc")); const s = await getDocs(q); setHistoryList(s.docs.map(d => ({ id: d.id, ...d.data() }))); setViewMode("history"); setLoading(false); };
  
  const isDialogueFinished = courseType === 'dialogue' && parsedScript.length > 0 && completedLines.length === parsedScript.length;

  if (!currentUser) return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="text-center bg-white p-10 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-100">
        <h1 className="text-4xl font-black text-blue-600 mb-2">Sori-Tutor</h1>
        <p className="text-slate-500 mb-8 font-medium">AI와 함께하는 한국어 발음 교정</p>
        <Login onUserChange={handleUserChange} />
        <p className="text-xs text-slate-400 mt-6">* 구글 로그인 시 무료 체험 (일 3회)</p>
      </div>
    </main>
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-slate-50 max-w-lg mx-auto shadow-2xl relative overflow-hidden">
      {/* 헤더 */}
      <header className="bg-white px-5 py-3 flex justify-between items-center flex-none border-b border-slate-100">
         <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setViewMode("home")}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">S</div>
            <span className="font-bold text-lg text-slate-800">Sori-Tutor</span>
         </div>
         <div className="flex items-center gap-3">
             <button onClick={handleBugReport} className="text-xl hover:scale-110 transition">🚨</button>
             <button onClick={fetchInbox} className="relative hover:scale-110 transition">
                 <Mail size={22}/>
                 {hasNewMail&&<span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
             </button>
             <button onClick={handleLogout} className="text-xl hover:scale-110 transition">👋</button>
         </div>
      </header>

      {/* 상태 표시줄 */}
      <div className="bg-white px-5 py-2 flex justify-between items-center border-b border-slate-50 text-sm flex-none">
         <div className="flex gap-2">
            <button onClick={fetchRanking} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full font-bold hover:bg-yellow-100 transition"><Trophy size={14} /> 랭킹</button>
            <button onClick={fetchHistory} className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold hover:bg-slate-200 transition">내 기록</button>
         </div>
         <div className="flex items-center gap-1 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded-full border border-slate-200" onClick={() => setShowPaymentModal(true)}>
            {userRole === 'guest' ? <><Heart size={14} className="text-red-500" fill="currentColor"/><span className="font-bold text-slate-700">{hearts}</span></> : <><Coins size={14} className="text-yellow-500" fill="currentColor"/><span className="font-bold text-slate-700">{tokens}</span></>}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide pb-24">
        {viewMode === "home" && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                 {/* Streak Card */}
                 <div className="bg-white p-5 rounded-2xl border shadow-sm flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-800 text-lg">{userAlias || currentUser?.displayName}님</h3>
                            <button onClick={() => setShowNicknameModal(true)} className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50">변경</button>
                        </div>
                        <div className="mt-2 w-full">
                             <p className="text-xs text-slate-500 mb-1">오늘의 목표 <span className="font-bold text-orange-500">{Math.min(todayCount,5)}/5</span></p>
                             <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500 transition-all duration-500 ease-out" style={{width:`${Math.min((todayCount/5)*100,100)}%`}}></div></div>
                             <p className="text-[10px] text-slate-400 mt-1">{todayCount<5 ? `${5-todayCount}회 더 연습하면 Streak +1 🔥` : "오늘 목표 달성 완료! 🎉"}</p>
                        </div>
                    </div>
                    <div className="text-center bg-orange-50 px-4 py-3 rounded-xl min-w-[80px] flex flex-col items-center justify-center">
                        <p className="text-2xl font-black text-orange-500 flex items-center gap-1 justify-center leading-none mb-1">{streak} <span className="text-sm font-bold text-orange-400">일</span></p>
                        <p className="text-[10px] text-orange-700 font-bold">연속 학습중</p>
                    </div>
                 </div>
                 
                 {/* Menus */}
                 <div className="grid gap-3">
                    <button onClick={() => selectCourse("word")} className="w-full p-5 rounded-2xl text-left bg-white shadow-sm border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition group flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform"><Mic size={20} /></div>
                        <div><div className="text-lg font-bold text-slate-800">단어 발음 연습</div><div className="text-sm text-slate-500">기초 어휘 마스터</div></div>
                    </button>
                    <button onClick={() => selectCourse("sentence")} className="w-full p-5 rounded-2xl text-left bg-white shadow-sm border border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 transition group flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform"><Star size={20} /></div>
                        <div><div className="text-lg font-bold text-slate-800">문장 억양 연습</div><div className="text-sm text-slate-500">자연스러운 억양 익히기</div></div>
                    </button>
                    <button onClick={() => selectCourse("dialogue")} className="w-full p-5 rounded-2xl text-left bg-white shadow-sm border border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition group flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform"><MessageSquare size={20} /></div>
                        <div><div className="text-lg font-bold text-slate-800">실전 회화</div><div className="text-sm text-slate-500">AI와 역할극 대화</div></div>
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
           /* ... 내 기록 리스트 (기존 유지) ... */
           <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-slate-500 font-bold flex items-center gap-1"><ChevronLeft size={20}/> 메인으로</button>
            <h2 className="text-2xl font-black text-slate-900 mb-4">나의 학습 기록</h2>
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {['all', 'word', 'sentence', 'dialogue'].map(tab => (
                    <button key={tab} onClick={() => setHistoryTab(tab as any)} className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition border ${historyTab === tab ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>{tab === 'all' ? '전체' : tab === 'word' ? '단어' : tab === 'sentence' ? '문장' : '담화'}</button>
                ))}
            </div>
            <div className="space-y-3">
              {historyList.filter(h => historyTab === 'all' || h.type === historyTab).map((h) => (
                    <HistoryItem key={h.id} item={h} userEmail={currentUser.email} userRole={userRole} />
                ))
              }
              {historyList.length === 0 && <div className="text-center py-10 text-slate-400">아직 학습 기록이 없어요 😅</div>}
            </div>
          </div>
        )}
        
        {viewMode === "practice" && currentProblem && (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
               <button onClick={() => courseType === "word" ? setViewMode("home") : setViewMode("category")} className="text-slate-400 font-bold text-sm flex items-center hover:text-slate-600"><X size={20}/> 종료</button>
               <div className="flex gap-2">
                 <button onClick={handlePrevProblem} disabled={historyIndex <= 0} className={`px-3 py-1 rounded-lg text-xs font-bold transition ${historyIndex > 0 ? 'bg-white text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-400'}`}>이전</button>
                 {courseType !== "dialogue" && <button onClick={handleNextProblem} className="px-3 py-1 rounded-lg text-xs font-bold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50">다음 ▶</button>}
               </div>
            </div>

            {courseType === "dialogue" ? (
               <div className="space-y-4 pb-20">
                  <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                    <span className="text-xs text-purple-600 font-bold bg-purple-100 px-2 py-1 rounded mb-2 inline-block">Role Play</span>
                    <h1 className="font-bold text-xl text-purple-900 mb-2">{currentProblem.title}</h1>
                    <div className="flex bg-white rounded-lg p-1 border border-purple-100 w-fit mb-3">
                        <button onClick={() => setMyRole("A")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${myRole==="A"?'bg-purple-600 text-white shadow-sm':'text-slate-400 hover:text-slate-600'}`}>A 역할</button>
                        <button onClick={() => setMyRole("B")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${myRole==="B"?'bg-purple-600 text-white shadow-sm':'text-slate-400 hover:text-slate-600'}`}>B 역할</button>
                    </div>
                    <p className="text-sm text-purple-800 leading-relaxed">{currentProblem.translation}</p>
                  </div>
                  <div className="space-y-4 pb-4">
                    {parsedScript.map((line, idx) => {
                      const isMyRole = line.role === myRole; 
                      const isSelected = targetLineIndex === idx;
                      const isDone = completedLines.includes(idx);
                      return (
                        <div key={idx} className={`flex ${isMyRole ? 'justify-end' : 'justify-start'}`}>
                          <div onClick={() => { if (isMyRole) { setTargetLineIndex(idx); setResult(null); setAudioUrl(null); setAudioBlob(null); }}}
                            className={`max-w-[85%] p-4 rounded-2xl cursor-pointer border-2 transition-all relative ${isMyRole ? (isSelected ? 'bg-blue-50 border-blue-500 shadow-md scale-[1.02]' : isDone ? 'bg-green-50 border-green-200 opacity-80' : 'bg-white border-blue-100 hover:border-blue-300') : 'bg-slate-50 border-transparent text-slate-400'}`}>
                            <div className="flex justify-between items-center mb-1">
                               <div className="text-xs font-bold flex items-center gap-1 opacity-70">
                                  {line.role}
                                  <button onClick={(e) => { e.stopPropagation(); handleGoogleTTS(line.text, currentProblem.audio_paths?.[idx]); }} className="ml-1 bg-slate-200 p-1 rounded-full hover:bg-blue-500 hover:text-white transition disabled:opacity-50"><Volume2 size={10}/></button>
                               </div>
                               {isMyRole && isDone && <span className="text-green-600 text-[10px] font-bold bg-green-100 px-1.5 rounded">완료</span>}
                            </div>
                            <div className={`text-base font-medium leading-snug ${isMyRole ? 'text-slate-800' : 'text-slate-500'}`}>{line.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
               </div>
            ) : (
               // 🔥 단어/문장 연습 화면: 스피커 버튼 삭제됨
               <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center mb-6 mt-4 relative">
                  <h1 className="text-3xl font-black text-slate-800 mb-4 break-keep leading-tight">{currentProblem.text}</h1>
                  <p className="text-xl text-slate-500 font-serif mb-8 italic">{currentProblem.pronunciation}</p>
                  
                  {/* 듣기 버튼이 없습니다. 사용자가 직접 읽어보도록 유도 */}
                  
                  <div className="bg-slate-50 text-slate-600 text-sm font-medium p-3 rounded-xl inline-block border border-slate-200 mt-4">
                     💡 {courseType==="word" ? currentProblem.tip : currentProblem.translation}
                     <button onClick={() => handleGoogleTTS(courseType==="word" ? currentProblem.tip : currentProblem.translation)} className="ml-2 inline-flex align-middle bg-slate-200 rounded-full p-1 hover:bg-blue-500 hover:text-white transition"><Volume2 size={10} /></button>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 컨트롤 및 결과 창 (Fixed) */}
      {viewMode === "practice" && (
        <div className="flex-none bg-white border-t p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] rounded-t-3xl z-50">
          {result ? (
            // 🔥 [3단 피드백 결과 화면]
            <div className="animate-in slide-in-from-bottom duration-300 space-y-4">
               {/* 1. 점수 */}
               <div className="flex items-center justify-between">
                   <h3 className="font-bold text-lg text-slate-800">분석 결과</h3>
                   <span className={`text-2xl font-black ${result.score >= 80 ? 'text-green-500' : 'text-orange-500'}`}>{result.score}점</span>
               </div>

               {/* 2. 발음 비교 카드 */}
               <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                   <div>
                       <span className="text-xs font-bold text-slate-400 block mb-1">인식된 발음 (내가 낸 소리)</span>
                       <div className="text-lg font-bold text-red-500 tracking-wide bg-white p-2 rounded border border-red-100 break-keep">
                           {result.recognized}
                       </div>
                   </div>
                   <div className="flex justify-center"><div className="w-0.5 h-3 bg-slate-300"></div></div>
                   <div>
                       <span className="text-xs font-bold text-slate-400 block mb-1">올바른 발음 (정답 소리)</span>
                       <div className="flex items-center justify-between bg-white p-2 rounded border border-green-100">
                           <div className="text-lg font-bold text-green-600 tracking-wide break-keep">{result.correct}</div>
                           {/* 결과 화면에서는 정답 듣기 가능 */}
                           <button onClick={()=>handleGoogleTTS(currentProblem.text, currentProblem.audio_path)} className="bg-green-100 text-green-700 p-2 rounded-full hover:bg-green-200 shadow-sm"><Volume2 size={18}/></button>
                       </div>
                   </div>
               </div>

               {/* 3. 설명 및 조언 */}
               <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                   <div className="flex items-start gap-2 mb-3">
                       <Info size={16} className="text-blue-600 mt-0.5 shrink-0"/>
                       <p className="text-sm text-blue-800 font-bold leading-snug">{result.explanation}</p>
                   </div>
                   <div className="flex items-start gap-2 pt-3 border-t border-blue-200">
                       <span className="text-xs font-bold text-blue-500 shrink-0 bg-blue-100 px-1.5 py-0.5 rounded">Advice</span>
                       <p className="text-xs text-blue-700 leading-relaxed">{result.advice}</p>
                   </div>
               </div>

               <button onClick={() => { setResult(null); setAudioUrl(null); if (courseType !== 'dialogue') handleNextProblem(); }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 shadow-lg">
                   {courseType === "dialogue" ? "확인" : "다음 문제 (랜덤)"}
               </button>
            </div>
          ) : (
            // 녹음 대기 화면
            <div className="flex flex-col items-center gap-4">
               {courseType === "dialogue" && targetLineIndex === null && <div className="text-sm text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-full animate-bounce">👆 먼저 대사 박스를 선택해주세요!</div>}
               {loading && <div className="flex items-center gap-2 text-slate-600 font-bold animate-pulse"><div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div> AI가 분석 중입니다...</div>}
               
               {!recording && !audioUrl && !loading && (
                   <button onClick={startRecording} disabled={courseType === "dialogue" && targetLineIndex === null} className="w-16 h-16 rounded-full bg-red-500 text-white shadow-xl flex items-center justify-center transition transform hover:scale-105 active:scale-95 disabled:bg-slate-200 disabled:shadow-none">
                       <Mic size={32} />
                   </button>
               )}
               {recording && (
                   <div className="flex flex-col items-center">
                       <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100"><div className="w-6 h-6 bg-white rounded-md"></div></button>
                       <span className="text-xs text-red-500 font-bold mt-2">녹음 중...</span>
                   </div>
               )}
               {audioUrl && !recording && !loading && (
                   <div className="w-full space-y-3 animate-in fade-in zoom-in duration-200">
                       <audio src={audioUrl} controls className="w-full h-10 rounded-lg shadow-sm border border-slate-200 bg-slate-50" />
                       <div className="flex gap-2 w-full">
                           <button onClick={() => {setAudioUrl(null); setAudioBlob(null);}} className="flex-1 py-3 bg-white hover:bg-slate-50 text-slate-600 rounded-xl font-bold transition border border-slate-200">재녹음</button>
                           <button onClick={analyzeAudio} className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition flex items-center justify-center gap-2">
                               <span>분석하기</span>
                               <span className="bg-blue-700 px-2 py-0.5 rounded text-xs text-blue-100">{userRole === 'guest' ? '-1 ❤️' : '-1 🪙'}</span>
                           </button>
                       </div>
                   </div>
               )}
            </div>
          )}
        </div>
      )}

      {/* 모달들 (메시지, 랭킹, 결제 등)은 기존 코드와 동일하게 유지 */}
      {showInboxModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm">
              <div className="bg-white w-full h-full sm:h-[600px] sm:max-w-md sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                  {selectedMessage ? (
                      <div className="flex flex-col h-full bg-white">
                          <div className="p-4 border-b flex items-center gap-2 bg-white sticky top-0 z-10">
                              <button onClick={() => setSelectedMessage(null)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft size={24}/></button>
                              <h3 className="font-bold text-slate-800">메세지 상세</h3>
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
                      </div>
                  ) : (
                      <div className="flex flex-col h-full bg-slate-50">
                          <div className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
                              <h3 className="font-bold text-lg flex items-center gap-2"><Mail size={18}/> 메시지함</h3>
                              <button onClick={() => setShowInboxModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18}/></button>
                          </div>
                          <div className="p-4 overflow-y-auto flex-1 space-y-3">
                              {inboxList.map((msg) => (
                                  <div key={msg.id} onClick={() => setSelectedMessage(msg)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 active:scale-98 transition cursor-pointer relative">
                                      {!msg.read && <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-2 inline-block">{msg.from || "관리자"}</span>
                                      <h4 className="font-bold text-slate-800 text-sm truncate pr-4">{msg.title}</h4>
                                      <p className="text-xs text-slate-400 mt-1">{msg.date instanceof Date ? msg.date.toLocaleDateString() : msg.date?.toDate ? msg.date.toDate().toLocaleDateString() : ""}</p>
                                  </div>
                              ))}
                              {inboxList.length === 0 && <p className="text-slate-400 text-center py-10">새로운 메시지가 없습니다.</p>}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {showRankingModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-sm">
              <div className="bg-white w-full h-[80vh] sm:h-[600px] sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col absolute bottom-0 sm:relative animate-in slide-in-from-bottom duration-300">
                  <div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white relative">
                      <button onClick={() => setShowRankingModal(false)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30"><X size={20} className="text-white"/></button>
                      <h3 className="font-bold text-2xl flex items-center gap-2"><Trophy className="text-yellow-300" fill="currentColor"/> 주간 랭킹</h3>
                      <p className="text-indigo-100 text-sm mt-1 opacity-80">매주 월요일 00시 초기화</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                      {rankingList.map((ranker, index) => (
                          <div key={index} className={`flex items-center p-3 rounded-xl border ${ranker.email === currentUser.email ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 ${index < 3 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-400'}`}>
                                  {index + 1}
                              </div>
                              <div className="flex-1">
                                  <p className="font-bold text-sm text-slate-800 flex items-center gap-1">
                                      {ranker.alias || ranker.name}
                                      {ranker.email === currentUser.email && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">나</span>}
                                  </p>
                                  <p className="text-xs text-slate-400">{ranker.streak || 0}일 연속 학습 중</p>
                              </div>
                              <div className="font-bold text-indigo-600 text-sm">{(ranker.analysis_count * 10).toLocaleString()} P</div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="bg-slate-900 p-6 text-white text-center">
                  <h2 className="text-xl font-bold">
                    {(userRole === 'guest' && hearts <= 0) || (userRole === 'student' && tokens <= 0) ? "앗! 이용 횟수 소진 😢" : "멤버십 및 토큰 충전 🔋"}
                  </h2>
              </div>
              <div className="p-6">
                  <div className="text-center mb-6">
                      {(userRole === 'guest' && hearts <= 0) || (userRole === 'student' && tokens <= 0) ? (
                          <p className="text-slate-600 font-medium text-sm">무료 체험 횟수를 모두 사용하셨습니다.<br/>더 많은 연습을 위해 충전해보세요!</p>
                      ) : (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                              <p className="text-slate-400 text-xs mb-1 font-bold">MY BALANCE</p>
                              <p className="text-2xl font-black text-slate-800">{userRole === 'guest' ? `${hearts} 하트` : `${tokens} 토큰`}</p>
                          </div>
                      )}
                  </div>
                  <div className="space-y-3 mb-6">
                      <a href={getMailtoLink("Basic Plan", "2,900원")} className="block border border-slate-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl p-4 transition group"><div className="flex justify-between items-center"><div className="text-left"><div className="font-bold text-slate-800">Basic Plan</div><div className="text-xs text-slate-500">토큰 100개</div></div><div className="text-blue-600 font-bold">2,900원</div></div></a>
                      <a href={getMailtoLink("Pro Plan", "5,900원")} className="block border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-500 rounded-xl p-4 transition group relative overflow-hidden"><div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">BEST</div><div className="flex justify-between items-center"><div className="text-left"><div className="font-bold text-slate-800">Pro Plan</div><div className="text-xs text-slate-500">토큰 250개</div></div><div className="text-blue-600 font-bold">5,900원</div></div></a>
                  </div>
                  <button onClick={() => setShowPaymentModal(false)} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">닫기</button>
              </div>
          </div>
        </div>
      )}

      {showNicknameModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center shadow-2xl">
                  <h2 className="text-xl font-black mb-1 text-slate-800">닉네임 설정</h2>
                  <input className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl mb-4 font-bold text-center text-slate-800" value={userAlias} onChange={e => setUserAlias(e.target.value)} placeholder="예: 열공하는개미" />
                  <div className="flex gap-2"><button onClick={() => setShowNicknameModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">취소</button><button onClick={() => saveNickname(userAlias)} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">저장</button></div>
              </div>
          </div>
      )}
    </main>
  );
}