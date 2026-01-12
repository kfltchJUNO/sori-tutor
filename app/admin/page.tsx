"use client";

import { useEffect, useState, useRef } from "react";
import { db, auth, storage } from "@/lib/firebase"; 
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch, onSnapshot, runTransaction, increment, where
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage"; 
import { 
  Mic, Upload, RefreshCw, CheckCircle, XCircle, Music, AlertCircle, DollarSign, MessageCircle, Send
} from 'lucide-react';

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
  // 🔥 'inquiry' 탭 추가
  const [activeTab, setActiveTab] = useState<"users" | "word" | "sentence" | "dialogue" | "mail" | "store" | "inquiry">("inquiry");

  const [users, setUsers] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [dialogues, setDialogues] = useState<any[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [castA, setCastA] = useState("ko-KR-Chirp3-HD-Kore");
  const [castB, setCastB] = useState("ko-KR-Chirp3-HD-Puck"); 
  const [castSingle, setCastSingle] = useState("ko-KR-Chirp3-HD-Kore");

  const [mailContent, setMailContent] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  
  const [newWord, setNewWord] = useState({ category: "비음화", text: "", pronunciation: "", tip: "" });
  const [newSentence, setNewSentence] = useState({ category: "인사", text: "", pronunciation: "", translation: "" });
  const [newDialogue, setNewDialogue] = useState({ category: "식당", title: "", script: "", translation: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [requests, setRequests] = useState<any[]>([]);
  // 🔥 문의 내역 상태 추가
  const [inquiries, setInquiries] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

  // 충전 요청 리스너
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "sori_charge_requests"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, [isAdmin]);

  // 🔥 문의 내역 리스너 (실시간)
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "sori_inquiries"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (s) => setInquiries(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, [isAdmin]);

  const fetchAllData = async () => {
    await fetchUsers();
    await fetchData("sori_curriculum_word", setProblems);
    await fetchData("sori_curriculum_sentence", setSentences);
    await fetchData("sori_curriculum_dialogue", setDialogues);
  };
  const fetchUsers = async () => { const s = await getDocs(query(collection(db, "sori_users"), orderBy("joined_at", "desc"))); setUsers(s.docs.map(d => ({ email: d.id, ...d.data() }))); };
  const fetchData = async (col: string, setFunc: Function) => { const s = await getDocs(query(collection(db, col), orderBy("category", "asc"))); setFunc(s.docs.map(d => ({ id: d.id, ...d.data() }))); };

  // TTS 생성 (단어/문장)
  const handleGenerateSingleTTS = async (item: any, type: "word" | "sentence") => {
    if (!item.text) return alert("텍스트가 없습니다.");
    let textToSpeak = item.text;
    if (type === "word" && item.pronunciation) { textToSpeak = item.pronunciation.replace(/[\[\]]/g, ""); }
    if (!confirm(`'${item.text}' 생성?\n(읽는 내용: "${textToSpeak}")`)) return;
    setGeneratingId(item.id);
    try {
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
    } catch (e: any) { alert("실패: " + e.message); } finally { setGeneratingId(null); }
  };

  // TTS 생성 (담화)
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
        if (data.error) throw new Error(data.error);
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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) { processFile(e.dataTransfer.files[0]); } };
  const processFile = (file: File) => { const reader = new FileReader(); reader.onload = (ev: any) => { const rows = ev.target.result.split("\n").slice(1); const parsedData: any[] = []; rows.forEach((row: string) => { const c = row.split(","); if (c.length >= 3) { let d: any = {}; if (activeTab === "word") d = { category: c[0], text: c[1], pronunciation: c[2], tip: c[3] || "" }; else if (activeTab === "sentence") d = { category: c[0], text: c[1], pronunciation: c[2], translation: c[3] || "" }; else d = { category: c[0], title: c[1], script: c[2], translation: c[3] || "" }; if (d.category && (d.text || d.title)) { parsedData.push(d); } } }); const currentList = activeTab === "word" ? problems : activeTab === "sentence" ? sentences : dialogues; const key = activeTab === "dialogue" ? "title" : "text"; const dups = parsedData.filter(newItem => currentList.some((existItem: any) => existItem[key] === newItem[key]) ).length; setCsvPreview(parsedData); setDuplicateCount(dups); setUploadStatus("ready"); }; reader.readAsText(file); };
  const executeBatchUpload = async () => { if (csvPreview.length === 0) return alert("데이터 없음"); if (!confirm(`${csvPreview.length}개 업로드?`)) return; try { const batch = writeBatch(db); const col = `sori_curriculum_${activeTab}`; csvPreview.forEach(item => { const ref = doc(collection(db, col)); batch.set(ref, { ...item, created_at: serverTimestamp() }); }); await batch.commit(); alert(`완료!`); setCsvPreview([]); setUploadStatus(""); fetchAllData(); } catch (e) { alert("오류"); } };
  const toggleSelectUser = (email: string) => { setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]); };
  const toggleSelectAll = () => { if (isAllSelected) setSelectedEmails([]); else setSelectedEmails(users.map(u => u.email)); setIsAllSelected(!isAllSelected); };
  const sendMail = async () => { if (!mailContent.trim() || selectedEmails.length === 0) return alert("내용/대상 확인"); if (!confirm("전송?")) return; try { const batch = writeBatch(db); const msg = { from: "관리자", content: mailContent, date: serverTimestamp(), read: false }; selectedEmails.forEach(e => batch.set(doc(collection(db, "sori_users", e, "inbox")), msg)); await batch.commit(); alert("전송 완료"); setMailContent(""); setSelectedEmails([]); } catch (e) { alert("실패"); } };
  const handleAddTokens = async (email: string, cur: number) => { const input = prompt("조정할 토큰 수 (음수는 차감)", "0"); if (!input) return; const amt = parseInt(input); if (isNaN(amt)) return alert("숫자만 입력하세요"); if (!confirm(`${amt}개 처리?`)) return; await updateDoc(doc(db, "sori_users", email), { tokens: (cur||0) + amt }); fetchUsers(); };
  const handleSetAlias = async (email: string, cur: string) => { const n = prompt("새 닉네임", cur); if(n) { await updateDoc(doc(db, "sori_users", email), { alias: n }); fetchUsers(); } };
  const handleSave = async (e: any, type: any) => { e.preventDefault(); const col = `sori_curriculum_${type}`; const data = type==="word"?newWord : type==="sentence"?newSentence : newDialogue; if (!data.category) return alert("카테고리 필수"); const list = type==="word"?problems : type==="sentence"?sentences : dialogues; const key = type==="dialogue" ? "title" : "text"; if (!editingId && list.some((item: any) => item[key] === (data as any)[key])) return alert("이미 등록됨"); if(editingId) await updateDoc(doc(db, col, editingId), { ...data, updated_at: serverTimestamp() }); else await addDoc(collection(db, col), { ...data, created_at: serverTimestamp() }); cancelEdit(); fetchData(col, type==="word"?setProblems : type==="sentence"?setSentences : setDialogues); alert("저장 완료"); };
  const startEdit = (item: any, type: any) => { setEditingId(item.id); setActiveTab(type); window.scrollTo({top:0, behavior:"smooth"}); if(type==="word") setNewWord({...item}); else if(type==="sentence") setNewSentence({...item}); else setNewDialogue({...item}); };
  const cancelEdit = () => { setEditingId(null); setNewWord({category:"비음화", text:"", pronunciation:"", tip:""}); setNewSentence({category:"인사", text:"", pronunciation:"", translation:""}); setNewDialogue({category:"식당", title:"", script:"", translation:""}); };
  const handleApprove = async (req: any) => { if (!confirm(`승인?`)) return; try { await runTransaction(db, async (t) => { const uRef = doc(db, "sori_users", req.userId); const rRef = doc(db, "sori_charge_requests", req.id); const uSnap = await t.get(uRef); if (!uSnap.exists()) t.set(uRef, { email: req.userId, tokens: req.amount, role: 'student', createdAt: serverTimestamp() }); else t.update(uRef, { tokens: (uSnap.data().tokens||0) + req.amount }); t.update(rRef, { status: "approved", approvedAt: serverTimestamp() }); }); alert(`지급 완료`); } catch (e) { alert(`오류: ${e}`); } };
  const handleReject = async (req: any) => { const r = prompt(`사유`, "확인 불가"); if (r === null) return; try { await updateDoc(doc(db, "sori_charge_requests", req.id), { status: "rejected", rejectedReason: r, rejectedAt: serverTimestamp() }); alert("거절됨"); } catch (e) { alert("오류"); } };

  // 🔥 [신규] 문의 답변하기 기능
  const handleReplyInquiry = async (inquiry: any) => {
      const reply = prompt(`[${inquiry.userName}]님에게 보낼 답변을 입력하세요.`);
      if (!reply) return;

      if (!confirm("답변을 보내시겠습니까? (유저 우편함으로 전송됨)")) return;

      try {
          const batch = writeBatch(db);
          
          // 1. 문의 상태 업데이트 (답변 완료)
          batch.update(doc(db, "sori_inquiries", inquiry.id), {
              status: "resolved",
              adminReply: reply,
              repliedAt: serverTimestamp()
          });

          // 2. 유저 우편함에 답장 전송
          const userInboxRef = doc(collection(db, "sori_users", inquiry.userId, "inbox"));
          batch.set(userInboxRef, {
              from: "소리튜터 운영진",
              title: `RE: ${inquiry.content.substring(0, 10)}... 에 대한 답변입니다.`,
              content: `안녕하세요, ${inquiry.userName}님.\n보내주신 문의에 대해 답변드립니다.\n\n[문의 내용]\n${inquiry.content}\n\n[답변]\n${reply}\n\n감사합니다.`,
              date: serverTimestamp(),
              read: false
          });

          await batch.commit();
          alert("✅ 답변이 전송되었습니다.");
      } catch (e) {
          console.error(e);
          alert("전송 실패");
      }
  };

  if (loading) return <div>로딩 중...</div>;
  if (!isAdmin) return null;

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">👮‍♀️ Admin Dashboard</h1>
        <div className="flex space-x-1 bg-white p-1 rounded-lg border overflow-x-auto">
          {["inquiry", "users", "word", "sentence", "dialogue"].map(t => (
            <button key={t} onClick={() => {setActiveTab(t as any); setEditingId(null);}} className={`px-3 py-2 rounded font-bold capitalize whitespace-nowrap ${activeTab===t?"bg-blue-600 text-white":"text-gray-600"}`}>
              {t === "inquiry" ? "📞 문의" : t}
            </button>
          ))}
          <button onClick={() => setActiveTab("mail")} className={`px-3 py-2 rounded font-bold whitespace-nowrap ${activeTab==="mail"?"bg-green-600 text-white":"text-green-600"}`}>💌 전체쪽지</button>
          <button onClick={() => setActiveTab("store")} className={`px-3 py-2 rounded font-bold whitespace-nowrap ${activeTab==="store"?"bg-purple-600 text-white":"text-purple-600"}`}>🏪 상점(충전)</button>
        </div>
      </div>

      {/* 🔥 [신규] 문의 내역 탭 */}
      {activeTab === "inquiry" && (
          <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><MessageCircle/> 고객 문의 관리</h2>
              {inquiries.length === 0 ? <p className="text-gray-400 py-10 text-center">접수된 문의가 없습니다.</p> : (
                  <div className="grid gap-4">
                      {inquiries.map((inq) => (
                          <div key={inq.id} className={`bg-white p-5 rounded-xl border ${inq.status === 'resolved' ? 'border-green-200 bg-green-50/30' : 'border-red-200 shadow-sm'}`}>
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded mb-1 inline-block ${inq.status==='resolved'?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                                          {inq.status === 'resolved' ? '답변완료' : '대기중'}
                                      </span>
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded ml-2">{inq.category}</span>
                                      <h3 className="font-bold text-lg mt-1">{inq.userName} <span className="text-xs text-gray-400 font-normal">({inq.userId})</span></h3>
                                  </div>
                                  <div className="text-xs text-gray-400">{inq.createdAt?.toDate().toLocaleString()}</div>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg mb-3">{inq.content}</p>
                              {inq.adminReply && (
                                  <div className="text-xs text-green-700 bg-green-50 p-3 rounded-lg border border-green-100 mb-3">
                                      <strong>↳ 관리자 답변:</strong> {inq.adminReply}
                                  </div>
                              )}
                              {inq.status !== 'resolved' && (
                                  <button onClick={() => handleReplyInquiry(inq)} className="w-full py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-black flex items-center justify-center gap-2">
                                      <Send size={16}/> 답변 보내기
                                  </button>
                              )}
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {/* 전체 쪽지 발송 */}
      {activeTab === "mail" && (<div className="bg-green-50 p-6 rounded-lg shadow mb-6"><textarea className="w-full h-32 p-3 border rounded mb-3" placeholder="전체 유저에게 보낼 공지 내용..." value={mailContent} onChange={e => setMailContent(e.target.value)}></textarea><button onClick={sendMail} className="bg-green-600 text-white py-2 px-6 rounded font-bold">전체 전송</button></div>)}
      
      {/* 유저 관리 (토큰 조절 포함) */}
      {activeTab === "users" && (
        <div className="bg-white shadow rounded-lg overflow-x-auto border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100"><tr><th className="px-4 py-3"><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll}/></th><th className="px-4 py-3">유저</th><th className="px-4 py-3">토큰</th><th className="px-4 py-3">관리</th></tr></thead>
            <tbody>{users.map(u=><tr key={u.email}><td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedEmails.includes(u.email)} onChange={()=>toggleSelectUser(u.email)}/></td><td className="px-4 py-3">{u.alias||u.name}<br/><span className="text-xs text-gray-500">{u.email}</span></td><td className="px-4 py-3">🪙 {u.tokens}<button onClick={()=>handleAddTokens(u.email,u.tokens)} className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded hover:bg-blue-200 font-bold text-blue-700">조정</button></td><td className="px-4 py-3"><button onClick={()=>handleSetAlias(u.email,u.alias)} className="text-xs border px-2 py-1 rounded">닉네임</button></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {/* 커리큘럼 관리 (단어/문장/회화) */}
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
             {(activeTab==="word"?problems:activeTab==="sentence"?sentences:dialogues).map((item:any, index:number)=>(
               <div key={`${item.id}_${index}`} className="flex justify-between items-center p-3 border-b hover:bg-gray-50">
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

      {/* 상점(충전 요청 관리) 탭 - 불필요한 기능 제거됨 */}
      {activeTab === "store" && (
        <div className="grid gap-8">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 border-b pb-4"><DollarSign className="text-green-600"/> 충전 요청 관리 <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-black">{requests.length}건</span></h2>
              {requests.length === 0 ? (<div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">대기 요청 없음</div>) : (
                <div className="grid gap-4">{requests.map((req) => (<div key={req.id} className="border border-slate-200 p-5 rounded-xl flex flex-col sm:flex-row justify-between items-center bg-white hover:border-blue-300 transition shadow-sm"><div className="mb-4 sm:mb-0 w-full sm:w-auto"><div className="flex items-center gap-2 mb-1"><span className="font-black text-lg text-slate-800">{req.depositor}</span><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{req.userAlias}</span></div><div className="text-xs text-slate-400 mb-2 font-mono">{req.userId}</div><div className="flex gap-2"><span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">💎 {req.amount} 토큰</span><span className="text-sm font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{req.price}</span></div></div><div className="flex gap-2 w-full sm:w-auto"><button onClick={() => handleReject(req)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-bold text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-transparent transition flex items-center justify-center gap-1"><XCircle size={18}/> 거절</button><button onClick={() => handleApprove(req)} className="flex-1 sm:flex-none px-5 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition flex items-center justify-center gap-1"><CheckCircle size={18}/> 승인</button></div></div>))}</div>
              )}
          </section>
        </div>
      )}
    </main>
  );
}