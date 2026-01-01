"use client";

import { useEffect, useState, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch, where 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "word" | "sentence" | "dialogue" | "mail">("users");

  const [users, setUsers] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [dialogues, setDialogues] = useState<any[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  
  // 쪽지 상태
  const [mailContent, setMailContent] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);

  // 입력 폼
  const [newWord, setNewWord] = useState({ category: "비음화", text: "", pronunciation: "", tip: "" });
  const [newSentence, setNewSentence] = useState({ category: "인사", text: "", pronunciation: "", translation: "" });
  const [newDialogue, setNewDialogue] = useState({ category: "식당", title: "", script: "", translation: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email === "ot.helper7@gmail.com") { // ⚠️ 본인 이메일 확인
        setIsAdmin(true);
        await fetchAllData();
      } else {
        alert("관리자 권한이 없습니다."); window.location.href = "/";
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
    // 🔥 [수정됨] 정렬 기준: category(상황/장소) 우선 정렬
    const q = query(collection(db, col), orderBy("category", "asc"));
    const s = await getDocs(q);
    setFunc(s.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // --- 체크박스 & 쪽지 ---
  const toggleSelectUser = (email: string) => {
    setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedEmails([]);
    else setSelectedEmails(users.map(u => u.email));
    setIsAllSelected(!isAllSelected);
  };
  const sendMail = async () => {
    if (!mailContent.trim()) return alert("내용 입력 필수");
    if (selectedEmails.length === 0) return alert("대상 선택 필수");
    if (!confirm(`${selectedEmails.length}명에게 전송?`)) return;
    try {
      const batch = writeBatch(db);
      const msg = { from: "관리자", content: mailContent, date: serverTimestamp(), read: false };
      selectedEmails.forEach(e => batch.set(doc(collection(db, "sori_users", e, "inbox")), msg));
      await batch.commit(); alert("전송 완료"); setMailContent(""); setSelectedEmails([]); setIsAllSelected(false); setActiveTab("users");
    } catch (e) { alert("전송 실패"); }
  };

  // --- 토큰 자유 충전 ---
  const handleAddTokens = async (email: string, cur: number) => {
    const amtStr = prompt("충전할 개수 (차감은 -숫자)", "100");
    if (!amtStr) return;
    const amt = parseInt(amtStr);
    if (isNaN(amt)) return alert("숫자만 입력");
    if (!confirm(`${amt}개 처리할까요?`)) return;
    await updateDoc(doc(db, "sori_users", email), { tokens: (cur||0)+amt, role: 'student' });
    alert("완료"); fetchUsers();
  };

  // --- 데이터 저장 (중복 체크) ---
  const handleSave = async (e: any, type: any) => {
    e.preventDefault();
    const col = `sori_curriculum_${type}`;
    const data = type==="word"?newWord : type==="sentence"?newSentence : newDialogue;
    if (!data.category) return alert("카테고리 필수");

    // 중복 체크
    const list = type==="word"?problems : type==="sentence"?sentences : dialogues;
    const key = type==="dialogue" ? "title" : "text";
    if (!editingId && list.some((item: any) => item[key] === (data as any)[key])) return alert("⚠️ 이미 등록된 문제입니다.");

    if(editingId) await updateDoc(doc(db, col, editingId), { ...data, updated_at: serverTimestamp() });
    else await addDoc(collection(db, col), { ...data, created_at: serverTimestamp() });
    
    cancelEdit(); fetchData(col, type==="word"?setProblems : type==="sentence"?setSentences : setDialogues);
    alert("저장 완료");
  };

  // --- 헬퍼 ---
  const startEdit = (item: any, type: any) => { setEditingId(item.id); setActiveTab(type); window.scrollTo({top:0, behavior:"smooth"}); if(type==="word") setNewWord({...item}); else if(type==="sentence") setNewSentence({...item}); else setNewDialogue({...item}); };
  const cancelEdit = () => { setEditingId(null); setNewWord({category:"비음화", text:"", pronunciation:"", tip:""}); setNewSentence({category:"인사", text:"", pronunciation:"", translation:""}); setNewDialogue({category:"식당", title:"", script:"", translation:""}); };
  const handleDelete = async (id: string, type: any) => { if(!confirm("삭제?")) return; await deleteDoc(doc(db, `sori_curriculum_${type}`, id)); fetchData(`sori_curriculum_${type}`, type==="word"?setProblems:type==="sentence"?setSentences:setDialogues); };
  const handleSetAlias = async (email: string, cur: string) => { const n = prompt("새 닉네임", cur); if(n) { await updateDoc(doc(db, "sori_users", email), { alias: n }); fetchUsers(); } };
  const handleCSVUpload = (e: any, type: any) => { 
    const f = e.target.files[0]; if(!f) return; const r = new FileReader();
    r.onload = async (ev: any) => {
       const rows = ev.target.result.split("\n").slice(1); const batch = writeBatch(db);
       rows.forEach((row: string) => { const c = row.split(","); if(c.length>=3) {
         let d:any = {}; if(type==="word") d={category:c[0],text:c[1],pronunciation:c[2],tip:c[3]||""}; else if(type==="sentence") d={category:c[0],text:c[1],pronunciation:c[2],translation:c[3]||""}; else d={category:c[0],title:c[1],script:c[2],translation:c[3]||""};
         batch.set(doc(collection(db, `sori_curriculum_${type}`)), {...d, created_at: serverTimestamp()});
       }}); await batch.commit(); alert("업로드 완료"); fetchAllData();
    }; r.readAsText(f);
  };

  if (loading) return <div>로딩 중...</div>;
  if (!isAdmin) return null;

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">👮‍♀️ Admin Dashboard</h1>
        
        <div className="flex space-x-1 bg-white p-1 rounded-lg border overflow-x-auto">
          {["users", "word", "sentence", "dialogue"].map(t => (
            <button key={t} onClick={() => {setActiveTab(t as any); cancelEdit();}} className={`px-3 py-2 rounded font-bold capitalize ${activeTab===t?"bg-blue-600 text-white":"text-gray-600"}`}>
              {t} ({t==="users"?users.length:t==="word"?problems.length:t==="sentence"?sentences.length:dialogues.length})
            </button>
          ))}
          <button onClick={() => setActiveTab("mail")} className={`px-3 py-2 rounded font-bold flex gap-1 ${activeTab==="mail"?"bg-green-600 text-white":"text-green-600"}`}>
            💌 쪽지 {selectedEmails.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{selectedEmails.length}</span>}
          </button>
        </div>
      </div>

      {activeTab === "mail" && (
        <div className="bg-green-50 p-6 rounded-lg shadow border border-green-200 mb-6">
           <h3 className="font-bold text-green-900 mb-2">📩 쪽지 발송 ({selectedEmails.length > 0 ? `${selectedEmails.length}명` : "대상 미선택"})</h3>
           <textarea className="w-full h-32 p-3 border rounded mb-3" placeholder="내용..." value={mailContent} onChange={e => setMailContent(e.target.value)}></textarea>
           <div className="flex gap-2"><button onClick={sendMail} className="flex-1 bg-green-600 text-white py-3 rounded font-bold">전송</button><button onClick={() => setActiveTab("users")} className="px-6 bg-gray-300 rounded font-bold">취소</button></div>
        </div>
      )}
      
      {activeTab === "users" && (
        <div className="bg-white shadow rounded-lg overflow-x-auto border">
          <div className="p-4 border-b flex justify-between bg-gray-50"><span className="font-bold text-sm text-gray-600">총 {users.length}명</span><div className="flex gap-2"><button onClick={toggleSelectAll} className="text-xs border px-2 py-1 bg-white rounded">전체선택</button>{selectedEmails.length > 0 && <button onClick={() => setActiveTab("mail")} className="bg-green-600 text-white px-3 py-1 rounded font-bold text-xs animate-pulse">쪽지 보내기</button>}</div></div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100"><tr><th className="px-4 py-3 text-center"><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></th><th className="px-4 py-3 text-left text-xs font-bold text-gray-600">유저</th><th className="px-4 py-3 text-left text-xs font-bold text-gray-600">학습</th><th className="px-4 py-3 text-left text-xs font-bold text-gray-600">토큰</th><th className="px-4 py-3 text-left text-xs font-bold text-gray-600">관리</th></tr></thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.email} className={selectedEmails.includes(u.email) ? "bg-blue-50" : ""}>
                  <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedEmails.includes(u.email)} onChange={() => toggleSelectUser(u.email)} /></td>
                  <td className="px-4 py-4"><div className="font-bold">{u.alias||u.name}</div><div className="text-xs text-gray-500">{u.email}</div></td>
                  <td className="px-4 py-4"><div className="font-bold text-orange-600">🔥 {u.streak||0}일</div><div className="text-xs">{u.today_count||0}/5회</div></td>
                  <td className="px-4 py-4"><span className="font-bold text-yellow-600 mr-2">🪙 {u.tokens||0}</span><button onClick={()=>handleAddTokens(u.email, u.tokens)} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">충전</button></td>
                  <td className="px-4 py-4"><button onClick={()=>handleSetAlias(u.email,u.alias)} className="text-xs border px-2 py-1 rounded">닉네임</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {["word", "sentence", "dialogue"].includes(activeTab) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="space-y-6">
             <div className="bg-white p-6 rounded-lg shadow border">
               <h3 className="font-bold mb-4">{editingId ? "✏️ 수정" : "➕ 등록"}</h3>
               <form onSubmit={(e)=>handleSave(e, activeTab)} className="space-y-3">
                 <input placeholder="Category (상황/장소)" className="w-full border p-2 rounded" value={activeTab==="word"?newWord.category:activeTab==="sentence"?newSentence.category:newDialogue.category} onChange={e=>activeTab==="word"?setNewWord({...newWord,category:e.target.value}):activeTab==="sentence"?setNewSentence({...newSentence,category:e.target.value}):setNewDialogue({...newDialogue,category:e.target.value})} />
                 {activeTab==="word" && <><input placeholder="Text" className="w-full border p-2 rounded" value={newWord.text} onChange={e=>setNewWord({...newWord,text:e.target.value})}/><input placeholder="Pronunciation" className="w-full border p-2 rounded" value={newWord.pronunciation} onChange={e=>setNewWord({...newWord,pronunciation:e.target.value})}/><input placeholder="Tip" className="w-full border p-2 rounded" value={newWord.tip} onChange={e=>setNewWord({...newWord,tip:e.target.value})}/></>}
                 {activeTab==="sentence" && <><input placeholder="Text" className="w-full border p-2 rounded" value={newSentence.text} onChange={e=>setNewSentence({...newSentence,text:e.target.value})}/><input placeholder="Pronunciation" className="w-full border p-2 rounded" value={newSentence.pronunciation} onChange={e=>setNewSentence({...newSentence,pronunciation:e.target.value})}/><input placeholder="Translation" className="w-full border p-2 rounded" value={newSentence.translation} onChange={e=>setNewSentence({...newSentence,translation:e.target.value})}/></>}
                 {activeTab==="dialogue" && <><input placeholder="Title" className="w-full border p-2 rounded" value={newDialogue.title} onChange={e=>setNewDialogue({...newDialogue,title:e.target.value})}/><textarea placeholder="Script" className="w-full border p-2 rounded" rows={3} value={newDialogue.script} onChange={e=>setNewDialogue({...newDialogue,script:e.target.value})}/><input placeholder="Translation" className="w-full border p-2 rounded" value={newDialogue.translation} onChange={e=>setNewDialogue({...newDialogue,translation:e.target.value})}/></>}
                 <div className="flex gap-2"><button className="w-full bg-blue-600 text-white py-2 rounded font-bold">{editingId?"수정":"등록"}</button>{editingId&&<button type="button" onClick={cancelEdit} className="w-1/3 bg-gray-200">취소</button>}</div>
               </form>
             </div>
             <div className="bg-green-50 p-6 rounded shadow border border-green-200"><h3 className="font-bold text-green-800 mb-2">📂 CSV 업로드</h3><input type="file" accept=".csv" ref={fileInputRef} onChange={(e)=>handleCSVUpload(e, activeTab)} className="w-full text-sm"/></div>
           </div>
           <div className="md:col-span-2 bg-white p-6 rounded shadow border overflow-y-auto max-h-[600px]">
             {(activeTab==="word"?problems:activeTab==="sentence"?sentences:dialogues).map((item:any)=>(
               <div key={item.id} className="flex justify-between p-3 border-b hover:bg-gray-50"><div className="flex-1"><span className="text-xs font-bold bg-gray-100 px-2 rounded mr-2">{item.category}</span><span className="font-bold">{item.text||item.title}</span></div><div className="flex gap-2"><button onClick={()=>startEdit(item,activeTab)} className="text-blue-600 text-xs border px-2 rounded">수정</button><button onClick={()=>handleDelete(item.id,activeTab)} className="text-red-500 text-xs border px-2 rounded">삭제</button></div></div>
             ))}
           </div>
        </div>
      )}
    </main>
  );
}