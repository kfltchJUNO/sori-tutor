"use client";
// app/admin/page.tsx

import DonggukSection from "./DonggukSection";
import DankookSection from "./DankookSection";
// app/admin/page.tsx

import { useEffect, useState, useRef } from "react";
import { auth, db, adminFetch } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy, limit, getDoc,
} from "firebase/firestore";
import {
  Sparkles, CheckCircle, XCircle, Upload, Trash2,
  RefreshCw, Loader2, Music, Volume2, Wand2, Plus, Edit3,
} from "lucide-react";
import { ELEVENLABS_VOICES, DEFAULT_MALE_VOICE_ID } from "@/lib/elevenlabsVoices";

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
  translation?: string;
  pronunciation?: string;
  voice_id?: string;
  category: string;
  has_audio?: boolean;
  audio_path?: string;
  audio_paths?: string[];
  step?: number;
  unit?: number;
  source?: string;
}

interface ParsedLine { role: string; text: string; }

type Tab = "curriculum" | "generate" | "drafts" | "audio" | "feedback" | "dongguk" | "dankook" | "users" | "charges" | "inquiries";

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

// ── 담화 라인별 업로드/생성/대사수정 컴포넌트 ──────────────────────────
function LineAudioRow({
  line, lineIndex, allLines, docId, colName, existingUrl, idToken, onRefresh
}: {
  line: ParsedLine; lineIndex: number; allLines: ParsedLine[]; docId: string; colName: string;
  existingUrl: string; idToken: string; onRefresh: () => void;
}) {
  const defaultVoice = line.role === "B"
    ? (ELEVENLABS_VOICES.find(v => v.gender === "female")?.id ?? DEFAULT_MALE_VOICE_ID)
    : DEFAULT_MALE_VOICE_ID;
  const [selectedVoice, setSelectedVoice] = useState(defaultVoice);
  const [editedText, setEditedText] = useState(line.text);
  const [savingText, setSavingText] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    setEditedText(line.text);
  }, [line.text]);

  const isTextChanged = editedText.trim() !== line.text.trim();

  // 수정된 대사를 Firestore script에 반영하는 헬퍼
  const saveUpdatedLineToFirestore = async (newLineText: string) => {
    const newScript = allLines
      .map((l, idx) => `${l.role}: ${idx === lineIndex ? newLineText.trim() : l.text}`)
      .join("|");
    await updateDoc(doc(db, colName, docId), { script: newScript });
  };

  // 대사만 저장
  const handleSaveTextOnly = async () => {
    if (!editedText.trim()) return alert("대사를 입력해주세요.");
    setSavingText(true); setResult(null);
    try {
      await saveUpdatedLineToFirestore(editedText);
      setResult("✅ 대사 수정됨");
      onRefresh();
    } catch (e: any) {
      setResult("❌ 저장 실패: " + e.message);
    } finally {
      setSavingText(false);
    }
  };

  // ElevenLabs 자동 생성 (대사가 수정되었다면 먼저 Firestore에 대사 저장 후 음성 생성)
  const handleGenerate = async () => {
    if (!editedText.trim()) return alert("대사를 입력해주세요.");
    setGenerating(true); setResult(null);
    try {
      if (isTextChanged) {
        await saveUpdatedLineToFirestore(editedText);
      }
      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          docId,
          colName,
          lineIndex,
          text: editedText.trim(),
          voiceId: selectedVoice,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(isTextChanged ? "✅ 대사 수정 & 음성 재생성 완료" : "✅ 생성 완료");
      onRefresh();
    } catch (e: any) {
      setResult("❌ " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 라인의 오디오를 삭제할까요?")) return;
    try {
      await adminFetch("/api/admin/generate-audio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, colName, lineIndex }),
      }, idToken);
      onRefresh();
    } catch (e: any) {
      alert("삭제 실패: " + e.message);
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${existingUrl ? "bg-green-50/50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-1 sm:mt-0 ${line.role === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
          {line.role}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              placeholder="대사를 입력하거나 수정하세요"
              className={`w-full text-sm font-medium text-slate-900 bg-white border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isTextChanged ? "border-amber-400 bg-amber-50/40" : "border-slate-200"
              }`}
            />
            {isTextChanged && (
              <button
                onClick={handleSaveTextOnly}
                disabled={savingText}
                className="shrink-0 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {savingText ? "저장중..." : "대사만 저장"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {existingUrl ? (
              <audio src={existingUrl} controls className="h-7 w-48" />
            ) : (
              <span className="text-xs text-slate-900">오디오 미생성</span>
            )}
            {result && <span className={`text-[11px] font-bold ${result.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{result}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
        <select
          value={selectedVoice}
          onChange={e => setSelectedVoice(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-900 font-medium focus:outline-none"
        >
          {ELEVENLABS_VOICES.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          {isTextChanged ? "수정 & 재생성" : existingUrl ? "재생성" : "생성"}
        </button>
        {existingUrl && (
          <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="오디오 삭제">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── 담화 항목 카드 ────────────────────────────────────────
function DialogueAudioCard({ doc_, idToken, onRefresh }: { doc_: CurriculumDoc; idToken: string; onRefresh: () => void; }) {
  const [expanded, setExpanded] = useState(false);
  const [editingScript, setEditingScript] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc_.title ?? "");
  const [scriptDraft, setScriptDraft] = useState(doc_.script ?? "");
  const [translationDraft, setTranslationDraft] = useState(doc_.translation ?? "");
  const [savingScript, setSavingScript] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [roleAVoice, setRoleAVoice] = useState(DEFAULT_MALE_VOICE_ID);
  const [roleBVoice, setRoleBVoice] = useState(
    ELEVENLABS_VOICES.find(v => v.gender === "female")?.id ?? DEFAULT_MALE_VOICE_ID
  );
  const lines = parseScript(doc_.script ?? "");
  const filledCount = lines.filter((_, i) => !!doc_.audio_paths?.[i]).length;

  useEffect(() => {
    setTitleDraft(doc_.title ?? "");
    setScriptDraft(doc_.script ?? "");
    setTranslationDraft(doc_.translation ?? "");
  }, [doc_.title, doc_.script, doc_.translation]);

  const handleSaveFullScript = async () => {
    if (!scriptDraft.trim()) return alert("대본을 입력해주세요.");
    setSavingScript(true);
    try {
      await updateDoc(doc(db, "sori_curriculum_dialogue", doc_.id), {
        title: titleDraft.trim() || doc_.title || "담화",
        script: scriptDraft.trim(),
        translation: translationDraft.trim(),
      });
      setEditingScript(false);
      onRefresh();
      alert("✅ 대본이 수정되었습니다! 이제 일괄 생성 또는 개별 재생성을 눌러 음성을 업데이트할 수 있습니다.");
    } catch (e: any) {
      alert("대본 수정 실패: " + e.message);
    } finally {
      setSavingScript(false);
    }
  };

  const handleDeleteEntireDialogue = async () => {
    if (!confirm(`'${doc_.title ?? doc_.id}' 담화 전체를 영구 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, "sori_curriculum_dialogue", doc_.id));
      onRefresh();
    } catch (e: any) {
      alert("담화 삭제 실패: " + e.message);
    }
  };

  const handleBatchGenerate = async () => {
    if (!confirm(`전체 ${lines.length}개 라인의 음성을 선택한 성우(A/B)로 일괄 생성하시겠습니까?`)) return;
    setBatchLoading(true);
    try {
      const preparedLines = lines.map((line, idx) => ({
        text: line.text,
        index: idx,
        voiceId: line.role === "B" ? roleBVoice : roleAVoice,
      }));

      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          docId: doc_.id,
          colName: "sori_curriculum_dialogue",
          isBatch: true,
          lines: preparedLines,
        }),
      }, idToken);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("🎉 전체 대화 음성이 일괄 생성되었습니다!");
      onRefresh();
    } catch (e: any) {
      alert("일괄 생성 실패: " + e.message);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50 transition text-left cursor-pointer" onClick={() => setExpanded(p => !p)}>
        <div>
          <p className="font-bold text-slate-900">{doc_.title ?? doc_.id}</p>
          <p className="text-xs text-slate-900 mt-0.5">
            {doc_.category}{doc_.step ? ` · Step ${doc_.step}` : ""}
            {" · "}
            <span className={filledCount === lines.length && lines.length > 0 ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>
              {filledCount}/{lines.length} 라인 등록
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 text-xs">
            <span className="font-bold text-blue-700">A:</span>
            <select
              value={roleAVoice}
              onChange={e => setRoleAVoice(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-900 font-medium text-xs"
            >
              {ELEVENLABS_VOICES.map(v => (
                <option key={v.id} value={v.id}>{v.name.split(" (")[0]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="font-bold text-purple-700">B:</span>
            <select
              value={roleBVoice}
              onChange={e => setRoleBVoice(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-900 font-medium text-xs"
            >
              {ELEVENLABS_VOICES.map(v => (
                <option key={v.id} value={v.id}>{v.name.split(" (")[0]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleBatchGenerate}
            disabled={batchLoading}
            className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50"
          >
            {batchLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            전체 대화 일괄 생성
          </button>
          <button
            onClick={() => { setExpanded(true); setEditingScript(p => !p); }}
            className="flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg font-bold transition"
            title="전체 대본 수정"
          >
            <Edit3 size={12} /> 대본 수정
          </button>
          <button
            onClick={handleDeleteEntireDialogue}
            className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-bold transition"
            title="이 담화 전체 삭제"
          >
            <Trash2 size={12} /> 담화 삭제
          </button>
          <button onClick={() => setExpanded(p => !p)} className="p-1 text-slate-900 text-sm">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3">
          {editingScript && (
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-amber-900">✏️ 전체 대본 / 제목 / 번역 수정</span>
                <button onClick={() => setEditingScript(false)} className="text-xs text-slate-900 hover:underline">닫기</button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">대화 제목</label>
                <input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">대본 (파이프 | 로 줄 구분)</label>
                <textarea
                  value={scriptDraft}
                  onChange={e => setScriptDraft(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">번역 (파이프 | 로 줄 구분)</label>
                <input
                  value={translationDraft}
                  onChange={e => setTranslationDraft(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white text-slate-900"
                />
              </div>
              <button
                onClick={handleSaveFullScript}
                disabled={savingScript}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
              >
                {savingScript ? "저장 중..." : "💾 대본 수정사항 저장"}
              </button>
            </div>
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-slate-900 text-center py-4">대본 데이터 없음</p>
          ) : lines.map((line, idx) => (
            <LineAudioRow key={idx} line={line} lineIndex={idx} allLines={lines} docId={doc_.id}
              colName="sori_curriculum_dialogue" existingUrl={doc_.audio_paths?.[idx] ?? ""}
              idToken={idToken} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 점수 피드백 멘트 생성(미리듣기/저장) & 업로드 카드 ─────────────────────────
function FeedbackVoiceCard({
  tier, idToken, currentUrl, onRefresh
}: {
  tier: typeof SCORE_TIERS[number];
  idToken: string;
  currentUrl: string;
  onRefresh: () => void;
}) {
  const [customText, setCustomText] = useState<string>(tier.desc);
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_MALE_VOICE_ID);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1. ElevenLabs API 호출 → 즉시 미리듣기 (아직 저장 안 함)
  const handleGeneratePreview = async () => {
    if (!customText.trim()) return alert("생성할 멘트 대사를 입력해주세요.");
    setPreviewing(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/feedback-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          text: customText.trim(),
          voiceId: selectedVoice,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreviewBase64(data.audioBase64);
      setResult("🎧 미리듣기 음성이 생성되었습니다! 들어보시고 마음에 들면 [이 음성으로 저장]을 눌러주세요.");

      // 생성 즉시 자동 재생
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const previewAudio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
      audioRef.current = previewAudio;
      previewAudio.play().catch(() => {});
    } catch (e: any) {
      setResult("❌ 미리듣기 생성 실패: " + e.message);
    } finally {
      setPreviewing(false);
    }
  };

  // 2. 미리듣기한 음성 그대로 저장 (또는 바로 생성 & 저장)
  const handleSaveGenerated = async (useExistingPreview: boolean) => {
    if (!customText.trim() && !previewBase64) return alert("멘트 대사를 입력해주세요.");
    setSaving(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/feedback-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          tier: tier.id,
          text: customText.trim(),
          voiceId: selectedVoice,
          audioBase64: useExistingPreview && previewBase64 ? previewBase64 : undefined,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreviewBase64(null);
      setResult("✅ ElevenLabs 피드백 음성이 저장되었습니다!");
      onRefresh();
    } catch (e: any) {
      setResult("❌ 저장 실패: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 3. 수동 파일 업로드 (보조)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tier", tier.id);
      const res = await adminFetch("/api/admin/feedback-audio", {
        method: "POST",
        body: formData,
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult("✅ 파일 업로드 완료");
      onRefresh();
    } catch (e: any) {
      setResult("❌ " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("등록된 멘트 오디오를 삭제할까요?")) return;
    await adminFetch("/api/admin/feedback-audio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: tier.id }),
    }, idToken);
    setPreviewBase64(null);
    onRefresh();
  };

  const handlePlayCurrent = () => {
    if (!currentUrl) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setPlaying(false); return; }
    const audio = new Audio(currentUrl);
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => { audioRef.current = null; setPlaying(false); };
    audio.play();
  };

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 ${tier.color}`}>
      {/* 상단: 점수대 라벨 & 현재 등록된 음성 상태 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-black text-slate-900 text-sm">{tier.label}</p>
          {currentUrl ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">🎵 저장됨</span>
              <button
                onClick={handlePlayCurrent}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                  playing ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Volume2 size={12} /> {playing ? "정지" : "현재 저장된 음성 듣기"}
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-900 bg-white/80 border border-slate-200 px-2 py-0.5 rounded-full">미등록</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[11px] bg-white/90 border border-slate-300 text-slate-900 px-2.5 py-1 rounded-lg font-bold hover:bg-white disabled:opacity-50 transition"
            title="직접 녹음하거나 보유한 MP3 파일 업로드"
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            파일 직접 업로드
          </button>
          {currentUrl && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[11px] bg-white/90 border border-red-200 text-red-600 px-2.5 py-1 rounded-lg font-bold hover:bg-red-50 transition"
            >
              <Trash2 size={11} /> 삭제
            </button>
          )}
        </div>
      </div>

      {/* 중단: 멘트 대사 수정 & 성우 선택 & ElevenLabs 생성 버튼 */}
      <div className="bg-white/90 rounded-xl p-3 border border-slate-200/80 space-y-2.5">
        <div>
          <label className="text-[11px] font-bold text-slate-900 block mb-1">
            ✏️ 피드백 멘트 대사 (자유롭게 수정 가능)
          </label>
          <input
            value={customText}
            onChange={e => {
              setCustomText(e.target.value);
              setPreviewBase64(null);
            }}
            placeholder="점수 피드백 대사를 입력하세요"
            className="w-full text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={selectedVoice}
            onChange={e => {
              setSelectedVoice(e.target.value);
              setPreviewBase64(null);
            }}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-56"
          >
            {ELEVENLABS_VOICES.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.description})</option>
            ))}
          </select>

          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={handleGeneratePreview}
              disabled={previewing || saving}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-bold transition disabled:opacity-50 shadow-xs"
            >
              {previewing ? <Loader2 size={13} className="animate-spin" /> : <Volume2 size={13} />}
              {previewing ? "생성 중..." : "🎧 생성해서 들어보기"}
            </button>

            <button
              onClick={() => handleSaveGenerated(false)}
              disabled={previewing || saving}
              className="flex items-center justify-center gap-1 text-xs bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg font-bold transition disabled:opacity-50 shadow-xs"
              title="미리듣기 없이 바로 생성 후 저장"
            >
              {saving && !previewBase64 ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              바로 생성 & 저장
            </button>
          </div>
        </div>

        {/* 미리듣기 오디오가 생성된 경우: 플레이어 + [이 음성으로 저장] 버튼 노출 */}
        {previewBase64 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-indigo-800 shrink-0">🎧 방금 생성된 음성:</span>
              <audio src={`data:audio/mp3;base64,${previewBase64}`} controls className="h-8 w-52" />
            </div>
            <button
              onClick={() => handleSaveGenerated(true)}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-black transition shadow-sm disabled:opacity-50 shrink-0"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              💾 이 음성으로 확정 저장
            </button>
          </div>
        )}
      </div>

      {result && (
        <p className={`text-xs font-bold ${result.startsWith("❌") ? "text-red-600" : "text-indigo-800"}`}>
          {result}
        </p>
      )}
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

  // ── 새 에셋 등록 상태 ─────────────────────
  const [assetInputText, setAssetInputText] = useState("");
  const [assetPronunciation, setAssetPronunciation] = useState("");
  const [assetTip, setAssetTip] = useState("");
  const [assetRuleFormula, setAssetRuleFormula] = useState("");
  const [assetMeaningKo, setAssetMeaningKo] = useState("");
  const [assetCategory, setAssetCategory] = useState("일상");
  const [assetScript, setAssetScript] = useState("");
  const [assetTranslation, setAssetTranslation] = useState("");
  const [assetAutoVoice, setAssetAutoVoice] = useState(true);
  const [assetVoiceId, setAssetVoiceId] = useState(DEFAULT_MALE_VOICE_ID);
  const [assetAnalyzing, setAssetAnalyzing] = useState(false);
  const [assetSaving, setAssetSaving] = useState(false);

  // ── 오디오 일괄 생성 상태 ───────────────────
  const [batchAudioGenerating, setBatchAudioGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");

  // ── 인증 (ID 토큰 자동 갱신 포함) ─────────────────────────
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) { setChecking(false); return; }
      try {
        const token = await user.getIdToken();
        setIdToken(token);
        const snap = await getDoc(doc(db, "sori_users", user.email!));
        if (snap.exists() && snap.data()?.role === "admin") setIsAdmin(true);
      } catch {}
      setChecking(false);
    });
    // 15분마다 토큰 강제 갱신 (1시간 만료 방지)
    const refreshInterval = setInterval(async () => {
      if (auth.currentUser) {
        try {
          const freshToken = await auth.currentUser.getIdToken(true);
          setIdToken(freshToken);
        } catch {}
      }
    }, 15 * 60 * 1000);
    return () => {
      unsub();
      clearInterval(refreshInterval);
    };
  }, []);

  const authHeader = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  // ── AI 생성 ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genCategory.trim()) return alert("카테고리를 입력하세요.");
    setGenerating(true); setGenResult(null);
    try {
      const res = await adminFetch("/api/admin/generate", {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ type: genType, step: genStep, unit: genUnit, category: genCategory, count: genCount, grammarHint: genGrammar || undefined }),
      }, idToken);
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
      const res = await adminFetch("/api/admin/approve", { method: "POST", headers: authHeader, body: JSON.stringify({ draftId, editedContent }) }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      setEditingDraft(null);
    } catch (e: any) { alert("오류: " + e.message); }
  };

  const rejectDraft = async (draftId: string) => {
    if (!confirm("반려하시겠습니까?")) return;
    try {
      const res = await adminFetch("/api/admin/approve", { method: "DELETE", headers: authHeader, body: JSON.stringify({ draftId }) }, idToken);
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

  const [selectedVoiceForSingle, setSelectedVoiceForSingle] = useState(DEFAULT_MALE_VOICE_ID);
  const [singleGenerating, setSingleGenerating] = useState(false);
  const [singleEditText, setSingleEditText] = useState("");
  const [singleSavingText, setSingleSavingText] = useState(false);

  // 항목 선택 시 수정용 텍스트 동기화
  useEffect(() => {
    if (!selectedDocId) {
      setSingleEditText("");
      return;
    }
    const found = audioDocs.find(d => d.id === selectedDocId);
    setSingleEditText(found?.text ?? "");
  }, [selectedDocId, audioDocs]);

  // 단어/문장 텍스트만 수정 저장
  const handleSaveSingleText = async () => {
    if (!selectedDocId || !singleEditText.trim()) return alert("내용을 입력하세요.");
    setSingleSavingText(true); setUploadResult(null);
    try {
      await updateDoc(doc(db, audioColName, selectedDocId), {
        text: singleEditText.trim(),
      });
      setUploadResult("✅ 텍스트 수정 저장 완료");
      await loadAudioDocs();
    } catch (e: any) {
      setUploadResult(`❌ 저장 실패: ${e.message}`);
    } finally {
      setSingleSavingText(false);
    }
  };

  // 단어/문장 항목 자체를 영구 삭제
  const deleteEntireAudioDoc = async (docId: string) => {
    const target = audioDocs.find(d => d.id === docId);
    if (!confirm(`'${target?.text ?? docId}' 항목 자체를 아예 삭제하시겠습니까?\n(단어/문장 목록에서도 영구 삭제됩니다)`)) return;
    try {
      await deleteDoc(doc(db, audioColName, docId));
      if (selectedDocId === docId) setSelectedDocId("");
      await loadAudioDocs();
    } catch (e: any) {
      alert("항목 삭제 실패: " + e.message);
    }
  };

  // ElevenLabs 단일 생성 (단어/문장 — 텍스트가 수정되었으면 먼저 저장 후 생성)
  const handleSingleGenerate = async (docIdToUse?: string, voiceIdToUse?: string) => {
    const targetDocId = docIdToUse || selectedDocId;
    if (!targetDocId) return alert("항목을 선택하세요.");
    const docObj = audioDocs.find(d => d.id === targetDocId);
    const targetText = (targetDocId === selectedDocId && singleEditText.trim())
      ? singleEditText.trim()
      : (docObj?.text || "");
    if (!targetText) return alert("오디오를 생성할 텍스트가 없습니다.");

    const targetVoice = voiceIdToUse || selectedVoiceForSingle;
    setSingleGenerating(true); setUploadResult(null);
    try {
      // 텍스트가 기존과 다르면 먼저 Firestore 업데이트
      if (docObj && docObj.text !== targetText) {
        await updateDoc(doc(db, audioColName, targetDocId), {
          text: targetText,
        });
      }
      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: targetDocId,
          colName: audioColName,
          text: targetText,
          voiceId: targetVoice,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploadResult("✅ 텍스트 반영 및 ElevenLabs 음성 생성 완료");
      loadAudioDocs();
    } catch (e: any) {
      setUploadResult(`❌ 생성 실패: ${e.message}`);
    } finally {
      setSingleGenerating(false);
    }
  };

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
      const res = await adminFetch("/api/admin/audio", { method: "POST", body: formData }, idToken);
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
    await adminFetch("/api/admin/generate-audio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, colName: audioColName }),
    }, idToken);
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

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemText, setEditItemText] = useState("");
  const [editItemPronunciation, setEditItemPronunciation] = useState("");
  const [editItemScript, setEditItemScript] = useState("");
  const [editItemTranslation, setEditItemTranslation] = useState("");
  const [editItemVoiceId, setEditItemVoiceId] = useState(DEFAULT_MALE_VOICE_ID);
  const [editItemSaving, setEditItemSaving] = useState(false);

  const startEditItem = (item: CurriculumDoc) => {
    setEditingItemId(item.id);
    setEditItemText(item.text ?? item.title ?? "");
    setEditItemPronunciation((item as any).pronunciation ?? "");
    setEditItemScript(item.script ?? "");
    setEditItemTranslation(item.translation ?? "");
    setEditItemVoiceId((item as any).voice_id || DEFAULT_MALE_VOICE_ID);
  };

  const handleSaveEditedItem = async (item: CurriculumDoc, regenerateAudio: boolean) => {
    setEditItemSaving(true);
    const colName = `sori_curriculum_${curriculumType}`;
    try {
      const updates: any = {};
      if (curriculumType === "dialogue") {
        updates.title = editItemText.trim() || item.title || "담화";
        updates.script = editItemScript.trim();
        updates.translation = editItemTranslation.trim();
      } else {
        updates.text = editItemText.trim();
        updates.pronunciation = editItemPronunciation.trim() || editItemText.trim();
      }
      await updateDoc(doc(db, colName, item.id), updates);

      if (regenerateAudio) {
        if (curriculumType === "dialogue") {
          const parsed = parseScript(editItemScript.trim());
          const femaleVoice = ELEVENLABS_VOICES.find(v => v.gender === "female")?.id ?? DEFAULT_MALE_VOICE_ID;
          const preparedLines = parsed.map((line, idx) => ({
            text: line.text,
            index: idx,
            voiceId: line.role === "B" ? femaleVoice : editItemVoiceId,
          }));
          const res = await adminFetch("/api/admin/generate-audio", {
            method: "POST",
            headers: authHeader,
            body: JSON.stringify({
              docId: item.id,
              colName,
              isBatch: true,
              lines: preparedLines,
            }),
          }, idToken);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        } else {
          const res = await adminFetch("/api/admin/generate-audio", {
            method: "POST",
            headers: authHeader,
            body: JSON.stringify({
              docId: item.id,
              colName,
              text: editItemText.trim(),
              voiceId: editItemVoiceId,
            }),
          }, idToken);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        }
      }

      const snap = await getDocs(collection(db, colName));
      setCurriculumList(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CurriculumDoc));
      setEditingItemId(null);
      alert(regenerateAudio ? "✅ 수정 및 음성 재생성이 완료되었습니다!" : "✅ 내용 수정이 저장되었습니다!");
    } catch (e: any) {
      alert("수정 실패: " + e.message);
    } finally {
      setEditItemSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, `sori_curriculum_${curriculumType}`, id));
    setCurriculumList(prev => prev.filter(i => i.id !== id));
  };

  // ── AI 에셋 발음·규칙·의미 자동 완성 ─────────────
  const handleAssetAutoFill = async () => {
    if (!assetInputText.trim()) return alert("먼저 단어, 문장, 또는 대화 상황을 입력해 주세요.");
    setAssetAnalyzing(true);
    try {
      const res = await adminFetch("/api/admin/pronunciation-helper", {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ text: assetInputText.trim(), type: curriculumType }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (curriculumType === "word") {
        if (data.pronunciation) setAssetPronunciation(data.pronunciation);
        if (data.tip) setAssetTip(data.tip);
        if (data.meaning_ko) setAssetMeaningKo(data.meaning_ko);
        if (data.category) setAssetCategory(data.category);
      } else if (curriculumType === "dialogue") {
        if (data.script) setAssetScript(data.script);
        if (data.translation) setAssetTranslation(data.translation);
        if (data.category) setAssetCategory(data.category);
      } else {
        if (data.pronunciation) setAssetPronunciation(data.pronunciation);
        if (data.rule_formula) setAssetRuleFormula(data.rule_formula);
        if (data.tip) setAssetTip(data.tip);
        if (data.meaning_ko) setAssetMeaningKo(data.meaning_ko);
        if (data.category) setAssetCategory(data.category);
      }
      alert("✨ AI 분석 완료!\n자동 입력된 발음 표기, 규칙, 뜻을 확인한 후 등록하세요.");
    } catch (e: any) {
      console.error(e);
      alert(`AI 분석 실패: ${e.message}`);
    } finally {
      setAssetAnalyzing(false);
    }
  };

  // ── 새 에셋 직접 등록 (음성 자동 생성 포함) ─────────────
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetInputText.trim()) return alert("내용을 입력하세요.");
    setAssetSaving(true);
    try {
      const colName = `sori_curriculum_${curriculumType}`;
      let docData: any = {
        category: assetCategory.trim() || "기타",
        source: "admin_manual",
        has_audio: false,
        created_at: serverTimestamp(),
      };

      if (curriculumType === "word") {
        docData.text = assetInputText.trim();
        docData.pronunciation = assetPronunciation.trim() || assetInputText.trim();
        if (assetTip.trim()) docData.tip = assetTip.trim();
        if (assetMeaningKo.trim()) docData.meaning_ko = assetMeaningKo.trim();
      } else if (curriculumType === "dialogue") {
        docData.title = assetInputText.trim();
        docData.script = assetScript.trim();
        if (assetTranslation.trim()) docData.translation = assetTranslation.trim();
      } else {
        docData.text = assetInputText.trim();
        docData.pronunciation = assetPronunciation.trim() || assetInputText.trim();
        if (assetRuleFormula.trim()) docData.rule_formula = assetRuleFormula.trim();
        if (assetMeaningKo.trim()) docData.meaning_ko = assetMeaningKo.trim();
        if (assetTip.trim()) docData.tip = assetTip.trim();
      }

      const docRef = await addDoc(collection(db, colName), docData);

      // 음성 즉시 생성 옵션이 켜져 있고 단어/문장인 경우 ElevenLabs 자동 호출
      if (assetAutoVoice && curriculumType !== "dialogue") {
        const textToSpeak = assetInputText.trim();
        await adminFetch("/api/admin/generate-audio", {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            docId: docRef.id,
            colName,
            text: textToSpeak,
            voiceId: assetVoiceId,
          }),
        }, idToken);
      }

      alert("🎉 에셋 등록 완료!" + (assetAutoVoice && curriculumType !== "dialogue" ? " (ElevenLabs 음성까지 자동 생성됨)" : ""));
      // 폼 초기화
      setAssetInputText("");
      setAssetPronunciation("");
      setAssetTip("");
      setAssetRuleFormula("");
      setAssetMeaningKo("");
      setAssetScript("");
      setAssetTranslation("");

      // 목록 새로고침
      const snap = await getDocs(collection(db, colName));
      setCurriculumList(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CurriculumDoc));
    } catch (e: any) {
      console.error(e);
      alert(`등록 실패: ${e.message}`);
    } finally {
      setAssetSaving(false);
    }
  };

  // ── 오디오 일괄 생성 ─────────────
  const handleBatchGenerateAudio = async () => {
    const targets = audioDocs.filter(d => !d.audio_path);
    if (targets.length === 0) return alert("생성할 오디오가 없습니다.");
    if (!confirm(`오디오가 없는 ${targets.length}개 항목의 음성을 일괄 생성하시겠습니까?`)) return;

    setBatchAudioGenerating(true);
    let successCount = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setBatchProgress(`${i + 1}/${targets.length} 생성 중... (${item.text ?? item.id})`);
        const text = item.text || item.title;
        if (!text) continue;

        const res = await adminFetch("/api/admin/generate-audio", {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            docId: item.id,
            colName: audioColName,
            text,
            voiceId: selectedVoiceForSingle,
          }),
        }, idToken);
        if (res.ok) successCount++;
      }
      alert(`🎉 ${successCount}개 항목의 오디오 일괄 생성이 완료되었습니다!`);
      await loadAudioDocs();
    } catch (e: any) {
      console.error(e);
      alert(`일괄 생성 중 오류 발생: ${e.message}`);
    } finally {
      setBatchAudioGenerating(false);
      setBatchProgress("");
    }
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
    try {
      const res = await adminFetch("/api/admin/grant-tokens", {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ targetEmail: email, amount }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`지급 완료! (현재 잔액: ${data.newBalance})`);
      setUsers(prev => prev.map(u => u.id === email ? { ...u, tokens: data.newBalance } : u));
    } catch (e: any) {
      alert("오류: " + e.message);
    }
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
    try {
      const res = await adminFetch("/api/admin/grant-tokens", {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ targetEmail: req.userId, amount: req.amount, reason: "충전 요청 승인" }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await updateDoc(doc(db, "sori_charge_requests", req.id), { status: "approved" });
      setCharges(prev => prev.filter(c => c.id !== req.id));
      alert("승인 완료");
    } catch (e: any) {
      alert("오류: " + e.message);
    }
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
  if (checking) return <div className="flex h-screen items-center justify-center text-slate-900">인증 확인 중...</div>;
  if (!isAdmin) return <div className="flex h-screen items-center justify-center text-red-500 font-bold">관리자 권한이 없습니다.</div>;

  const TABS: { id: Tab; label: string }[] = [
    { id: "dongguk",  label: "🏫 동국대 1급" },
    { id: "dankook",  label: "🐻 단국대 관리" },
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold">S</div>
        <h1 className="text-xl font-black">Sori-Tutor Admin</h1>
      </header>

      <div className="flex overflow-x-auto bg-white border-b border-slate-200 px-4 gap-1 scrollbar-hide">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-900 hover:text-slate-900"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto p-6">

        {/* ──── 동국대 1급 관리 ──── */}
        {activeTab === "dongguk" && (
          <DonggukSection
            idToken={idToken}
            voices={ELEVENLABS_VOICES}
            defaultVoiceId={DEFAULT_MALE_VOICE_ID}
          />
        )}

        {/* ──── 단국대 관리 ──── */}
        {activeTab === "dankook" && (
          <DankookSection
            idToken={idToken}
            voices={ELEVENLABS_VOICES}
            defaultVoiceId={DEFAULT_MALE_VOICE_ID}
          />
        )}

        {/* ──── AI 생성 ──── */}
        {activeTab === "generate" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-black mb-6 flex items-center gap-2">
              <Sparkles className="text-amber-500" /> AI 커리큘럼 초안 생성
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">유형</label>
                <select value={genType} onChange={e => setGenType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="word">단어</option>
                  <option value="sentence">문장</option>
                  <option value="dialogue">담화</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">생성 개수</label>
                <input type="number" min={1} max={20} value={genCount} onChange={e => setGenCount(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">Step (1~8)</label>
                <input type="number" min={1} max={8} value={genStep} onChange={e => setGenStep(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">Unit</label>
                <input type="number" min={1} value={genUnit} onChange={e => setGenUnit(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-900 block mb-1">카테고리 *</label>
              <input value={genCategory} onChange={e => setGenCategory(e.target.value)} placeholder="예: 음식, 직장 생활, 여행"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="mb-6">
              <label className="text-xs font-bold text-slate-900 block mb-1">문법 힌트 (선택)</label>
              <input value={genGrammar} onChange={e => setGenGrammar(e.target.value)} placeholder="예: -아/어서 (이유)"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-900" /></div>
            ) : drafts.length === 0 ? (
              <div className="text-center text-slate-900 py-12 bg-white rounded-2xl border">대기 중인 초안이 없습니다.</div>
            ) : (
              <div className="space-y-4">
                {drafts.map(draft => (
                  <div key={draft.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${draft.type === "word" ? "bg-blue-100 text-blue-700" : draft.type === "sentence" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                          {draft.type === "word" ? "단어" : draft.type === "sentence" ? "문장" : "담화"}
                        </span>
                        <span className="text-sm font-bold text-slate-900">{draft.category}</span>
                        {draft.step && <span className="text-xs text-slate-900">Step {draft.step}-{draft.unit}</span>}
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
                            className="w-full h-48 p-3 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => { try { approveDraft(draft.id, JSON.parse(editContent)); } catch { alert("JSON 오류"); } }}
                              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold text-sm">수정된 내용으로 승인</button>
                            <button onClick={() => setEditingDraft(null)} className="px-4 py-2 bg-slate-100 text-slate-900 rounded-lg font-bold text-sm">취소</button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs text-slate-900 bg-slate-50 p-3 rounded-xl overflow-x-auto border border-slate-100">
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
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6 text-sm text-indigo-900">
              💡 ElevenLabs를 통해 준호님의 목소리 또는 선택한 성우의 목소리로 고품질 음성을 자동 생성하여 저장합니다.<br />
              <span className="font-bold">담화는 라인별로 A·B 역할을 지정하여 개별 또는 일괄 생성할 수 있습니다.</span>
            </div>
            <div className="flex gap-2 mb-6">
              {(["sori_curriculum_word", "sori_curriculum_sentence", "sori_curriculum_dialogue"] as const).map(col => (
                <button key={col} onClick={() => { setAudioColName(col); setSelectedDocId(""); setUploadResult(null); }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition border ${audioColName === col ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900 border-slate-200 hover:border-slate-400"}`}>
                  {col === "sori_curriculum_word" ? "단어" : col === "sori_curriculum_sentence" ? "문장" : "담화"}
                </button>
              ))}
            </div>

            {audioColName !== "sori_curriculum_dialogue" && audioDocs.filter(d => !d.audio_path).length > 0 && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-amber-900 text-sm">
                    ⚡ 음성이 없는 항목: {audioDocs.filter(d => !d.audio_path).length}개
                  </p>
                  <p className="text-xs text-amber-700">
                    성우를 선택하고 아래 버튼을 누르면 모든 미등록 항목의 오디오가 자동으로 생성됩니다.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedVoiceForSingle}
                    onChange={e => setSelectedVoiceForSingle(e.target.value)}
                    className="border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-900 bg-white font-bold focus:outline-none"
                  >
                    {ELEVENLABS_VOICES.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBatchGenerateAudio}
                    disabled={batchAudioGenerating}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {batchAudioGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {batchAudioGenerating ? batchProgress || "생성 중..." : "전체 일괄 자동 생성"}
                  </button>
                </div>
              </div>
            )}

            {audioColName === "sori_curriculum_dialogue" ? (
              <div className="space-y-4">
                {audioDocs.length === 0
                  ? <p className="text-center text-slate-900 py-12">담화 데이터가 없습니다.</p>
                  : audioDocs.map(d => <DialogueAudioCard key={d.id} doc_={d} idToken={idToken} onRefresh={loadAudioDocs} />)
                }
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-900 block mb-1">항목 선택</label>
                  <select value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">— 생성할 단어/문장을 선택하세요 —</option>
                    {audioDocs.filter(d => !d.audio_path).map(d => (
                      <option key={d.id} value={d.id}>📝 {d.text ?? d.id} {d.category ? `(${d.category})` : ""}</option>
                    ))}
                    {audioDocs.some(d => d.audio_path) && (
                      <optgroup label="── 이미 등록됨 (선택 시 새 목소리로 덮어쓰기 가능) ──">
                        {audioDocs.filter(d => d.audio_path).map(d => (
                          <option key={d.id} value={d.id}>
                            🎵 {d.text ?? d.id} {d.category ? `(${d.category})` : ""} (오디오 있음)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {selectedDocId && (
                  <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 mb-4 animate-in fade-in space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-700">✏️ 텍스트 수정 및 음성 생성</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-900">ID: {selectedDocId}</span>
                        <button
                          onClick={() => deleteEntireAudioDoc(selectedDocId)}
                          className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg font-bold transition"
                          title="이 단어/문장 항목 자체를 영구 삭제"
                        >
                          <Trash2 size={12} /> 항목 자체 삭제
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={singleEditText}
                        onChange={e => setSingleEditText(e.target.value)}
                        placeholder="단어 또는 문장을 수정할 수 있습니다"
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      {singleEditText.trim() !== (audioDocs.find(d => d.id === selectedDocId)?.text ?? "") && (
                        <button
                          onClick={handleSaveSingleText}
                          disabled={singleSavingText}
                          className="shrink-0 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                        >
                          {singleSavingText ? "저장중..." : "텍스트만 저장"}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 block mb-1">목소리(Voice) 선택</label>
                      <select
                        value={selectedVoiceForSingle}
                        onChange={e => setSelectedVoiceForSingle(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                      >
                        {ELEVENLABS_VOICES.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.description})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleSingleGenerate()}
                      disabled={singleGenerating}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                    >
                      {singleGenerating ? (
                        <><Loader2 size={18} className="animate-spin" /> ElevenLabs 음성 생성 중...</>
                      ) : (
                        <><Wand2 size={18} /> ✨ (수정된 텍스트로) ElevenLabs 음성 자동 생성 및 저장</>
                      )}
                    </button>
                  </div>
                )}

                {/* 수동 파일 업로드 (보조) */}
                <div className="pt-2 pb-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-900">
                  <span>직접 녹음 파일 올리기:</span>
                  <input ref={fileInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg" onChange={handleSingleUpload} disabled={!selectedDocId || uploading} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={!selectedDocId || uploading}
                    className="text-xs text-slate-900 hover:text-slate-900 font-bold underline disabled:opacity-50">
                    {uploading ? "업로드 중..." : "MP3 파일 수동 업로드"}
                  </button>
                </div>

                {uploadResult && (
                  <div className={`mt-3 p-3 rounded-xl text-xs font-bold ${uploadResult.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{uploadResult}</div>
                )}

                <div className="mt-8">
                  <h3 className="font-bold text-slate-900 mb-3 text-sm">등록된 오디오 현황 ({audioDocs.filter(d => d.audio_path).length}개)</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {audioDocs.filter(d => d.audio_path).map(d => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-green-50/60 rounded-xl border border-green-200">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-bold text-sm text-slate-900 truncate">{d.text ?? d.id}</p>
                          <p className="text-xs text-slate-900 mb-1">{d.category}</p>
                          <audio src={d.audio_path} controls className="h-7 w-48" />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setSelectedDocId(d.id);
                              window.scrollTo({ top: 400, behavior: "smooth" });
                            }}
                            className="text-xs bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg font-bold hover:bg-slate-50 text-slate-900 transition"
                          >
                            ✏️ 텍스트·목소리 수정
                          </button>
                          <button onClick={() => deleteSingleAudio(d.id)} className="text-amber-600 hover:text-amber-800 px-2 py-1.5 hover:bg-amber-50 rounded-lg transition text-xs font-bold border border-amber-200 bg-white" title="오디오만 삭제">
                            오디오만 삭제
                          </button>
                          <button onClick={() => deleteEntireAudioDoc(d.id)} className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition" title="항목 완전 삭제">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {audioDocs.filter(d => d.audio_path).length === 0 && (
                      <p className="text-center text-slate-900 py-6 text-sm">등록된 오디오가 없습니다.</p>
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
                <h2 className="text-xl font-black flex items-center gap-2">🔊 점수대별 피드백 멘트 (ElevenLabs 즉시 생성)</h2>
                <p className="text-sm text-slate-900 mt-1">
                  멘트 대사와 성우(준호·민우·채원·유진)를 선택해 <strong>바로 생성해서 들어보고 저장</strong>하세요!
                </p>
              </div>
              <button onClick={loadFeedbackVoices} className="flex items-center gap-1 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg font-bold hover:bg-slate-50">
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-900">
              <p className="font-bold mb-1">💡 사용 방법</p>
              <p>
                1. 원하는 멘트 대사로 수정하고 성우를 선택한 뒤 <strong>[🎧 생성해서 들어보기]</strong>를 누르면 즉시 음성이 재생됩니다.<br />
                2. 목소리와 억양이 마음에 들면 <strong>[💾 이 음성으로 확정 저장]</strong>을 눌러 바로 반영하세요! (다시 API를 호출하지 않고 방금 들은 음성을 그대로 저장합니다.)
              </p>
            </div>

            {loadingFeedback ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-900" /></div>
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

            <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-900">
              <p className="font-bold text-slate-900 mb-2">💡 ElevenLabs 멘트 생성 팁</p>
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
          <div className="space-y-6">
            <div className="flex gap-2">
              {(["word", "sentence", "dialogue"] as const).map(t => (
                <button key={t} onClick={() => setCurriculumType(t)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition ${curriculumType === t ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-900"}`}>
                  {t === "word" ? "단어" : t === "sentence" ? "문장" : "담화"}
                </button>
              ))}
            </div>

            {/* 새 에셋 등록 폼 (AI 자동 완성 포함) */}
            <form onSubmit={handleCreateAsset} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-blue-600" />
                  새 {curriculumType === "word" ? "단어" : curriculumType === "sentence" ? "문장" : "담화"} 에셋 등록
                </h3>
                <span className="text-xs text-slate-900">내용 입력 후 AI 자동 완성을 누르면 발음/규칙이 자동 생성됩니다.</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-900">
                    {curriculumType === "word" ? "단어 (원문) *" : curriculumType === "sentence" ? "문장 (원문) *" : "대화 주제/상황 *"}
                  </label>
                  <button
                    type="button"
                    onClick={handleAssetAutoFill}
                    disabled={assetAnalyzing || !assetInputText.trim()}
                    className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {assetAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {assetAnalyzing ? "AI 분석 중..." : "✨ AI 자동 완성"}
                  </button>
                </div>
                <input
                  value={assetInputText}
                  onChange={e => setAssetInputText(e.target.value)}
                  placeholder={
                    curriculumType === "word" ? "예: 한국어" :
                    curriculumType === "sentence" ? "예: 한국말을 잘하고 싶어요" :
                    "예: 카페에서 커피 주문하기"
                  }
                  required
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {curriculumType !== "dialogue" ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-900 block mb-1">소리나는 대로 발음 표기 *</label>
                      <input
                        value={assetPronunciation}
                        onChange={e => setAssetPronunciation(e.target.value)}
                        placeholder="예: [한구거]"
                        className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 block mb-1">카테고리</label>
                      <input
                        value={assetCategory}
                        onChange={e => setAssetCategory(e.target.value)}
                        placeholder="예: 일상, 음식, 학교"
                        className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {curriculumType === "sentence" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-900 block mb-1">쉬운 발음 규칙 공식 (받침 + ? = [??])</label>
                        <input
                          value={assetRuleFormula}
                          onChange={e => setAssetRuleFormula(e.target.value)}
                          placeholder="예: 말[ㄹ] + 을[ㅇ] = [마를] (연음)"
                          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-900 block mb-1">문장 의미/해석</label>
                        <input
                          value={assetMeaningKo}
                          onChange={e => setAssetMeaningKo(e.target.value)}
                          placeholder="예: 한국어를 잘하고 싶습니다."
                          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-900 block mb-1">단어 뜻 풀이</label>
                        <input
                          value={assetMeaningKo}
                          onChange={e => setAssetMeaningKo(e.target.value)}
                          placeholder="예: 대한민국의 언어"
                          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-900 block mb-1">발음 팁/설명</label>
                        <input
                          value={assetTip}
                          onChange={e => setAssetTip(e.target.value)}
                          placeholder="예: 받침 뒤에 모음이 오면 연음돼요"
                          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* 음성 자동 생성 옵션 */}
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assetAutoVoice}
                        onChange={e => setAssetAutoVoice(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-xs font-bold text-indigo-900">등록 시 일레븐랩스 정답 음성 자동 생성</span>
                    </label>
                    {assetAutoVoice && (
                      <select
                        value={assetVoiceId}
                        onChange={e => setAssetVoiceId(e.target.value)}
                        className="text-xs border border-indigo-200 rounded-lg p-1.5 bg-white font-medium"
                      >
                        {ELEVENLABS_VOICES.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-900 block mb-1">대화 스크립트 (A:...|B:... 형식) *</label>
                    <textarea
                      value={assetScript}
                      onChange={e => setAssetScript(e.target.value)}
                      placeholder="A: 안녕하세요.|B: 네, 반갑습니다."
                      rows={4}
                      required
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-900 block mb-1">해석/번역</label>
                      <input
                        value={assetTranslation}
                        onChange={e => setAssetTranslation(e.target.value)}
                        placeholder="A: Hello.|B: Nice to meet you."
                        className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 block mb-1">카테고리</label>
                      <input
                        value={assetCategory}
                        onChange={e => setAssetCategory(e.target.value)}
                        placeholder="예: 식당, 쇼핑"
                        className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={assetSaving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {assetSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {assetSaving ? "에셋 등록 중..." : "에셋 등록하기 🚀"}
              </button>
            </form>

            {/* 기존 에셋 목록 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-black text-slate-900 text-sm">등록된 에셋 목록 ({curriculumList.length}개)</h3>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-900" /></div>
              ) : (
                <div className="space-y-2 max-h-[540px] overflow-y-auto">
                  {curriculumList.map(item => (
                    <div key={item.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 text-sm">{item.text ?? item.title ?? "—"}</p>
                            {item.has_audio ? (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded">음성 있음</span>
                            ) : (
                              <span className="text-[10px] bg-slate-200 text-slate-900 font-bold px-1.5 py-0.5 rounded">음성 없음</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-900">{item.category}{item.step ? ` · Step ${item.step}` : ""}{item.source === "ai_generated" ? " · AI생성" : ""}</p>
                          {curriculumType === "dialogue" && item.script && editingItemId !== item.id && (
                            <p className="text-xs text-slate-900 mt-1 line-clamp-2 font-mono bg-white p-2 rounded border border-slate-100">
                              {item.script}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => editingItemId === item.id ? setEditingItemId(null) : startEditItem(item)}
                            className="flex items-center gap-1 text-xs bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-bold px-2.5 py-1.5 rounded-lg transition"
                          >
                            <Edit3 size={13} />
                            {editingItemId === item.id ? "닫기" : "대사·내용 수정"}
                          </button>
                          <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg" title="삭제">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {editingItemId === item.id && (
                        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 space-y-2.5">
                          <div>
                            <label className="text-xs font-bold text-slate-900 block mb-1">
                              {curriculumType === "dialogue" ? "대화 제목" : curriculumType === "word" ? "단어" : "문장"}
                            </label>
                            <input
                              value={editItemText}
                              onChange={e => setEditItemText(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900 font-bold"
                            />
                          </div>
                          {curriculumType === "dialogue" ? (
                            <>
                              <div>
                                <label className="text-xs font-bold text-slate-900 block mb-1">대본 (파이프 | 로 줄 구분)</label>
                                <textarea
                                  value={editItemScript}
                                  onChange={e => setEditItemScript(e.target.value)}
                                  rows={4}
                                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-slate-900 block mb-1">번역 (파이프 | 로 줄 구분)</label>
                                <input
                                  value={editItemTranslation}
                                  onChange={e => setEditItemTranslation(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900"
                                />
                              </div>
                            </>
                          ) : (
                            <div>
                              <label className="text-xs font-bold text-slate-900 block mb-1">발음 표기</label>
                              <input
                                value={editItemPronunciation}
                                onChange={e => setEditItemPronunciation(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-900"
                              />
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900">목소리:</span>
                              <select
                                value={editItemVoiceId}
                                onChange={e => setEditItemVoiceId(e.target.value)}
                                className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 font-bold bg-white"
                              >
                                {ELEVENLABS_VOICES.map(v => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveEditedItem(item, false)}
                                disabled={editItemSaving}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                              >
                                💾 내용만 저장
                              </button>
                              <button
                                onClick={() => handleSaveEditedItem(item, true)}
                                disabled={editItemSaving}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 disabled:opacity-50"
                              >
                                {editItemSaving ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                수정 저장 & 음성 다시 생성
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {curriculumList.length === 0 && <p className="text-center text-slate-900 py-10">데이터 없음</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──── 사용자 ──── */}
        {activeTab === "users" && (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-slate-900">{u.alias || u.name}</p>
                  <p className="text-xs text-slate-900">{u.id} · {u.role} · 토큰: {u.tokens}</p>
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
                    <p className="font-bold text-slate-900">{c.userAlias} ({c.userId})</p>
                    <p className="text-sm text-slate-900">입금자: {c.depositor} · {c.price} → {c.amount}토큰</p>
                    <p className="text-xs text-slate-900">{c.createdAt?.toDate?.().toLocaleString()}</p>
                  </div>
                  <button onClick={() => approveCharge(c)} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-700 flex items-center gap-1">
                    <CheckCircle size={14} /> 충전 승인
                  </button>
                </div>
              </div>
            ))}
            {charges.length === 0 && <p className="text-center text-slate-900 py-12">대기 중인 충전 요청이 없습니다.</p>}
          </div>
        )}

        {/* ──── 문의 ──── */}
        {activeTab === "inquiries" && (
          <div className="space-y-3">
            {inquiries.map(i => (
              <div key={i.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded">{i.category}</span>
                  <span className="text-xs text-slate-900">{i.createdAt?.toDate?.().toLocaleString()}</span>
                </div>
                <p className="font-bold text-sm text-slate-900 mb-1">{i.userName} ({i.userId})</p>
                <p className="text-sm text-slate-900 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{i.content}</p>
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
            {inquiries.length === 0 && <p className="text-center text-slate-900 py-12">문의가 없습니다.</p>}
          </div>
        )}

      </div>
    </div>
  );
}