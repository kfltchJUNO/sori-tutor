"use client";

import { useEffect, useState, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "word" | "sentence" | "dialogue" | "mail">("users");

  // 데이터 상태
  const [users, setUsers] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [dialogues, setDialogues] = useState<any[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  
  // 쪽지 상태
  const [mailContent, setMailContent] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);

  // 📂 CSV 업로드 관련 상태 (New)
  const [isDragging, setIsDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]); // 업로드 대기중인 데이터
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null); // 중복 개수
  const [uploadStatus, setUploadStatus] = useState<string>(""); // 상태 메시지

  // 입력 폼
  const [newWord, setNewWord] = useState({ category: "비음화", text: "", pronunciation: "", tip: "" });
  const [newSentence, setNewSentence] = useState({ category: "인사", text: "", pronunciation: "", translation: "" });
  const [newDialogue, setNewDialogue] = useState({ category: "식당", title: "", script: "", translation: "" });
  
  // 파일 인풋 참조 (클릭으로도 열기 위해 유지하되 UI는 숨김)
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email === "ot.helper7@gmail.com") { 
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
    const q = query(collection(db, col), orderBy("category", "asc"));
    const s = await getDocs(q);
    setFunc(s.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // --- 📂 드래그 앤 드롭 & 파일 분석 로직 ---
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => {
      const rows = ev.target.result.split("\n").slice(1); // 헤더 제거
      const parsedData: any[] = [];
      
      rows.forEach((row: string) => {
        const c = row.split(","); // ⚠️ 쉼표 파싱 주의 (간단 버전)
        if (c.length >= 3) {
          let d: any = {};
          if (activeTab === "word") d = { category: c[0], text: c[1], pronunciation: c[2], tip: c[3] || "" };
          else if (activeTab === "sentence") d = { category: c[0], text: c[1], pronunciation: c[2], translation: c[3] || "" };
          else d = { category: c[0], title: c[1], script: c[2], translation: c[3] || "" };
          
          if (d.category && (d.text || d.title)) { // 유효한 데이터만
             parsedData.push(d);
          }
        }
      });

      // 중복 검사 로직
      const currentList = activeTab === "word" ? problems : activeTab === "sentence" ? sentences : dialogues;
      const key = activeTab === "dialogue" ? "title" : "text";
      
      // 현재 DB에 있는 것과 겹치는 개수 세기
      const dups = parsedData.filter(newItem => 
        currentList.some((existItem: any) => existItem[key] === newItem[key])
      ).length;

      setCsvPreview(parsedData);
      setDuplicateCount(dups);
      setUploadStatus("ready");
    };
    reader.readAsText(file);
  };

  // --- 🚀 실제 업로드 실행 (최종 확인) ---
  const executeBatchUpload = async () => {
    if (csvPreview.length === 0) return alert("업로드할 데이터가 없습니다.");

    // 최종 컨펌 메시지
    const tabName = activeTab === "word" ? "단어" : activeTab === "sentence" ? "문장" : "담화";
    const msg = `'${tabName}' 문제 ${csvPreview.length}개를 업로드 하시겠습니까?\n(⚠️ 현재 카테고리를 꼭 확인해주세요!)`;
    
    if (!confirm(msg)) return;

    try {
      const batch = writeBatch(db);
      const col = `sori_curriculum_${activeTab}`;
      
      csvPreview.forEach(item => {
        const ref = doc(collection(db, col));
        batch.set(ref, { ...item, created_at: serverTimestamp() });
      });

      await batch.commit();
      alert(`✅ 성공적으로 ${csvPreview.length}개가 업로드되었습니다!`);
      
      // 초기화 및 데이터 갱신
      setCsvPreview([]);
      setDuplicateCount(null);
      setUploadStatus("");
      fetchAllData();
      
    } catch (e) {
      alert("업로드 중 오류가 발생했습니다.");
      console.error(e);
    }
  };


  // --- 기존 기능들 (체크박스, 쪽지, 토큰 등) ---
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
  const handleAddTokens = async (email: string, cur: number) => {
    const amtStr = prompt("충전할 개수 (차감은 -숫자)", "100");
    if (!amtStr) return;
    const amt = parseInt(amtStr);
    if (isNaN(amt)) return alert("숫자만 입력");
    if (!confirm(`${amt}개 처리할까요?`)) return;
    await updateDoc(doc(db, "sori_users", email), { tokens: (cur||0)+amt, role: 'student' });
    alert("완료"); fetchUsers();
  };
  const handleSave = async (e: any, type: any) => {
    e.preventDefault();
    const col = `sori_curriculum_${type}`;
    const data = type==="word"?newWord : type==="sentence"?newSentence : newDialogue;
    if (!data.category) return alert("카테고리 필수");
    const list = type==="word"?problems : type==="sentence"?sentences : dialogues;
    const key = type==="dialogue" ? "title" : "text";
    if (!editingId && list.some((item: any) => item[key] === (data as any)[key])) return alert("⚠️ 이미 등록된 문제입니다.");
    if(editingId) await updateDoc(doc(db, col, editingId), { ...data, updated_at: serverTimestamp() });
    else await addDoc(collection(db, col), { ...data, created_at: serverTimestamp() });
    cancelEdit(); fetchData(col, type==="word"?setProblems : type==="sentence"?setSentences : setDialogues);
    alert("저장 완료");
  };
  const startEdit = (item: any, type: any) => { setEditingId(item.id); setActiveTab(type); window.scrollTo({top:0, behavior:"smooth"}); if(type==="word") setNewWord({...item}); else if(type==="sentence") setNewSentence({...item}); else setNewDialogue({...item}); };
  const cancelEdit = () => { setEditingId(null); setNewWord({category:"비음화", text:"", pronunciation:"", tip:""}); setNewSentence({category:"인사", text:"", pronunciation:"", translation:""}); setNewDialogue({category:"식당", title:"", script:"", translation:""}); };
  const handleDelete = async (id: string, type: any) => { if(!confirm("삭제?")) return; await deleteDoc(doc(db, `sori_curriculum_${type}`, id)); fetchData(`sori_curriculum_${type}`, type==="word"?setProblems:type==="sentence"?setSentences:setDialogues); };
  const handleSetAlias = async (email: string, cur: string) => { const n = prompt("새 닉네임", cur); if(n) { await updateDoc(doc(db, "sori_users", email), { alias: n }); fetchUsers(); } };

  if (loading) return <div>로딩 중...</div>;
  if (!isAdmin) return null;

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">👮‍♀️ Admin Dashboard</h1>
        
        <div className="flex space-x-1 bg-white p-1 rounded-lg border overflow-x-auto">
          {["users", "word", "sentence", "dialogue"].map(t => (
            <button key={t} onClick={() => {setActiveTab(t as any); cancelEdit(); setCsvPreview([]); setDuplicateCount(null);}} className={`px-3 py-2 rounded font-bold capitalize ${activeTab===t?"bg-blue-600 text-white":"text-gray-600"}`}>
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
             
             {/* 📂 CSV 업로드 구역 (드래그앤드롭 + 중복체크 강화) */}
             <div 
               className={`p-6 rounded-lg shadow border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px] ${isDragging ? 'bg-blue-50 border-blue-500' : 'bg-gray-50 border-gray-300 hover:border-blue-400'}`}
               onDragOver={handleDragOver}
               onDragLeave={handleDragLeave}
               onDrop={handleDrop}
               // 클릭해서 올리는 기능도 비상용으로 유지 (원하면 제거 가능)
               onClick={() => fileInputRef.current?.click()}
             >
               <input type="file" accept=".csv" ref={fileInputRef} hidden onChange={(e) => e.target.files && processFile(e.target.files[0])} />
               
               {uploadStatus === "ready" ? (
                 <div className="animate-fade-in-up w-full">
                    <div className="text-3xl mb-2">📄</div>
                    <p className="font-bold text-gray-800 text-lg mb-1">{csvPreview.length}개 항목 대기 중</p>
                    {duplicateCount !== null && duplicateCount > 0 ? (
                      <p className="text-red-500 font-bold mb-4 bg-red-50 py-1 rounded">⚠️ 중복 컨텐츠가 {duplicateCount}개 있습니다.</p>
                    ) : (
                      <p className="text-green-600 font-bold mb-4 text-sm">✅ 중복 컨텐츠가 없습니다.</p>
                    )}
                    
                    <div className="flex gap-2">
                       <button onClick={(e) => { e.stopPropagation(); executeBatchUpload(); }} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 shadow-md">
                         업로드 확정 🚀
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); setCsvPreview([]); setUploadStatus(""); }} className="px-4 bg-gray-300 text-gray-700 rounded font-bold hover:bg-gray-400">
                         취소
                       </button>
                    </div>
                 </div>
               ) : (
                 <>
                   <div className="text-4xl text-gray-300 mb-2">📂</div>
                   <p className="font-bold text-gray-500">여기에 CSV 파일을<br/>드래그해서 놓으세요</p>
                   <p className="text-xs text-gray-400 mt-2">(또는 클릭해서 선택)</p>
                 </>
               )}
             </div>
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