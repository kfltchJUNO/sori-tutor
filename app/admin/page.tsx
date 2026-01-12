"use client";

import { useEffect, useState, useRef } from "react";
import { db, auth, storage } from "@/lib/firebase"; 
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch, onSnapshot, runTransaction, increment, where
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage"; 
import { 
  Mic, Upload, RefreshCw, CheckCircle, XCircle, Music, AlertCircle, DollarSign
} from 'lucide-react';

// --- 성우 옵션 상수 ---
const VOICE_OPTIONS = [
  { label: "--- 👩 여성 성우 ---", value: "", disabled: true },
  { label: "👩 Pulcherrima", value: "ko-KR-Chirp3-HD-Pulcherrima" },
  { label: "👩 Zephyr", value: "ko-KR-Chirp3-HD-Zephyr" },
  { label: "👩 Sulafat", value: "ko-KR-Chirp3-HD-Sulafat" },
  { label: "👩 Despina", value: "ko-KR-Chirp3-HD-Despina" },
  { label: "👩 Leda", value: "ko-KR-Chirp3-HD-Leda" },
  { label: "👩 Laomedeia", value: "ko-KR-Chirp3-HD-Laomedeia" },
  { label: "👩 Kore", value: "ko-KR-Chirp3-HD-Kore" },
  { label: "👩 Gacrux", value: "ko-KR-Chirp3-HD-Gacrux" },
  { label: "👩 Aoede", value: "ko-KR-Chirp3-HD-Aoede" },
  { label: "👩 Vindemiatrix", value: "ko-KR-Chirp3-HD-Vindemiatrix" },
  { label: "--- 👨 남성 성우 ---", value: "", disabled: true },
  { label: "👨 Umbriel", value: "ko-KR-Chirp3-HD-Umbriel" },
  { label: "👨 Rasalgethi", value: "ko-KR-Chirp3-HD-Rasalgethi" },
  { label: "👨 Sadachibia", value: "ko-KR-Chirp3-HD-Sadachibia" },
  { label: "👨 Sadaltager", value: "ko-KR-Chirp3-HD-Sadaltager" },
  { label: "👨 Enceladus", value: "ko-KR-Chirp3-HD-Enceladus" },
  { label: "👨 Puck", value: "ko-KR-Chirp3-HD-Puck" },
  { label: "👨 Iapetus", value: "ko-KR-Chirp3-HD-Iapetus" },
  { label: "👨 Charon", value: "ko-KR-Chirp3-HD-Charon" },
  { label: "👨 Alnilam", value: "ko-KR-Chirp3-HD-Alnilam" },
  { label: "👨 Algieba", value: "ko-KR-Chirp3-HD-Algieba" },
  { label: "👨 Achird", value: "ko-KR-Chirp3-HD-Achird" },
  { label: "👨 Achernar", value: "ko-KR-Chirp3-HD-Achernar" },
  { label: "👨 Zubenelgenubi", value: "ko-KR-Chirp3-HD-Zubenelgenubi" },
  { label: "👨 Algenib", value: "ko-KR-Chirp3-HD-Algenib" }
];

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "word" | "sentence" | "dialogue" | "mail" | "store">("users");

  // --- 기존 데이터 상태 ---
  const [users, setUsers] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [dialogues, setDialogues] = useState<any[]>([]);
  
  // --- 기존 편집/생성 상태 ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [castA, setCastA] = useState("ko-KR-Chirp3-HD-Kore");
  const [castB, setCastB] = useState("ko-KR-Chirp3-HD-Puck"); 
  const [castSingle, setCastSingle] = useState("ko-KR-Chirp3-HD-Kore");

  // --- 쪽지/CSV 관련 상태 ---
  const [mailContent, setMailContent] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  
  // --- 입력 폼 상태 ---
  const [newWord, setNewWord] = useState({ category: "비음화", text: "", pronunciation: "", tip: "" });
  const [newSentence, setNewSentence] = useState({ category: "인사", text: "", pronunciation: "", translation: "" });
  const [newDialogue, setNewDialogue] = useState({ category: "식당", title: "", script: "", translation: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 상점/충전 관련 상태 ---
  const [requests, setRequests] = useState<any[]>([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [manualAmount, setManualAmount] = useState(0);
  const [loadingToken, setLoadingToken] = useState(false);
  
  // --- 오디오 파일 업로드 관련 상태 ---
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");

  // 1. 초기 로드 및 권한 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // 관리자 이메일 확인 (필요시 본인 이메일로 수정)
      if (user && user.email === "ot.helper7@gmail.com") { 
        setIsAdmin(true);
        await fetchAllData();
      } else {
        alert("관리자 권한이 없습니다."); 
        window.location.href = "/";
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 실시간 충전 요청 리스너
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, "sori_charge_requests"), 
      where("status", "==", "pending"), 
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(list);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const fetchAllData = async () => {
    await fetchUsers();
    await fetchData("sori_curriculum_word", setProblems);
    await fetchData("sori_curriculum_sentence", setSentences);
    await fetchData("sori_curriculum_dialogue", setDialogues);
  };

  const fetchUsers = async () => {
    const q = query(collection(db, "sori_users"), orderBy("joined_at", "desc"));
    const s = await getDocs(q);
    setUsers(s.docs.map(d => ({ email: d.id, ...d.data() })));
  };

  const fetchData = async (col: string, setFunc: Function) => {
    const q = query(collection(db, col), orderBy("category", "asc"));
    const s = await getDocs(q);
    setFunc(s.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // 🔥 [수정됨] 단어/문장 TTS 생성 (중복 fetch 삭제로 500 에러 해결)
  const handleGenerateSingleTTS = async (item: any, type: "word" | "sentence") => {
    if (!item.text) return alert("텍스트가 없습니다.");
    
    let textToSpeak = item.text;
    if (type === "word" && item.pronunciation) { 
        textToSpeak = item.pronunciation.replace(/[\[\]]/g, ""); 
    }
    
    if (!confirm(`'${item.text}' 생성?\n(읽는 내용: "${textToSpeak}")`)) return;
    setGeneratingId(item.id);

    try {
        // ✅ [수정 완료] FormData 방식만 사용
        const formData = new FormData();
        formData.append("action", "tts_simple");
        formData.append("text", textToSpeak);
        formData.append("voiceName", castSingle);
        
        const res = await fetch("/api/chat", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        const storageRef = ref(storage, `curriculum/${type}/${item.id}.mp3`);
        await uploadString(storageRef, data.audioContent, 'base64', { contentType: 'audio/mp3' });
        const url = await getDownloadURL(storageRef);
        
        const colName = type === "word" ? "sori_curriculum_word" : "sori_curriculum_sentence";
        await updateDoc(doc(db, colName, item.id), { audio_path: url, has_audio: true, voice: castSingle });
        
        alert("생성 완료!");
        if (type === "word") fetchData("sori_curriculum_word", setProblems);
        else fetchData("sori_curriculum_sentence", setSentences);
        
    } catch (e: any) { 
        alert("실패: " + e.message); 
        console.error(e);
    } finally { 
        setGeneratingId(null); 
    }
  };

  const handleGenerateDialogueTTS = async (dialogue: any) => {
    if (!dialogue.script) return alert("스크립트가 없습니다.");
    if (!confirm(`'${dialogue.title}' 생성?`)) return;
    setGeneratingId(dialogue.id);
    try {
      const lines = dialogue.script.split("|").map((line: string) => {
        const [role, text] = line.split(":");
        return { role: role?.trim(), text: text?.trim() };
      });
      const audioUrls = [];
      for (let i = 0; i < lines.length; i++) {
        const { role, text } = lines[i];
        if (!text) { audioUrls.push(""); continue; }
        const selectedVoice = role === "A" ? castA : castB;
        
        const formData = new FormData();
        formData.append("action", "tts_simple");
        formData.append("text", text);
        formData.append("voiceName", selectedVoice);
        
        const res = await fetch("/api/chat", { method: "POST", body: formData });
        const data = await res.json();
        
        const storageRef = ref(storage, `dialogues/${dialogue.id}/${i}.mp3`);
        await uploadString(storageRef, data.audioContent, 'base64', { contentType: 'audio/mp3' });
        const url = await getDownloadURL(storageRef);
        audioUrls.push(url);
      }
      await updateDoc(doc(db, "sori_curriculum_dialogue", dialogue.id), { audio_paths: audioUrls, has_audio: true, voices: { A: castA, B: castB } });
      alert("생성 완료!");
      fetchData("sori_curriculum_dialogue", setDialogues);
    } catch (e: any) { alert("실패: " + e.message); } finally { setGeneratingId(null); }
  };

  const playAudio = (url: string) => { try { new Audio(url).play(); } catch (e) { alert("재생 오류"); } };
  
  const handleDelete = async (id: string, type: any) => {
    if(!confirm("삭제하시겠습니까?")) return;
    if (type === 'word') setProblems(prev => prev.filter(i => i.id !== id));
    else if (type === 'sentence') setSentences(prev => prev.filter(i => i.id !== id));
    else setDialogues(prev => prev.filter(i => i.id !== id));
    try { await deleteDoc(doc(db, `sori_curriculum_${type}`, id)); } 
    catch (e: any) { console.warn("DB 삭제 오류 (무시):", e.message); }
  };

  // --- 드래그앤드롭 및 CSV 처리 ---
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) { processFile(e.dataTransfer.files[0]); } };
  const processFile = (file: File) => { const reader = new FileReader(); reader.onload = (ev: any) => { const rows = ev.target.result.split("\n").slice(1); const parsedData: any[] = []; rows.forEach((row: string) => { const c = row.split(","); if (c.length >= 3) { let d: any = {}; if (activeTab === "word") d = { category: c[0], text: c[1], pronunciation: c[2], tip: c[3] || "" }; else if (activeTab === "sentence") d = { category: c[0], text: c[1], pronunciation: c[2], translation: c[3] || "" }; else d = { category: c[0], title: c[1], script: c[2], translation: c[3] || "" }; if (d.category && (d.text || d.title)) { parsedData.push(d); } } }); const currentList = activeTab === "word" ? problems : activeTab === "sentence" ? sentences : dialogues; const key = activeTab === "dialogue" ? "title" : "text"; const dups = parsedData.filter(newItem => currentList.some((existItem: any) => existItem[key] === newItem[key]) ).length; setCsvPreview(parsedData); setDuplicateCount(dups); setUploadStatus("ready"); }; reader.readAsText(file); };
  const executeBatchUpload = async () => { if (csvPreview.length === 0) return alert("데이터 없음"); if (!confirm(`${csvPreview.length}개 업로드?`)) return; try { const batch = writeBatch(db); const col = `sori_curriculum_${activeTab}`; csvPreview.forEach(item => { const ref = doc(collection(db, col)); batch.set(ref, { ...item, created_at: serverTimestamp() }); }); await batch.commit(); alert(`완료!`); setCsvPreview([]); setUploadStatus(""); fetchAllData(); } catch (e) { alert("오류"); } };
  
  // --- 유저 관리 및 쪽지 ---
  const toggleSelectUser = (email: string) => { setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]); };
  const toggleSelectAll = () => { if (isAllSelected) setSelectedEmails([]); else setSelectedEmails(users.map(u => u.email)); setIsAllSelected(!isAllSelected); };
  const sendMail = async () => { if (!mailContent.trim() || selectedEmails.length === 0) return alert("내용/대상 확인"); if (!confirm("전송?")) return; try { const batch = writeBatch(db); const msg = { from: "관리자", content: mailContent, date: serverTimestamp(), read: false }; selectedEmails.forEach(e => batch.set(doc(collection(db, "sori_users", e, "inbox")), msg)); await batch.commit(); alert("전송 완료"); setMailContent(""); setSelectedEmails([]); } catch (e) { alert("실패"); } };
  const handleAddTokens = async (email: string, cur: number) => { 
      const input = prompt("조정할 토큰 수 (음수는 차감)", "0"); 
      if (!input) return;
      const amt = parseInt(input); 
      if (isNaN(amt)) return alert("숫자만 입력하세요");
      if (!confirm(`${amt}개 처리하시겠습니까?`)) return; 
      await updateDoc(doc(db, "sori_users", email), { tokens: (cur||0) + amt }); 
      fetchUsers(); 
  };
  const handleSetAlias = async (email: string, cur: string) => { const n = prompt("새 닉네임", cur); if(n) { await updateDoc(doc(db, "sori_users", email), { alias: n }); fetchUsers(); } };

  // --- 편집 폼 핸들링 ---
  const handleSave = async (e: any, type: any) => { e.preventDefault(); const col = `sori_curriculum_${type}`; const data = type==="word"?newWord : type==="sentence"?newSentence : newDialogue; if (!data.category) return alert("카테고리 필수"); const list = type==="word"?problems : type==="sentence"?sentences : dialogues; const key = type==="dialogue" ? "title" : "text"; if (!editingId && list.some((item: any) => item[key] === (data as any)[key])) return alert("이미 등록됨"); if(editingId) await updateDoc(doc(db, col, editingId), { ...data, updated_at: serverTimestamp() }); else await addDoc(collection(db, col), { ...data, created_at: serverTimestamp() }); cancelEdit(); fetchData(col, type==="word"?setProblems : type==="sentence"?setSentences : setDialogues); alert("저장 완료"); };
  const startEdit = (item: any, type: any) => { setEditingId(item.id); setActiveTab(type); window.scrollTo({top:0, behavior:"smooth"}); if(type==="word") setNewWord({...item}); else if(type==="sentence") setNewSentence({...item}); else setNewDialogue({...item}); };
  const cancelEdit = () => { setEditingId(null); setNewWord({category:"비음화", text:"", pronunciation:"", tip:""}); setNewSentence({category:"인사", text:"", pronunciation:"", translation:""}); setNewDialogue({category:"식당", title:"", script:"", translation:""}); };

  // --- 상점/충전/오디오 업로드 핸들러 ---
  const handleApprove = async (req: any) => {
    if (!confirm(`[${req.depositor}]님의 ${req.amount} 토큰 충전을 승인하시겠습니까?`)) return;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "sori_users", req.userId);
        const requestRef = doc(db, "sori_charge_requests", req.id);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
             transaction.set(userRef, { email: req.userId, tokens: req.amount, role: 'student', createdAt: serverTimestamp() });
        } else {
             const currentTokens = userSnap.data().tokens || 0;
             transaction.update(userRef, { tokens: currentTokens + req.amount });
        }
        transaction.update(requestRef, { status: "approved", approvedAt: serverTimestamp() });
      });
      alert(`✅ 지급 완료: ${req.amount} 토큰`);
    } catch (e) { alert(`오류: ${e}`); }
  };

  const handleReject = async (req: any) => {
      const reason = prompt(`거절 사유 입력 (취소 시 중단)`, "입금 내역 확인 불가");
      if (reason === null) return; 
      try {
          await updateDoc(doc(db, "sori_charge_requests", req.id), { status: "rejected", rejectedReason: reason, rejectedAt: serverTimestamp() });
          alert("거절 처리되었습니다.");
      } catch (e) { alert("오류 발생"); }
  };

  const handleManualTokenUpdate = async () => {
      if (!targetEmail || manualAmount === 0) return alert("정보를 모두 입력하세요.");
      if (!confirm(`${targetEmail} / ${manualAmount} 토큰을 적용합니까?`)) return;
      setLoadingToken(true);
      try {
          const userRef = doc(db, "sori_users", targetEmail);
          await updateDoc(userRef, { tokens: increment(manualAmount) });
          alert("적용 완료");
          setTargetEmail(""); setManualAmount(0); fetchUsers();
      } catch (e) { alert("유저가 존재하지 않거나 오류가 발생했습니다."); } finally { setLoadingToken(false); }
  };

  const handleFileUpload = async () => {
    if (!audioFile) return alert("파일을 선택해주세요.");
    setUploadingFile(true);
    try {
      const uniqueName = `${Date.now()}_${audioFile.name}`;
      const storageRef = ref(storage, `listening_audio/${uniqueName}`);
      const snapshot = await uploadBytes(storageRef, audioFile);
      const url = await getDownloadURL(snapshot.ref);
      setUploadedUrl(url);
      setUploadedFileName(uniqueName);
      alert("업로드 성공! URL이 생성되었습니다.");
    } catch (error) { alert("업로드 실패"); } finally { setUploadingFile(false); }
  };

  if (loading) return <div>로딩 중...</div>;
  if (!isAdmin) return null;

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">👮‍♀️ Admin Dashboard</h1>
        <div className="flex space-x-1 bg-white p-1 rounded-lg border overflow-x-auto">
          {["users", "word", "sentence", "dialogue"].map(t => (
            <button key={t} onClick={() => {setActiveTab(t as any); setEditingId(null);}} className={`px-3 py-2 rounded font-bold capitalize whitespace-nowrap ${activeTab===t?"bg-blue-600 text-white":"text-gray-600"}`}>
              {t}
            </button>
          ))}
          <button onClick={() => setActiveTab("mail")} className={`px-3 py-2 rounded font-bold whitespace-nowrap ${activeTab==="mail"?"bg-green-600 text-white":"text-green-600"}`}>💌 쪽지</button>
          <button onClick={() => setActiveTab("store")} className={`px-3 py-2 rounded font-bold whitespace-nowrap ${activeTab==="store"?"bg-purple-600 text-white":"text-purple-600"}`}>🏪 상점</button>
        </div>
      </div>

      {/* --- 쪽지 탭 --- */}
      {activeTab === "mail" && (
        <div className="bg-green-50 p-6 rounded-lg shadow mb-6"><textarea className="w-full h-32 p-3 border rounded mb-3" placeholder="내용..." value={mailContent} onChange={e => setMailContent(e.target.value)}></textarea><button onClick={sendMail} className="bg-green-600 text-white py-2 px-6 rounded font-bold">전송</button></div>
      )}
      
      {/* --- 유저 탭 --- */}
      {activeTab === "users" && (
        <div className="bg-white shadow rounded-lg overflow-x-auto border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100"><tr><th className="px-4 py-3"><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll}/></th><th className="px-4 py-3">유저</th><th className="px-4 py-3">토큰</th><th className="px-4 py-3">관리</th></tr></thead>
            <tbody>{users.map(u=><tr key={u.email}><td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedEmails.includes(u.email)} onChange={()=>toggleSelectUser(u.email)}/></td><td className="px-4 py-3">{u.alias||u.name}<br/><span className="text-xs text-gray-500">{u.email}</span></td><td className="px-4 py-3">🪙 {u.tokens}<button onClick={()=>handleAddTokens(u.email,u.tokens)} className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded">조정</button></td><td className="px-4 py-3"><button onClick={()=>handleSetAlias(u.email,u.alias)} className="text-xs border px-2 py-1 rounded">닉네임</button></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {/* --- 커리큘럼 탭 (단어/문장/회화) --- */}
      {["word", "sentence", "dialogue"].includes(activeTab) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="space-y-6">
             <div className="bg-white p-6 rounded-lg shadow border">
               <h3 className="font-bold mb-4">{editingId ? "✏️ 수정" : "➕ 등록"}</h3>
               <form onSubmit={(e)=>handleSave(e, activeTab)} className="space-y-3">
                 <input placeholder="Category" className="w-full border p-2 rounded" value={activeTab==="word"?newWord.category:activeTab==="sentence"?newSentence.category:newDialogue.category} onChange={e=>activeTab==="word"?setNewWord({...newWord,category:e.target.value}):activeTab==="sentence"?setNewSentence({...newSentence,category:e.target.value}):setNewDialogue({...newDialogue,category:e.target.value})} />
                 {activeTab==="word" && <><input placeholder="Text" className="w-full border p-2 rounded" value={newWord.text} onChange={e=>setNewWord({...newWord,text:e.target.value})}/><input placeholder="Pronunciation" className="w-full border p-2 rounded" value={newWord.pronunciation} onChange={e=>setNewWord({...newWord,pronunciation:e.target.value})}/><input placeholder="Tip" className="w-full border p-2 rounded" value={newWord.tip} onChange={e=>setNewWord({...newWord,tip:e.target.value})}/></>}
                 {activeTab==="sentence" && <><input placeholder="Text" className="w-full border p-2 rounded" value={newSentence.text} onChange={e=>setNewSentence({...newSentence,text:e.target.value})}/><input placeholder="Pronunciation" className="w-full border p-2 rounded" value={newSentence.pronunciation} onChange={e=>setNewSentence({...newSentence,pronunciation:e.target.value})}/><input placeholder="Translation" className="w-full border p-2 rounded" value={newSentence.translation} onChange={e=>setNewSentence({...newSentence,translation:e.target.value})}/></>}
                 {activeTab==="dialogue" && <><input placeholder="Title" className="w-full border p-2 rounded" value={newDialogue.title} onChange={e=>setNewDialogue({...newDialogue,title:e.target.value})}/><textarea placeholder="Script (A:..|B:..)" className="w-full border p-2 rounded" rows={3} value={newDialogue.script} onChange={e=>setNewDialogue({...newDialogue,script:e.target.value})}/><input placeholder="Translation" className="w-full border p-2 rounded" value={newDialogue.translation} onChange={e=>setNewDialogue({...newDialogue,translation:e.target.value})}/></>}
                 <div className="flex gap-2"><button className="w-full bg-blue-600 text-white py-2 rounded font-bold">{editingId?"수정":"등록"}</button>{editingId&&<button type="button" onClick={cancelEdit} className="w-1/3 bg-gray-200">취소</button>}</div>
               </form>
             </div>
             
             <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 shadow-sm">
                <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2">🎙️ 보이스 설정</h3>
                <div className="space-y-3">
                  {(activeTab === "word" || activeTab === "sentence") && (
                     <select value={castSingle} onChange={e => setCastSingle(e.target.value)} className="w-full p-2 rounded border bg-white text-sm">
                        {VOICE_OPTIONS.map((v, i) => <option key={i} value={v.value} disabled={v.disabled}>{v.label}</option>)}
                     </select>
                  )}
                  {activeTab === "dialogue" && (
                    <>
                      <div><label className="text-xs font-bold text-gray-500">A 역할</label><select value={castA} onChange={e => setCastA(e.target.value)} className="w-full p-2 rounded border bg-white text-sm">{VOICE_OPTIONS.map((v, i) => <option key={i} value={v.value} disabled={v.disabled}>{v.label}</option>)}</select></div>
                      <div><label className="text-xs font-bold text-gray-500">B 역할</label><select value={castB} onChange={e => setCastB(e.target.value)} className="w-full p-2 rounded border bg-white text-sm">{VOICE_OPTIONS.map((v, i) => <option key={i} value={v.value} disabled={v.disabled}>{v.label}</option>)}</select></div>
                    </>
                  )}
                </div>
             </div>

             <div className={`p-6 rounded-lg shadow border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[150px] ${isDragging ? 'bg-blue-50 border-blue-500' : 'bg-gray-50 border-gray-300'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
               <input type="file" accept=".csv" ref={fileInputRef} hidden onChange={(e) => e.target.files && processFile(e.target.files[0])} />
               {uploadStatus === "ready" ? (
                 <div className="w-full">
                    <p className="font-bold text-gray-800 mb-2">{csvPreview.length}개 대기</p>
                    <div className="flex gap-2"><button onClick={(e) => { e.stopPropagation(); executeBatchUpload(); }} className="flex-1 bg-blue-600 text-white py-1 rounded font-bold text-sm">업로드</button><button onClick={(e) => { e.stopPropagation(); setCsvPreview([]); setUploadStatus(""); }} className="px-3 bg-gray-300 text-gray-700 rounded font-bold text-sm">취소</button></div>
                 </div>
               ) : (<><div className="text-3xl text-gray-300 mb-1">📂</div><p className="font-bold text-gray-500 text-sm">CSV 업로드</p></>)}
             </div>
           </div>
           
           <div className="md:col-span-2 bg-white p-6 rounded shadow border overflow-y-auto max-h-[600px]">
             {(activeTab==="word"?problems:activeTab==="sentence"?sentences:dialogues).map((item:any)=>(
               <div key={item.id} className="flex justify-between items-center p-3 border-b hover:bg-gray-50">
                 <div className="flex-1 overflow-hidden"><span className="text-xs font-bold bg-gray-100 px-2 py-0.5 rounded mr-2 align-middle">{item.category}</span><span className="font-bold align-middle truncate">{item.text||item.title}</span></div>
                 <div className="flex gap-2 items-center shrink-0 ml-2">
                    {item.has_audio && <button onClick={() => playAudio(item.audio_path || item.audio_paths[0])} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold">▶️</button>}
                    <button onClick={() => activeTab === "dialogue" ? handleGenerateDialogueTTS(item) : handleGenerateSingleTTS(item, activeTab as any)} disabled={generatingId === item.id} className="text-xs border px-2 py-1 rounded font-bold bg-gray-50">{generatingId === item.id ? "⏳" : "🔊 생성"}</button>
                    <button onClick={()=>startEdit(item,activeTab)} className="text-blue-600 text-xs border px-2 py-1 rounded">수정</button>
                    <button onClick={()=>handleDelete(item.id,activeTab)} className="text-red-500 text-xs border px-2 py-1 rounded">삭제</button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* --- 상점 탭 --- */}
      {activeTab === "store" && (
        <div className="grid md:grid-cols-2 gap-8">
          {/* 섹션 1: 충전 요청 관리 */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 md:col-span-2">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 border-b pb-4">
                <DollarSign className="text-green-600"/> 충전 요청 관리 
                <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-black">{requests.length}건</span>
              </h2>
              {requests.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">
                  <RefreshCw className="mx-auto mb-2 opacity-50"/> 대기 중인 요청이 없습니다.
                </div>
              ) : (
                <div className="grid gap-4">
                  {requests.map((req) => (
                    <div key={req.id} className="border border-slate-200 p-5 rounded-xl flex flex-col sm:flex-row justify-between items-center bg-white hover:border-blue-300 transition shadow-sm">
                        <div className="mb-4 sm:mb-0 w-full sm:w-auto">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-black text-lg text-slate-800">{req.depositor}</span>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{req.userAlias}</span>
                            </div>
                            <div className="text-xs text-slate-400 mb-2 font-mono">{req.userId}</div>
                            <div className="flex gap-2">
                                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">💎 {req.amount} 토큰</span>
                                <span className="text-sm font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{req.price}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => handleReject(req)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-bold text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-transparent transition flex items-center justify-center gap-1"><XCircle size={18}/> 거절</button>
                            <button onClick={() => handleApprove(req)} className="flex-1 sm:flex-none px-5 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition flex items-center justify-center gap-1"><CheckCircle size={18}/> 승인</button>
                        </div>
                    </div>
                  ))}
                </div>
              )}
          </section>

          {/* 섹션 2: 오디오 파일 업로드 */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800"><Music className="text-purple-600"/> 듣기 파일 업로드</h2>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
               <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files ? e.target.files[0] : null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer mb-4" />
               <button onClick={handleFileUpload} disabled={uploadingFile} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2 mb-4">
                 {uploadingFile ? <RefreshCw className="animate-spin"/> : <Upload size={20}/>} {uploadingFile ? "업로드 중..." : "서버에 업로드"}
               </button>
               {uploadedUrl && (
                 <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-left animate-in fade-in">
                    <p className="text-xs font-bold text-green-700 mb-1 flex items-center gap-1"><CheckCircle size={12}/> 업로드 완료!</p>
                    <p className="text-[10px] text-slate-500 break-all mb-2">{uploadedFileName}</p>
                    <button onClick={() => { navigator.clipboard.writeText(uploadedUrl); alert("URL 복사됨"); }} className="w-full py-1.5 bg-white border border-green-300 text-green-700 text-xs font-bold rounded hover:bg-green-100">🔗 URL 복사하기</button>
                 </div>
               )}
            </div>
            <p className="text-xs text-slate-400 mt-3 ml-1">* 업로드 후 URL을 복사해 문제 출제 시 사용하세요.</p>
          </section>

          {/* 섹션 3: 토큰 수동 조절 */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800"><AlertCircle className="text-orange-500"/> 토큰 강제 조절</h2>
             <div className="space-y-3">
                <div><label className="text-xs font-bold text-slate-500 ml-1">대상 이메일</label><input type="email" placeholder="user@example.com" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 mt-1"/></div>
                <div><label className="text-xs font-bold text-slate-500 ml-1">조절 수량 (+/-)</label><input type="number" placeholder="0" value={manualAmount} onChange={(e) => setManualAmount(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 mt-1"/></div>
                <button onClick={handleManualTokenUpdate} disabled={loadingToken} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-black disabled:opacity-50 mt-2 transition">{loadingToken ? "처리 중..." : "적용하기"}</button>
             </div>
          </section>
        </div>
      )}
    </main>
  );
}