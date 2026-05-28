"use client";
// app/admin/page.tsx

import { useEffect, useState, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy, limit, getDoc,
} from "firebase/firestore";
import {
  Sparkles, CheckCircle, XCircle, Upload, Trash2,
  RefreshCw, Loader2, Music, Volume2,
} from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────
interface Draft {
  id: string;
  type: "word" | "sentence" | "dialogue";
  status: "pending" | "approved" | "rejected";
  step?: number;
  unit?: number;
  category: string;
  content: any;
  generated_at: any;
}

interface CurriculumDoc {
  id: string;
  text?: string;
  title?: string;
  script?: string;
  category: string;
  has_audio?: boolean;
  audio_path?: string;
  audio_paths?: string[];
  step?: number;
  unit?: number;
  source?: string;
}

interface ParsedLine { role: string; text: string; }

type Tab = "curriculum" | "generate" | "drafts" | "audio" | "feedback" | "users" | "charges" | "inquiries";

// ── 점수대 정보 ────────────────────────────────────────────
const SCORE_TIERS = [
  { id: "perfect", label: "🎺 완벽 (90~95점)", desc: "한국 사람처럼 발음하셨어요! 정말 훌륭해요!", color: "bg-yellow-50 border-yellow-300" },
  { id: "great",   label: "✨ 우수 (75~89점)", desc: "정말 잘하셨어요! 조금만 더 다듬으면 완벽할 거 같아요.", color: "bg-green-50 border-green-300" },
  { id: "good",    label: "👍 양호 (55~74점)", desc: "잘하고 있어요! 한 번 더 해볼까요?", color: "bg-blue-50 border-blue-300" },
  { id: "okay",    label: "🔔 보통 (30~54점)", desc: "조금 더 연습이 필요해요. 포기하지 마세요!", color: "bg-orange-50 border-orange-300" },
  { id: "fail",    label: "😅 미흡 (0~29점)",  desc: "괜찮아요, 다시 한번 도전해봐요!", color: "bg-red-50 border-red-300" },
  { id: "silence", label: "🎙️ 침묵 (0점)",     desc: "소리가 들리지 않았어요. 다시 말해볼까요?", color: "bg-slate-50 border-slate-300" },
] as const;

// ── 담화 대본 파서 ────────────────────────────────────────
function parseScript(script: string): ParsedLine[] {
  if (!script) return [];
  return script.split("|").map(l => {
    const parts = l.split(":");
    return { role: parts[0]?.trim() ?? "?", text: parts[1]?.trim() ?? "" };
  });
}

// ── 담화 라인별 업로드 컴포넌트 ──────────────────────────
function LineAudioRow({
  line, lineIndex, docId, colName, existingUrl, idToken, onRefresh
}: {
  line: ParsedLine; lineIndex: number; docId: string; colName: string;
  existingUrl: string; idToken: string; onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docId", docId);
      formData.append("colName", colName);
      formData.append("audioType", "dialogue_line");
      formData.append("lineIndex", String(lineIndex));
      const res = await fetch("/api/admin/audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult("✅"); onRefresh();
    } catch (e: any) {
      setResult("❌ " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("삭제할까요?")) return;
    await fetch("/api/admin/audio", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ docId, colName, lineIndex }),
    });
    onRefresh();
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${existingUrl ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-0.5 ${line.role === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
        {line.role}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 mb-1 truncate">{line.text}</p>
        {existingUrl ? (
          <div className="flex items-center gap-2">
            <audio src={existingUrl} controls className="h-7 w-40" />
            <span className="text-[10px] text-green-600 font-bold">등록됨</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400">오디오 없음</p>
        )}
        {result && <p className={`text-[10px] font-bold mt-1 ${result.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{result}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg" onChange={handleUpload} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 text-xs bg-white border border-slate-300 px-2 py-1.5 rounded-lg font-bold hover:bg-slate-50 disabled:opacity-50 transition">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {existingUrl ? "교체" : "업로드"}
        </button>
        {existingUrl && (
          <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── 담화 항목 카드 ────────────────────────────────────────
function DialogueAudioCard({ doc_, idToken, onRefresh }: { doc_: CurriculumDoc; idToken: string; onRefresh: () => void; }) {
  const [expanded, setExpanded] = useState(false);
  const lines = parseScript(doc_.script ?? "");
  const filledCount = lines.filter((_, i) => !!doc_.audio_paths?.[i]).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition text-left">
        <div>
          <p className="font-bold text-slate-800">{doc_.title ?? doc_.id}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {doc_.category}{doc_.step ? ` · Step ${doc_.step}` : ""}
            {" · "}
            <span className={filledCount === lines.length && lines.length > 0 ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>
              {filledCount}/{lines.length} 라인 등록
            </span>
          </p>
        </div>
        <span className="text-slate-400 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3">
          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">대본 데이터 없음</p>
          ) : lines.map((line, idx) => (
            <LineAudioRow key={idx} line={line} lineIndex={idx} docId={doc_.id}
              colName="sori_curriculum_dialogue" existingUrl={doc_.audio_paths?.[idx] ?? ""}
              idToken={idToken} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 점수 피드백 멘트 업로드 카드 ─────────────────────────
function FeedbackVoiceCard({
  tier, idToken, currentUrl, onRefresh
}: {
  tier: typeof SCORE_TIERS[number];
  idToken: string;
  currentUrl: string;
  onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tier", tier.id);
      const res = await fetch("/api/admin/feedback-audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult("✅ 업로드 완료");
      onRefresh();
    } catch (e: any) {
      setResult("❌ " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("멘트 오디오를 삭제할까요?")) return;
    await fetch("/api/admin/feedback-audio", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tier: tier.id }),
    });
    onRefresh();
  };

  const handlePreview = () => {
    if (!currentUrl) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setPlaying(false); return; }
    const audio = new Audio(currentUrl);
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => { audioRef.current = null; setPlaying(false); };
    audio.play();
  };

  return (
    <div className={`rounded-2xl border-2 p-4 ${tier.color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-black text-slate-800 text-sm mb-1">{tier.label}</p>
          <p className="text-xs text-slate-500 italic mb-3">"{tier.desc}"</p>
          {currentUrl ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">🎵 등록됨</span>
              <button onClick={handlePreview}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-bold border transition ${playing ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                <Volume2 size={12} /> {playing ? "정지" : "미리듣기"}
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">미등록</span>
          )}
          {result && (
            <p className={`text-xs font-bold mt-2 ${result.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
              {result}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg" onChange={handleUpload} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1 text-xs bg-white border border-slate-300 px-3 py-2 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {currentUrl ? "교체" : "업로드"}
          </button>
          {currentUrl && (
            <button onClick={handleDelete}
              className="flex items-center gap-1 text-xs bg-white border border-red-200 text-red-500 px-3 py-2 rounded-xl font-bold hover:bg-red-50 transition shadow-sm">
              <Trash2 size={12} /> 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 어드민 페이지 ────────────────────────────────────
export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [idToken, setIdToken] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("generate");

  // AI 생성
  const [genType, setGenType] = useState<"word" | "sentence" | "dialogue">("word");
  const [genStep, setGenStep] = useState(1);
  const [genUnit, setGenUnit] = useState(1);
  const [genCategory, setGenCategory] = useState("");
  const [genCount, setGenCount] = useState(5);
  const [genGrammar, setGenGrammar] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // 초안 승인
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // 오디오 업로드
  const [audioColName, setAudioColName] = useState<"sori_curriculum_word" | "sori_curriculum_sentence" | "sori_curriculum_dialogue">("sori_curriculum_word");
  const [audioDocs, setAudioDocs] = useState<CurriculumDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 피드백 멘트
  const [feedbackVoices, setFeedbackVoices] = useState<Record<string, string>>({});
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  // 커리큘럼/사용자/충전/문의
  const [curriculumType, setCurriculumType] = useState<"word" | "sentence" | "dialogue">("word");
  const [curriculumList, setCurriculumList] = useState<CurriculumDoc[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ── 인증 ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setChecking(false); return; }
      try {
        const token = await user.getIdToken();
        setIdToken(token);
        const snap = await getDoc(doc(db, "sori_users", user.email!));
        if (snap.exists() && snap.data()?.role === "admin") setIsAdmin(true);
      } catch {}
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const authHeader = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  // ── AI 생성 ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genCategory.trim()) return alert("카테고리를 입력하세요.");
    setGenerating(true); setGenResult(null);
    try {
      const res = await fetch("/api/admin/generate", {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ type: genType, step: genStep, unit: genUnit, category: genCategory, count: genCount, grammarHint: genGrammar || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(`✅ ${data.count}개 초안 생성 완료! 승인 대기 탭에서 확인하세요.`);
    } catch (e: any) {
      setGenResult(`❌ 오류: ${e.message}`);
    } finally { setGenerating(false); }
  };

  // ── 초안 ─────────────────────────────────────────────────
  const loadDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const snap = await getDocs(query(collection(db, "sori_drafts"), where("status", "==", "pending"), orderBy("generated_at", "desc"), limit(50)));
      setDrafts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Draft));
    } catch (e) { console.error(e); }
    setLoadingDrafts(false);
  };

  useEffect(() => { if (isAdmin && activeTab === "drafts") loadDrafts(); }, [isAdmin, activeTab]);

  const approveDraft = async (draftId: string, editedContent?: any) => {
    try {
      const res = await fetch("/api/admin/approve", { method: "POST", headers: authHeader, body: JSON.stringify({ draftId, editedContent }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      setEditingDraft(null);
    } catch (e: any) { alert("오류: " + e.message); }
  };

  const rejectDraft = async (draftId: string) => {
    if (!confirm("반려하시겠습니까?")) return;
    try {
      const res = await fetch("/api/admin/approve", { method: "DELETE", headers: authHeader, body: JSON.stringify({ draftId }) });
      if (!res.ok) throw new Error("반려 실패");
      setDrafts(prev => prev.filter(d => d.id !== draftId));
    } catch (e: any) { alert(e.message); }
  };

  // ── 오디오 탭 ────────────────────────────────────────────
  const loadAudioDocs = async () => {
    try {
      const snap = await getDocs(collection(db, audioColName));
      setAudioDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CurriculumDoc));
      setSelectedDocId("");
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (isAdmin && activeTab === "audio") loadAudioDocs(); }, [isAdmin, activeTab, audioColName]);

  const handleSingleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocId) return alert("파일과 항목을 선택하세요.");
    setUploading(true); setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docId", selectedDocId);
      formData.append("colName", audioColName);
      formData.append("audioType", "answer");
      const res = await fetch("/api/admin/audio", { method: "POST", headers: { Authorization: `Bearer ${idToken}` }, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploadResult("✅ 업로드 완료");
      loadAudioDocs();
    } catch (e: any) {
      setUploadResult(`❌ 실패: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteSingleAudio = async (docId: string) => {
    if (!confirm("오디오를 삭제하시겠습니까?")) return;
    await fetch("/api/admin/audio", { method: "DELETE", headers: authHeader, body: JSON.stringify({ docId, colName: audioColName }) });
    loadAudioDocs();
  };

  // ── 피드백 멘트 탭 ───────────────────────────────────────
  const loadFeedbackVoices = async () => {
    setLoadingFeedback(true);
    try {
      const res = await fetch("/api/admin/feedback-audio");
      const data = await res.json();
      setFeedbackVoices(data);
    } catch (e) { console.error(e); }
    setLoadingFeedback(false);
  };

  useEffect(() => { if (isAdmin && activeTab === "feedback") loadFeedbackVoices(); }, [isAdmin, activeTab]);

  // ── 커리큘럼 ─────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || activeTab !== "curriculum") return;
    setLoading(true);
    getDocs(collection(db, `sori_curriculum_${curriculumType}`))
      .then(s => setCurriculumList(s.docs.map(d => ({ id: d.id, ...d.data() }) as CurriculumDoc)))
      .finally(() => setLoading(false));
  }, [isAdmin, activeTab, curriculumType]);

  const deleteItem = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, `sori_curriculum_${curriculumType}`, id));
    setCurriculumList(prev => prev.filter(i => i.id !== id));
  };

  // ── 사용자 ───────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || activeTab !== "users") return;
    setLoading(true);
    getDocs(collection(db, "sori_users"))
      .then(s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))))
      .finally(() => setLoading(false));
  }, [isAdmin, activeTab]);

  const grantTokens = async (email: string, amount: number) => {
    if (!confirm(`${email}에 ${amount}토큰 지급?`)) return;
    await updateDoc(doc(db, "sori_users", email), { tokens: amount });
    await addDoc(collection(db, "sori_users", email, "token_logs"), { type: "earn", amount, reason: "관리자 지급", date: serverTimestamp() });
    alert("지급 완료");
  };

  // ── 충전 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || activeTab !== "charges") return;
    setLoading(true);
    getDocs(query(collection(db, "sori_charge_requests"), where("status", "==", "pending")))
      .then(s => setCharges(s.docs.map(d => ({ id: d.id, ...d.data() }))))
      .finally(() => setLoading(false));
  }, [isAdmin, activeTab]);

  const approveCharge = async (req: any) => {
    if (!confirm(`${req.depositor} (${req.amount}토큰) 승인?`)) return;
    await updateDoc(doc(db, "sori_users", req.userId), { tokens: req.amount });
    await updateDoc(doc(db, "sori_charge_requests", req.id), { status: "approved" });
    await addDoc(collection(db, "sori_users", req.userId, "inbox"), { from: "소리튜터 운영진", title: "✅ 충전 완료!", content: `${req.amount}토큰이 충전되었습니다.`, date: serverTimestamp(), read: false });
    setCharges(prev => prev.filter(c => c.id !== req.id));
  };

  // ── 문의 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || activeTab !== "inquiries") return;
    setLoading(true);
    getDocs(query(collection(db, "sori_inquiries"), where("status", "==", "pending")))
      .then(s => setInquiries(s.docs.map(d => ({ id: d.id, ...d.data() }))))
      .finally(() => setLoading(false));
  }, [isAdmin, activeTab]);

  // ── 렌더 ─────────────────────────────────────────────────
  if (checking) return <div className="flex h-screen items-center justify-center text-slate-400">인증 확인 중...</div>;
  if (!isAdmin) return <div className="flex h-screen items-center justify-center text-red-500 font-bold">관리자 권한이 없습니다.</div>;

  const TABS: { id: Tab; label: string }[] = [
    { id: "generate", label: "✨ AI 생성" },
    { id: "drafts",   label: `📋 승인대기 (${drafts.length})` },
    { id: "audio",    label: "🎵 오디오" },
    { id: "feedback", label: "🔊 점수 멘트" },
    { id: "curriculum", label: "📚 커리큘럼" },
    { id: "users",    label: "👥 사용자" },
    { id: "charges",  label: `💳 충전 (${charges.length})` },
    { id: "inquiries", label: "📬 문의" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold">S</div>
        <h1 className="text-xl font-black">Sori-Tutor Admin</h1>
      </header>

      <div className="flex overflow-x-auto bg-white border-b border-slate-200 px-4 gap-1 scrollbar-hide">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto p-6">

        {/* ──── AI 생성 ──── */}
        {activeTab === "generate" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-black mb-6 flex items-center gap-2">
              <Sparkles className="text-amber-500" /> AI 커리큘럼 초안 생성
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">유형</label>
                <select value={genType} onChange={e => setGenType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="word">단어</option>
                  <option value="sentence">문장</option>
                  <option value="dialogue">담화</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">생성 개수</label>
                <input type="number" min={1} max={20} value={genCount} onChange={e => setGenCount(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Step (1~8)</label>
                <input type="number" min={1} max={8} value={genStep} onChange={e => setGenStep(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Unit</label>
                <input type="number" min={1} value={genUnit} onChange={e => setGenUnit(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 block mb-1">카테고리 *</label>
              <input value={genCategory} onChange={e => setGenCategory(e.target.value)} placeholder="예: 음식, 직장 생활, 여행"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="mb-6">
              <label className="text-xs font-bold text-slate-500 block mb-1">문법 힌트 (선택)</label>
              <input value={genGrammar} onChange={e => setGenGrammar(e.target.value)} placeholder="예: -아/어서 (이유)"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleGenerate} disabled={generating}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black text-base shadow-lg hover:from-blue-700 hover:to-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-60">
              {generating ? <><Loader2 size={20} className="animate-spin" /> 생성 중...</> : <><Sparkles size={20} /> AI 초안 생성</>}
            </button>
            {genResult && (
              <div className={`mt-4 p-4 rounded-xl text-sm font-bold ${genResult.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {genResult}
              </div>
            )}
          </div>
        )}

        {/* ──── 승인 대기 ──── */}
        {activeTab === "drafts" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">승인 대기 초안</h2>
              <button onClick={loadDrafts} className="flex items-center gap-1 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg font-bold hover:bg-slate-50">
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>
            {loadingDrafts ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
            ) : drafts.length === 0 ? (
              <div className="text-center text-slate-400 py-12 bg-white rounded-2xl border">대기 중인 초안이 없습니다.</div>
            ) : (
              <div className="space-y-4">
                {drafts.map(draft => (
                  <div key={draft.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${draft.type === "word" ? "bg-blue-100 text-blue-700" : draft.type === "sentence" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                          {draft.type === "word" ? "단어" : draft.type === "sentence" ? "문장" : "담화"}
                        </span>
                        <span className="text-sm font-bold text-slate-700">{draft.category}</span>
                        {draft.step && <span className="text-xs text-slate-400">Step {draft.step}-{draft.unit}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingDraft(draft.id); setEditContent(JSON.stringify(draft.content, null, 2)); }}
                          className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">수정 후 승인</button>
                        <button onClick={() => approveDraft(draft.id)}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle size={12} /> 승인</button>
                        <button onClick={() => rejectDraft(draft.id)}
                          className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-bold hover:bg-red-200 flex items-center gap-1">
                          <XCircle size={12} /> 반려</button>
                      </div>
                    </div>
                    <div className="p-4">
                      {editingDraft === draft.id ? (
                        <div>
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                            className="w-full h-48 p-3 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => { try { approveDraft(draft.id, JSON.parse(editContent)); } catch { alert("JSON 오류"); } }}
                              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold text-sm">수정된 내용으로 승인</button>
                            <button onClick={() => setEditingDraft(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">취소</button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl overflow-x-auto border border-slate-100">
                          {JSON.stringify(draft.content, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ──── 오디오 탭 ──── */}
        {activeTab === "audio" && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Music className="text-green-500" size={24} />
              <h2 className="text-xl font-black">정답 발음 오디오 관리</h2>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 text-sm text-blue-800">
              💡 ElevenLabs MP3 또는 직접 녹음 파일을 업로드하세요.<br />
              <span className="font-bold">담화는 라인별로 A·B 목소리를 각각 업로드할 수 있습니다.</span>
            </div>
            <div className="flex gap-2 mb-6">
              {(["sori_curriculum_word", "sori_curriculum_sentence", "sori_curriculum_dialogue"] as const).map(col => (
                <button key={col} onClick={() => { setAudioColName(col); setSelectedDocId(""); setUploadResult(null); }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition border ${audioColName === col ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                  {col === "sori_curriculum_word" ? "단어" : col === "sori_curriculum_sentence" ? "문장" : "담화"}
                </button>
              ))}
            </div>

            {audioColName === "sori_curriculum_dialogue" ? (
              <div className="space-y-4">
                {audioDocs.length === 0
                  ? <p className="text-center text-slate-400 py-12">담화 데이터가 없습니다.</p>
                  : audioDocs.map(d => <DialogueAudioCard key={d.id} doc_={d} idToken={idToken} onRefresh={loadAudioDocs} />)
                }
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-500 block mb-1">항목 선택</label>
                  <select value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— 항목을 선택하세요 —</option>
                    {audioDocs.map(d => (
                      <option key={d.id} value={d.id}>{d.text ?? d.id} {d.category ? `(${d.category})` : ""} {d.has_audio ? "🎵" : ""}</option>
                    ))}
                  </select>
                </div>
                <input ref={fileInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg" onChange={handleSingleUpload} disabled={!selectedDocId || uploading} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={!selectedDocId || uploading}
                  className="w-full py-4 bg-green-600 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-green-700 transition disabled:opacity-50">
                  {uploading ? <><Loader2 size={20} className="animate-spin" /> 업로드 중...</> : <><Upload size={20} /> MP3 / WAV 파일 업로드</>}
                </button>
                {uploadResult && (
                  <div className={`mt-3 p-3 rounded-xl text-xs font-bold ${uploadResult.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{uploadResult}</div>
                )}
                <div className="mt-8">
                  <h3 className="font-bold text-slate-700 mb-3 text-sm">등록된 오디오 현황</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {audioDocs.filter(d => d.audio_path).map(d => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-200">
                        <div>
                          <p className="font-bold text-sm text-slate-800">{d.text ?? d.id}</p>
                          <p className="text-xs text-slate-400">{d.category}</p>
                          <audio src={d.audio_path} controls className="mt-1 h-7 w-44" />
                        </div>
                        <button onClick={() => deleteSingleAudio(d.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition ml-2">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {audioDocs.filter(d => d.audio_path).length === 0 && (
                      <p className="text-center text-slate-400 py-6 text-sm">등록된 오디오가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ──── 점수 멘트 탭 ──── */}
        {activeTab === "feedback" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2">🔊 점수대별 피드백 멘트</h2>
                <p className="text-sm text-slate-500 mt-1">ElevenLabs로 생성한 MP3를 점수대별로 업로드하세요.</p>
              </div>
              <button onClick={loadFeedbackVoices} className="flex items-center gap-1 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg font-bold hover:bg-slate-50">
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <p className="font-bold mb-1">📋 업로드 가이드</p>
              <p>ElevenLabs에서 아래 멘트를 준호님 목소리로 생성 후 각 점수대에 업로드하세요.<br />
              효과음은 자동 재생되고, 효과음이 끝난 후 멘트가 이어서 재생됩니다.</p>
            </div>

            {loadingFeedback ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
            ) : (
              <div className="space-y-3">
                {SCORE_TIERS.map(tier => (
                  <FeedbackVoiceCard
                    key={tier.id}
                    tier={tier}
                    idToken={idToken}
                    currentUrl={feedbackVoices[tier.id] ?? ""}
                    onRefresh={loadFeedbackVoices}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
              <p className="font-bold text-slate-700 mb-2">💡 ElevenLabs 멘트 생성 팁</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>짧고 명확하게 (3~5초 분량 권장)</li>
                <li>밝고 친근한 톤으로 설정</li>
                <li>MP3 또는 WAV 형식으로 다운로드</li>
                <li>파일 크기 5MB 이하</li>
              </ul>
            </div>
          </div>
        )}

        {/* ──── 커리큘럼 ──── */}
        {activeTab === "curriculum" && (
          <div>
            <div className="flex gap-2 mb-4">
              {(["word", "sentence", "dialogue"] as const).map(t => (
                <button key={t} onClick={() => setCurriculumType(t)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition ${curriculumType === t ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                  {t === "word" ? "단어" : t === "sentence" ? "문장" : "담화"}
                </button>
              ))}
            </div>
            {loading ? <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div> : (
              <div className="space-y-2">
                {curriculumList.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                      <p className="font-bold text-slate-800">{item.text ?? item.title ?? "—"}</p>
                      <p className="text-xs text-slate-400">{item.category}{item.step ? ` · Step ${item.step}` : ""}{item.source === "ai_generated" ? " · AI생성" : ""}</p>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                ))}
                {curriculumList.length === 0 && <p className="text-center text-slate-400 py-10">데이터 없음</p>}
              </div>
            )}
          </div>
        )}

        {/* ──── 사용자 ──── */}
        {activeTab === "users" && (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-slate-800">{u.alias || u.name}</p>
                  <p className="text-xs text-slate-400">{u.id} · {u.role} · 토큰: {u.tokens}</p>
                </div>
                <button onClick={() => { const amt = Number(prompt("지급할 토큰 수:")); if (amt > 0) grantTokens(u.id, amt); }}
                  className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-700">토큰 지급</button>
              </div>
            ))}
          </div>
        )}

        {/* ──── 충전 ──── */}
        {activeTab === "charges" && (
          <div className="space-y-3">
            {charges.map(c => (
              <div key={c.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-800">{c.userAlias} ({c.userId})</p>
                    <p className="text-sm text-slate-500">입금자: {c.depositor} · {c.price} → {c.amount}토큰</p>
                    <p className="text-xs text-slate-400">{c.createdAt?.toDate?.().toLocaleString()}</p>
                  </div>
                  <button onClick={() => approveCharge(c)} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-700 flex items-center gap-1">
                    <CheckCircle size={14} /> 충전 승인
                  </button>
                </div>
              </div>
            ))}
            {charges.length === 0 && <p className="text-center text-slate-400 py-12">대기 중인 충전 요청이 없습니다.</p>}
          </div>
        )}

        {/* ──── 문의 ──── */}
        {activeTab === "inquiries" && (
          <div className="space-y-3">
            {inquiries.map(i => (
              <div key={i.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded">{i.category}</span>
                  <span className="text-xs text-slate-400">{i.createdAt?.toDate?.().toLocaleString()}</span>
                </div>
                <p className="font-bold text-sm text-slate-700 mb-1">{i.userName} ({i.userId})</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{i.content}</p>
                <button onClick={async () => {
                  const reply = prompt("답변 내용:");
                  if (!reply) return;
                  await updateDoc(doc(db, "sori_inquiries", i.id), { status: "replied", adminReply: reply });
                  await addDoc(collection(db, "sori_users", i.userId, "inbox"), { from: "소리튜터 운영진", title: `📬 문의 답변: ${i.category}`, content: reply, date: serverTimestamp(), read: false });
                  setInquiries(prev => prev.filter(q => q.id !== i.id));
                }} className="mt-3 w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
                  답변 보내기
                </button>
              </div>
            ))}
            {inquiries.length === 0 && <p className="text-center text-slate-400 py-12">문의가 없습니다.</p>}
          </div>
        )}

      </div>
    </div>
  );
}