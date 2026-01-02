"use client";

import { useState, useRef, useEffect } from "react";
import Login from "./components/Login";
import { auth, db } from "@/lib/firebase";
import { 
  doc, getDoc, collection, getDocs, query, where, addDoc, serverTimestamp, orderBy, updateDoc, setDoc, increment, limit, writeBatch 
} from "firebase/firestore";

export default function Home() {
  // --- 상태 관리 ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("guest");
  
  const [hearts, setHearts] = useState(3);
  const [tokens, setTokens] = useState(0);
  const [userAlias, setUserAlias] = useState<string>(""); 
  
  const [streak, setStreak] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  const [inboxList, setInboxList] = useState<any[]>([]);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [hasNewMail, setHasNewMail] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);

  const [viewMode, setViewMode] = useState("home"); 
  const [courseType, setCourseType] = useState<"word" | "sentence" | "dialogue" | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  // 🔥 문제 및 내비게이션 상태
  const [problemList, setProblemList] = useState<any[]>([]); 
  const [currentProblem, setCurrentProblem] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<any[]>([]); // 방문 기록
  const [historyIndex, setHistoryIndex] = useState(-1); // 현재 위치

  const [rankingList, setRankingList] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]); 
  const [historyTab, setHistoryTab] = useState<"all" | "word" | "sentence" | "dialogue">("all");
  const [expandedExplanationId, setExpandedExplanationId] = useState<string | null>(null); 

  const [explanationCache, setExplanationCache] = useState<Record<string, string>>({});

  const [parsedScript, setParsedScript] = useState<{role: string, text: string}[]>([]);
  const [myRole, setMyRole] = useState<"A" | "B">("A"); 
  const [targetLineIndex, setTargetLineIndex] = useState<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

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
        if (data.last_access_date === today) setTodayCount(data.today_count || 0);
        else setTodayCount(0);
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
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setInboxList(msgs);
    setShowInboxModal(true);
    const unread = msgs.filter((m: any) => !m.read);
    if (unread.length > 0) {
      const batch = writeBatch(db);
      unread.forEach((m: any) => batch.update(doc(db, "sori_users", currentUser.email, "inbox", m.id), { read: true }));
      await batch.commit(); setHasNewMail(false);
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
  const fetchRanking = async () => { const q = query(collection(db, "sori_users"), orderBy("analysis_count", "desc"), limit(10)); const snap = await getDocs(q); setRankingList(snap.docs.map(d => d.data())); setShowRankingModal(true); };

  const analyzeAudio = async () => {
    if (!audioBlob || !currentProblem) return;
    if (userRole === "guest" && hearts <= 0) return setShowPaymentModal(true);
    if (userRole === "student" && tokens <= 0) return setShowPaymentModal(true);
    setLoading(true); setResult(null);
    let targetText = currentProblem.text; let contextInfo = ""; 
    if (courseType === "dialogue" && targetLineIndex !== null) { targetText = parsedScript[targetLineIndex].text; contextInfo = `장소: ${selectedCategory}, 상황: ${currentProblem.title}, 역할: ${myRole}`; }
    
    const formData = new FormData(); 
    formData.append("audio", audioBlob); 
    formData.append("targetText", targetText); 
    formData.append("type", courseType || "sentence"); 
    formData.append("context", contextInfo);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert("오류: " + data.error); await updateDoc(doc(db, "sori_users", currentUser.email), { error_count: increment(1) }); }
      else {
        setResult(data);
        const userRef = doc(db, "sori_users", currentUser.email);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const todayStr = new Date().toDateString();
        const lastDate = userData?.last_access_date || "";
        let newTodayCount = userData?.today_count || 0; let newStreak = userData?.streak || 0;

        if (lastDate !== todayStr) {
           newTodayCount = 1;
           const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
           if (lastDate === yesterday.toDateString() && userData?.today_count >= 5) { /* 유지 */ } 
           else { newStreak = 0; }
        } else newTodayCount += 1;

        let rewardMsg = "";
        if (newTodayCount === 5) {
          newStreak += 1; 
          if (newStreak > 0 && newStreak % 7 === 0) {
             rewardMsg = `🔥 ${newStreak}일 연속! 보상 15토큰! 🎁`;
             if (userRole === 'student') { await updateDoc(userRef, { tokens: increment(15) }); setTokens(prev => prev + 15); }
          } else rewardMsg = `🔥 목표 달성! (${newStreak}일 연속)`;
        }
        setTodayCount(newTodayCount); setStreak(newStreak); if(rewardMsg) alert(rewardMsg);

        const updates: any = { analysis_count: increment(1), last_access_date: todayStr, today_count: newTodayCount, streak: newStreak };
        if (userRole === "guest") { setHearts(p=>p-1); updates.free_hearts = hearts - 1; } else { setTokens(p=>p-1); updates.tokens = tokens - 1; }
        await updateDoc(userRef, updates);
        await addDoc(collection(db, "sori_users", currentUser.email, "history"), { text: targetText, category: courseType==="word"?currentProblem.category:selectedCategory, score: data.score, feedback: data.feedback, type: courseType, date: serverTimestamp() });
      }
    } catch (error) { alert("서버 오류"); } finally { setLoading(false); }
  };

  const getGrammarExplanation = async (hId: string, text: string, type: string) => {
    if (expandedExplanationId === hId) { setExpandedExplanationId(null); return; }
    if (explanationCache[text]) {
      setHistoryList(prev => prev.map(h => h.id === hId ? { ...h, explanation: explanationCache[text] } : h));
      setExpandedExplanationId(hId);
      return;
    }
    if ((userRole === 'guest' && hearts <= 0) || (userRole === 'student' && tokens <= 0)) return setShowPaymentModal(true);
    if (!confirm(userRole === 'guest' ? "하트 1개 차감" : "토큰 1개 차감")) return;
    setExpandedExplanationId(hId);
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, type }) });
      const data = await res.json();
      const userRef = doc(db, "sori_users", currentUser.email);
      if (userRole === "guest") { setHearts(p => p-1); await updateDoc(userRef, { free_hearts: increment(-1) }); } 
      else { setTokens(p => p-1); await updateDoc(userRef, { tokens: increment(-1) }); }
      setHistoryList(prev => prev.map(h => h.id === hId ? { ...h, explanation: data.explanation } : h));
      setExplanationCache(prev => ({ ...prev, [text]: data.explanation })); 
    } catch (e) { alert("오류"); }
  };

  const getMailtoLink = (planName: string, price: string) => {
    const email = "ot.helper7@gmail.com";
    const subject = `[Sori-Tutor] ${planName} 결제 문의드립니다`;
    const bodyText = `소리 튜터 이용중 결제 문의드립니다.\n\n1. 직업: \n2. 사용 목적: \n3. 결제 희망 금액: (${price})\n4. 기타 문의: \n\n(이곳에 내용을 적어주세요)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  };
  
  const selectCourse = async (type: any) => { 
    setCourseType(type); 
    if (type === "word") {
      const q = query(collection(db, "sori_curriculum_word"));
      const s = await getDocs(q);
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setProblemList(l);
      if (l.length > 0) initPractice(l); // 초기화 로직 분리
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
  
  // 🔥 [New] 문제 초기화 및 내비게이션 로직
  const initPractice = (list: any[]) => {
    if (list.length === 0) return;
    const r = Math.floor(Math.random() * list.length);
    const firstProb = list[r];
    setCurrentProblem(firstProb);
    setHistoryStack([firstProb]); // 기록 시작
    setHistoryIndex(0);
    if ((firstProb as any).script) parseDialogue((firstProb as any).script);
  };

  const handleNextProblem = () => {
    if (!problemList || problemList.length === 0) return;
    const r = Math.floor(Math.random() * problemList.length);
    const nextProb = problemList[r];
    
    // 방문 기록 추가
    const newStack = [...historyStack.slice(0, historyIndex + 1), nextProb];
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    
    updateCurrentProblem(nextProb);
  };

  const handlePrevProblem = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      updateCurrentProblem(historyStack[prevIndex]);
    }
  };

  const updateCurrentProblem = (prob: any) => {
    setCurrentProblem(prob);
    setResult(null); setAudioUrl(null); setAudioBlob(null);
    if ((prob as any).script) parseDialogue((prob as any).script);
  };

  const parseDialogue = (script: string) => { if (!script) return; const l = script.split("|").map(line => { const [r, t] = line.split(":"); return { role: r?.trim(), text: t?.trim() }; }); setParsedScript(l); setTargetLineIndex(null); };
  const fetchHistory = async () => { if (!currentUser) return; setLoading(true); const q = query(collection(db, "sori_users", currentUser.email, "history"), orderBy("date", "desc")); const s = await getDocs(q); setHistoryList(s.docs.map(d => ({ id: d.id, ...d.data() }))); setViewMode("history"); setLoading(false); };
  const startRecording = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorderRef.current = new MediaRecorder(s); mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); }; mediaRecorderRef.current.onstop = () => { const b = new Blob(chunksRef.current, { type: "audio/webm" }); setAudioUrl(URL.createObjectURL(b)); setAudioBlob(b); chunksRef.current = []; }; mediaRecorderRef.current.start(); setRecording(true); setResult(null); } catch (err) { alert("마이크 권한 필요"); } };
  const stopRecording = () => { if (mediaRecorderRef.current && recording) { mediaRecorderRef.current.stop(); setRecording(false); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); } };

  if (!currentUser) return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="text-center bg-white p-10 rounded-2xl shadow-xl max-w-sm w-full"><h1 className="text-4xl font-black text-gray-900 mb-2">Sori-Tutor</h1><p className="text-gray-700 mb-6 font-medium">AI 음운론 기반 발음 교정</p><Login onUserChange={handleUserChange} /><p className="text-sm text-gray-600 mt-4">* 로그인 시 무료 체험(일 3회)</p></div>
    </main>
  );

  return (
    <main className="flex min-h-screen flex-col bg-gray-50 max-w-lg mx-auto shadow-2xl relative">
      <header className="bg-white px-5 py-4 flex justify-between items-center sticky top-0 z-40 border-b border-gray-200">
        <div className="font-bold text-xl text-blue-700 cursor-pointer" onClick={() => setViewMode("home")}>Sori-Tutor</div>
        <div className="flex items-center gap-3">
           <button onClick={fetchInbox} className="relative text-2xl mr-2">📩{hasNewMail && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></span>}</button>
           <button onClick={fetchRanking} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold border border-yellow-300 transition flex items-center gap-1 shadow-sm">🏆</button>
           <div className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full text-sm font-bold cursor-pointer border border-gray-300 hover:bg-gray-200" onClick={() => setShowPaymentModal(true)}>{userRole === 'guest' ? (<><span className="text-red-500">❤️</span><span className="text-gray-900">{hearts}</span></>) : (<><span className="">🪙</span><span className="text-gray-900">{tokens}</span></>)}<span className="text-xs text-gray-600 ml-1 font-normal">충전</span></div>
           <button onClick={fetchHistory} className="text-2xl" title="내 기록">📂</button>
           <Login onUserChange={handleUserChange} />
        </div>
      </header>

      <div className="p-6 flex-1 overflow-y-auto pb-32">
        {viewMode === "home" && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-200 mb-4 shadow-sm">
               <div className="flex items-center gap-2 mb-2"><h3 className="font-bold text-blue-900 text-base">👋 {userAlias || currentUser.displayName}님!</h3><button onClick={() => setShowNicknameModal(true)} className="text-xs text-gray-400 underline hover:text-blue-600 flex items-center gap-1">✏️ 변경</button></div>
               <div className="bg-white p-3 rounded-lg border border-blue-100 flex items-center justify-between shadow-sm">
                  <div><p className="text-xs text-gray-500 font-bold mb-1">오늘의 목표 (5회)</p><div className="flex gap-1">{[1,2,3,4,5].map(i => (<div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${todayCount >= i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>{todayCount >= i ? '✓' : i}</div>))}</div></div>
                  <div className="text-right"><p className="text-2xl font-black text-orange-500">🔥 {streak}일</p><p className="text-xs text-orange-800 font-bold">연속 학습 중!</p></div>
               </div>
            </div>
            {[{id:'word', t:'단어 카드', d:'랜덤 발음 연습', c:'blue'}, {id:'sentence', t:'문장 억양', d:'필수 문장 연습', c:'indigo'}, {id:'dialogue', t:'실전 회화', d:'역할극 대화 연습', c:'purple'}].map(item => (
              <button key={item.id} onClick={() => selectCourse(item.id as any)} className={`w-full p-6 rounded-2xl text-left bg-white shadow-md border-2 border-transparent hover:border-${item.c}-500 transition group`}>
                <div className="text-2xl mb-1 font-black text-gray-900 group-hover:text-blue-700">{item.t}</div>
                <div className="text-base text-gray-700 font-medium">{item.d}</div>
              </button>
            ))}
          </div>
        )}

        {viewMode === "category" && (
          <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-gray-700 font-bold flex items-center gap-1">← 뒤로가기</button>
            <h2 className="text-2xl font-black text-gray-900 mb-6">주제를 선택하세요</h2>
            <div className="grid grid-cols-2 gap-4">{categories.map(cat => (<button key={cat} onClick={() => selectCategory(cat)} className="bg-white p-5 rounded-xl shadow border-2 border-gray-100 hover:border-blue-500 font-bold text-gray-800 text-lg">{cat}</button>))}</div>
          </div>
        )}

        {viewMode === "history" && (
          <div>
            <button onClick={() => setViewMode("home")} className="mb-4 text-gray-700 font-bold">← 홈으로</button>
            <h2 className="text-2xl font-black text-gray-900 mb-4">나의 학습 기록</h2>
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">{['all', 'word', 'sentence', 'dialogue'].map(tab => (<button key={tab} onClick={() => setHistoryTab(tab as any)} className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition ${historyTab === tab ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}>{tab === 'all' ? '전체' : tab === 'word' ? '단어' : tab === 'sentence' ? '문장' : '담화'}</button>))}</div>
            <div className="space-y-4">
              {historyList.filter(h => historyTab === 'all' || h.type === historyTab).map((h, i) => (
                <div key={i} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-700 border border-gray-200">{h.type} / {h.category}</span><span className="text-xs text-gray-500">{h.date?.toDate ? h.date.toDate().toLocaleDateString() : ""}</span></div>
                  <div className="font-black text-gray-900 text-xl mb-3">"{h.text}"</div>
                  <div className="flex items-center gap-2 mb-3"><span className={`text-2xl font-black ${Number(h.score) >= 80 ? 'text-green-600' : 'text-orange-500'}`}>{h.score}점</span><p className="text-sm text-gray-800 bg-gray-50 p-2 rounded flex-1 border border-gray-100 font-medium">{h.feedback}</p></div>
                  <button onClick={() => getGrammarExplanation(h.id, h.text, h.type)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">{expandedExplanationId === h.id ? "접기 ▲" : `🔍 문법 설명 보기 (${userRole === 'guest' ? '❤️-1' : '🪙-1'})`}</button>
                  {expandedExplanationId === h.id && <div className="mt-2 bg-blue-50 p-3 rounded-lg text-sm text-blue-900 font-medium">{h.explanation || "설명 로딩 중..."}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === "practice" && currentProblem && (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-2">
               {courseType !== "word" ? <button onClick={() => setViewMode("category")} className="text-gray-500 font-bold text-sm">← {selectedCategory}</button> : <button onClick={() => setViewMode("home")} className="text-gray-500 font-bold text-sm">← 종료</button>}
               {/* 🔥 [New] 내비게이션 버튼 (이전 / 랜덤) */}
               <div className="flex gap-2">
                 <button onClick={handlePrevProblem} disabled={historyIndex <= 0} className={`px-3 py-1 rounded text-xs font-bold border ${historyIndex > 0 ? 'bg-white text-blue-600 border-blue-200' : 'bg-gray-100 text-gray-400 border-transparent'}`}>◀ 이전</button>
                 <button onClick={handleNextProblem} className="px-3 py-1 rounded text-xs font-bold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50">다음(랜덤) ▶</button>
               </div>
            </div>
            
            {courseType === "dialogue" ? (
              <div className="space-y-4">
                <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm">
                  <h1 className="font-black text-xl text-purple-900 mb-2">{currentProblem.title}</h1>
                  {/* 역할 선택 강조 */}
                  <div className="flex bg-white rounded-lg p-1 border border-purple-200 w-fit mb-2">
                    <button onClick={() => setMyRole("A")} className={`px-4 py-1 rounded text-sm font-bold transition ${myRole==="A"?'bg-purple-700 text-white ring-2 ring-purple-300':'text-gray-400'}`}>A 역할</button>
                    <button onClick={() => setMyRole("B")} className={`px-4 py-1 rounded text-sm font-bold transition ${myRole==="B"?'bg-purple-700 text-white ring-2 ring-purple-300':'text-gray-400'}`}>B 역할</button>
                  </div>
                  <p className="text-base text-purple-800 font-medium">{currentProblem.translation}</p>
                </div>
                <div className="space-y-4 pb-4">
                  {parsedScript.map((line, idx) => {
                    const isMyRole = line.role === myRole; 
                    const isSelected = targetLineIndex === idx;
                    return (
                      // 🔥 [New] 내 역할 시각적 강조
                      <div key={idx} className={`flex ${isMyRole ? 'justify-end' : 'justify-start'}`}>
                        <div onClick={() => { if (isMyRole) { setTargetLineIndex(idx); setResult(null); setAudioUrl(null); setAudioBlob(null); }}}
                          className={`max-w-[85%] p-4 rounded-2xl cursor-pointer border-2 transition-all 
                            ${isMyRole 
                               ? (isSelected 
                                   ? 'bg-blue-100 border-blue-600 shadow-lg scale-105 ring-2 ring-blue-300' // 선택됨
                                   : 'bg-white border-blue-400 shadow-sm hover:bg-blue-50') // 내 역할(대기)
                               : 'bg-gray-100 border-transparent text-gray-400 opacity-70 grayscale' // 상대방
                            }`}>
                          <div className="flex justify-between items-center mb-1">
                             <div className="text-xs font-bold text-gray-800">{line.role}</div>
                             {isMyRole && <div className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">✅ 내가 할 역할</div>}
                          </div>
                          <div className={`text-lg leading-snug font-bold ${isMyRole ? 'text-gray-900' : 'text-gray-500'}`}>{line.text}</div>
                          {isSelected && !result && <div className="text-xs text-blue-700 font-bold mt-2 animate-pulse">👇 아래 마이크를 눌러 녹음하세요!</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8 text-center mb-6 relative">
                 {courseType === "word" && <div className="absolute top-4 left-4 bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{currentProblem.category}</div>}
                 <h1 className="text-4xl font-black text-gray-900 mb-4 break-keep tracking-tight mt-4">{currentProblem.text}</h1>
                 <p className="text-2xl text-gray-600 font-serif mb-6">{currentProblem.pronunciation}</p>
                 <div className="bg-gray-100 text-gray-800 text-base font-medium p-3 rounded-xl inline-block border border-gray-200">💡 {courseType==="word" ? currentProblem.tip : currentProblem.translation}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {viewMode === "practice" && (
        <div className="bg-white border-t border-gray-200 p-6 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] sticky bottom-0 z-50">
          {result ? (
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-4 mb-4"><div className={`text-5xl font-black ${result.score >= 80 ? 'text-green-600' : 'text-orange-500'}`}>{result.score}</div><div className="flex-1 text-base text-gray-800 bg-gray-50 p-4 rounded-xl border border-gray-200 font-medium">{result.feedback}</div></div>
              <button onClick={() => {setResult(null); setAudioUrl(null); handleNextProblem(); }} className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-gray-800 transition text-lg">다음 문제 (랜덤) 🎲</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
               {courseType === "dialogue" && targetLineIndex === null && <div className="text-sm text-blue-700 font-bold bg-blue-100 px-4 py-2 rounded-full animate-bounce shadow-sm">☝️ 내 대사 박스를 먼저 터치하세요!</div>}
               {loading && <div className="flex flex-col items-center animate-pulse"><div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-2">🧠</div><span className="text-gray-900 font-bold">AI가 채점 중...</span></div>}
               {!recording && !audioUrl && !loading && <button onClick={startRecording} disabled={courseType === "dialogue" && targetLineIndex === null} className="w-20 h-20 rounded-full bg-red-600 text-white shadow-xl flex items-center justify-center text-3xl disabled:bg-gray-300 transition transform hover:scale-105 active:scale-95">🎙️</button>}
               {recording && <div className="flex flex-col items-center"><button onClick={stopRecording} className="w-20 h-20 rounded-full bg-gray-800 text-white shadow-xl flex items-center justify-center text-3xl animate-pulse ring-4 ring-gray-200">⏹️</button><span className="text-sm text-red-600 font-bold mt-3">녹음 중...</span></div>}
               {audioUrl && !recording && !loading && <div className="w-full space-y-4 animate-fade-in-up"><audio src={audioUrl} controls className="w-full h-12 rounded-lg shadow-sm border border-gray-200" /><div className="flex gap-3 w-full"><button onClick={() => {setAudioUrl(null); setAudioBlob(null);}} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition border border-gray-300">재녹음</button><button onClick={analyzeAudio} className="flex-[2] py-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-lg text-lg transition flex items-center justify-center gap-2"><span>피드백 요청</span><span className="bg-blue-800 px-2 py-0.5 rounded text-sm text-blue-100">{userRole === 'guest' ? '❤️ -1' : '🪙 -1'}</span></button></div></div>}
            </div>
          )}
        </div>
      )}
      {/* (모달 코드들은 이전과 동일하여 생략, 실제 적용 시 이전 코드의 모달 부분 그대로 유지됨) */}
      {showNicknameModal && (<div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center"><h2 className="text-2xl font-black mb-2 text-gray-900">닉네임 설정</h2><input className="w-full border-2 p-3 rounded-xl mb-4 font-bold text-center text-gray-900" value={userAlias} onChange={e => setUserAlias(e.target.value)} /><div className="flex gap-2"><button onClick={() => saveNickname(userAlias)} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">저장</button><button onClick={() => setShowNicknameModal(false)} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300">취소</button></div></div></div>)}
      {showInboxModal && (<div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-sm max-h-[500px] overflow-hidden flex flex-col"><div className="bg-blue-600 p-4 text-white font-bold text-center relative">📬 도착한 메시지함<button onClick={() => setShowInboxModal(false)} className="absolute right-4 top-4 text-white">✕</button></div><div className="p-4 overflow-y-auto flex-1 bg-gray-50 space-y-3">{inboxList.length === 0 ? (<p className="text-gray-500 text-center py-10">도착한 메시지가 없어요.</p>) : (inboxList.map((msg) => (<div key={msg.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{msg.from || "관리자"}</span><span className="text-xs text-gray-400">{msg.date?.toDate ? msg.date.toDate().toLocaleDateString() : ""}</span></div><p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p></div>)))}</div><div className="p-4 border-t bg-white"><button onClick={() => setShowInboxModal(false)} className="w-full py-3 bg-gray-200 text-gray-700 font-bold rounded-xl">닫기</button></div></div></div>)}
      {showRankingModal && (<div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"><div className="bg-yellow-400 p-4 text-center"><h2 className="text-2xl font-black text-yellow-900">🔥 명예의 전당</h2><p className="text-xs text-yellow-800 font-bold">열공 중인 상위 10명</p></div><div className="p-4 max-h-[400px] overflow-y-auto">{rankingList.map((user, idx) => (<div key={idx} className={`flex justify-between items-center p-3 mb-2 rounded-xl border-2 ${idx<3 ? 'border-yellow-200 bg-yellow-50' : 'border-gray-100'}`}><div className="flex items-center gap-3"><span className={`font-black text-lg w-6 text-center ${idx===0?'text-yellow-600':idx===1?'text-gray-500':idx===2?'text-orange-600':'text-gray-400'}`}>{idx+1}</span><span className="font-bold text-gray-800">{user.alias || user.name}</span></div><span className="text-sm font-bold text-blue-600">{user.analysis_count || 0}회</span></div>))}</div><div className="p-4 border-t"><button onClick={() => setShowRankingModal(false)} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl">닫기</button></div></div></div>)}
      {showPaymentModal && (<div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-md overflow-hidden"><div className="bg-gray-900 p-6 text-white text-center"><h2 className="text-2xl font-bold">{(userRole === 'guest' && hearts <= 0) || (userRole === 'student' && tokens <= 0) ? "충전이 필요해요 😢" : "멤버십 / 토큰 충전 🔋"}</h2></div><div className="p-6"><div className="text-center mb-6">{(userRole === 'guest' && hearts <= 0) || (userRole === 'student' && tokens <= 0) ? (<p className="text-gray-700 font-medium">이용 횟수를 모두 사용하셨습니다.<br/>전문적인 코칭을 위해 충전해보세요!</p>) : (<div className="bg-gray-50 p-4 rounded-xl border border-gray-200"><p className="text-gray-500 text-sm mb-1">현재 보유 잔액</p><p className="text-2xl font-black text-blue-600 mb-2">{userRole === 'guest' ? `${hearts} 하트 ❤️` : `${tokens} 토큰 🪙`}</p><p className="text-gray-800 font-bold text-sm">추가 충전을 진행하시겠습니까?</p></div>)}</div><div className="space-y-3 mb-4"><a href={getMailtoLink("Basic Plan", "2,900원")} className="block border-2 border-gray-100 hover:border-blue-500 rounded-xl p-4 transition group"><div className="flex justify-between items-center"><div className="text-left"><div className="font-bold text-lg text-gray-900 group-hover:text-blue-600">Basic Plan</div><div className="text-sm text-gray-500">🪙 토큰 100개 (입문용)</div></div><div className="text-xl font-bold text-blue-600">2,900원</div></div></a><a href={getMailtoLink("Pro Plan", "5,900원")} className="block border-2 border-blue-100 bg-blue-50 hover:border-blue-600 rounded-xl p-4 transition group relative"><div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">BEST</div><div className="flex justify-between items-center"><div className="text-left"><div className="font-bold text-lg text-gray-900 group-hover:text-blue-700">Pro Plan</div><div className="text-sm text-gray-500">🪙 토큰 250개 (대용량)</div></div><div className="text-xl font-bold text-blue-600">5,900원</div></div></a></div><button onClick={() => setShowPaymentModal(false)} className="w-full py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition">닫기</button></div></div></div>)}
    </main>
  );
}