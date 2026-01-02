"use client";

import { useEffect, useState, useRef } from "react";
import { db, auth, storage } from "@/lib/firebase"; // storage import 필수
import { 
  collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadString, getDownloadURL } from "firebase/storage"; // 스토리지 함수

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "word" | "sentence" | "dialogue" | "mail">("users");

  const [users, setUsers] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [dialogues, setDialogues] = useState<any[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  
  // TTS 생성 상태 관리
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // 쪽지 상태
  const [mailContent, setMailContent] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);

  // CSV 업로드 상태
  const [isDragging, setIsDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // 입력 폼
  const [newWord, setNewWord] = useState({ category: "비음화", text: "", pronunciation: "", tip: "" });
  const [newSentence, setNewSentence] = useState({ category: "인사", text: "", pronunciation: "", translation: "" });
  const [newDialogue, setNewDialogue] = useState({ category: "식당", title: "", script: "", translation: "" });
  
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

  // --- 🔥 [New] 담화 음성 생성 로직 ---
  const handleGenerateTTS = async (dialogue: any) => {
    if (!dialogue.script) return alert("스크립트가 없습니다.");
    if (!confirm(`'${dialogue.title}'의 음성을 생성하시겠습니까?\n(기존 음성이 있다면 덮어씌워집니다)`)) return;

    setGeneratingId(dialogue.id);
    try {
      // 1. 스크립트 파싱 (A: ... | B: ...)
      const lines = dialogue.script.split("|").map((line: string) => {
        const [role, text] = line.split(":");
        return { role: role?.trim(), text: text?.trim() };
      });

      const audioUrls = [];

      // 2. 각 줄마다 TTS 생성 및 업로드
      for (let i = 0; i < lines.length; i++) {
        const { role, text } = lines[i];
        if (!text) {
          audioUrls.push(""); 
          continue;
        }

        // 2-1. API 호출 (음성 데이터 받기)
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, role }),
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        // 2-2. Firebase Storage에 업로드 (mp3 파일)
        const storageRef = ref(storage, `dialogues/${dialogue.id}/${i}.mp3`);
        await uploadString(storageRef, data.audioContent, 'base64', { contentType: 'audio/mp3' });
        
        // 2-3. 다운로드 URL 가져오기
        const url = await getDownloadURL(storageRef);
        audioUrls.push(url);
      }

      // 3. Firestore에 URL 배열 저장
      await updateDoc(doc(db, "sori_curriculum_dialogue", dialogue.id), {
        audio_paths: audioUrls,
        has_audio: true
      });

      alert("✅ 음성 생성 완료!");
      fetchData("sori_curriculum_dialogue", setDialogues);

    } catch (e: any) {
      alert("실패: " + e.message);
      console.error(e);
    } finally {
      setGeneratingId(null);
    }
  };


  // --- 기존 로직들 (CSV, 쪽지 등) ---
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
      const rows = ev.target.result.split("\n").slice(1);
      const parsedData: any[] = [];
      
      rows.forEach((row: string) => {
        const c = row.split(","); // 쉼표 파싱 주의
        if (c.length >= 3) {
          let d: any = {};
          if (activeTab === "word") d = { category: c[0], text: c[1], pronunciation: c[2], tip: c[3] || "" };
          else if (activeTab === "sentence") d = { category: c[0], text: c[1], pronunciation: c[2], translation: c[3] || "" };
          else d = { category: c[0], title: c[1], script: c[2], translation: c[3] || "" };
          
          if (d.category && (d.text || d.title)) {
             parsedData.push(d);
          }
        }
      });

      const currentList = activeTab === "word" ? problems : activeTab === "sentence" ? sentences : dialogues;
      const key = activeTab === "dialogue" ? "title" : "text";
      
      const dups = parsedData.filter(newItem => 
        currentList.some((existItem: any) => existItem[key] === newItem[key])
      ).length;

      setCsvPreview(parsedData);
      setDuplicateCount(dups);
      setUploadStatus("ready");
    };
    reader.readAsText(file);
  };

  const executeBatchUpload = async () => {
    if (csvPreview.length === 0) return alert("데이터 없음");
    const tabName = activeTab === "word" ? "단어" : activeTab === "sentence" ? "문장" : "담화";
    if (!confirm(`'${tabName}' 문제 ${csvPreview.length}개를 업로드 하시겠습니까?`)) return;

    try {
      const batch = writeBatch(db);
      const col = `sori_curriculum_${activeTab}`;
      csvPreview.forEach(item => {
        const ref = doc(collection(db, col));
        batch.set(ref, { ...item, created_at: serverTimestamp() });
      });
      await batch.commit();
      alert(`✅ ${csvPreview.length}개 업로드 완료!`);
      setCsvPreview([]); setDuplicateCount(null); setUploadStatus(""); fetchAllData();
    } catch (e) { alert("오류 발생"); console.error(e); }
  };

  const toggleSelectUser = (email: string) => { setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]); };
  const toggleSelectAll = () => { if (isAllSelected) setSelectedEmails([]); else setSelectedEmails(users.map(u => u.email)); setIsAllSelected(!isAllSelected); };
  const sendMail = async () => {
    if (!mailContent.trim()) return alert("내용 필수");
    if (selectedEmails.length === 0) return alert("대상 선택 필수");
    if (!confirm(`${selectedEmails.length}명 전송?`)) return;
    try {
      const batch = writeBatch(db);
      const msg = { from: "관리자", content: mailContent, date: serverTimestamp(), read: false };
      selectedEmails.forEach(e => batch.set(doc(collection(db, "sori_users", e, "inbox")), msg));
      await batch.commit(); alert("전송 완료"); setMailContent(""); setSelectedEmails([]); setIsAllSelected(false); setActiveTab("users");
    } catch (e) { alert("전송 실패"); }
  };
  const handleAddTokens = async (email: string, cur: number) => {
    const amtStr = prompt("충전할 개수", "100");
    if (!amtStr) return;
    const amt = parseInt(amtStr);
    if (!confirm(`${amt}개 처리?`)) return;
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
    if (!editingId && list.some((item: any) => item[key] === (data as any)[key])) return alert("이미 등록됨");
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
                 {activeTab==="dialogue" && <><input placeholder="Title" className="w-full border p-2 rounded" value={newDialogue.title} onChange={e=>setNewDialogue({...newDialogue,title:e.target.value})}/><textarea placeholder="A:.. | B:.." className="w-full border p-2 rounded" rows={3} value={newDialogue.script} onChange={e=>setNewDialogue({...newDialogue,script:e.target.value})}/><input placeholder="Translation" className="w-full border p-2 rounded" value={newDialogue.translation} onChange={e=>setNewDialogue({...newDialogue,translation:e.target.value})}/></>}
                 <div className="flex gap-2"><button className="w-full bg-blue-600 text-white py-2 rounded font-bold">{editingId?"수정":"등록"}</button>{editingId&&<button type="button" onClick={cancelEdit} className="w-1/3 bg-gray-200">취소</button>}</div>
               </form>
             </div>
             
             <div 
               className={`p-6 rounded-lg shadow border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px] ${isDragging ? 'bg-blue-50 border-blue-500' : 'bg-gray-50 border-gray-300 hover:border-blue-400'}`}
               onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
             >
               <input type="file" accept=".csv" ref={fileInputRef} hidden onChange={(e) => e.target.files && processFile(e.target.files[0])} />
               {uploadStatus === "ready" ? (
                 <div className="animate-fade-in-up w-full">
                    <p className="font-bold text-gray-800 text-lg mb-1">{csvPreview.length}개 항목 대기 중</p>
                    {duplicateCount !== null && duplicateCount > 0 ? <p className="text-red-500 font-bold mb-4 bg-red-50 py-1 rounded">⚠️ 중복 {duplicateCount}개</p> : <p className="text-green-600 font-bold mb-4 text-sm">✅ 중복 없음</p>}
                    <div className="flex gap-2"><button onClick={(e) => { e.stopPropagation(); executeBatchUpload(); }} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">업로드 확정</button><button onClick={(e) => { e.stopPropagation(); setCsvPreview([]); setUploadStatus(""); }} className="px-4 bg-gray-300 text-gray-700 rounded font-bold">취소</button></div>
                 </div>
               ) : (
                 <><div className="text-4xl text-gray-300 mb-2">📂</div><p className="font-bold text-gray-500">CSV 드래그 & 드롭</p></>
               )}
             </div>
           </div>
           
           <div className="md:col-span-2 bg-white p-6 rounded shadow border overflow-y-auto max-h-[600px]">
             {(activeTab==="word"?problems:activeTab==="sentence"?sentences:dialogues).map((item:any)=>(
               <div key={item.id} className="flex justify-between p-3 border-b hover:bg-gray-50">
                 <div className="flex-1">
                   <span className="text-xs font-bold bg-gray-100 px-2 rounded mr-2">{item.category}</span>
                   <span className="font-bold">{item.text||item.title}</span>
                 </div>
                 <div className="flex gap-2 items-center">
                    {/* 🔥 담화 탭에서만 보이는 TTS 버튼 */}
                    {activeTab === "dialogue" && (
                      <button 
                        onClick={() => handleGenerateTTS(item)} 
                        disabled={generatingId === item.id}
                        className={`text-xs border px-2 py-1 rounded font-bold flex items-center gap-1 ${item.has_audio ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-purple-100 hover:text-purple-700'}`}
                      >
                        {generatingId === item.id ? "생성 중..." : item.has_audio ? "🔊 재생성" : "🔊 음성 생성"}
                      </button>
                    )}
                    <button onClick={()=>startEdit(item,activeTab)} className="text-blue-600 text-xs border px-2 rounded">수정</button>
                    <button onClick={()=>handleDelete(item.id,activeTab)} className="text-red-500 text-xs border px-2 rounded">삭제</button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}
    </main>
  );
}