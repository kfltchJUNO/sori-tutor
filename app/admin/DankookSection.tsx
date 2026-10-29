"use client";
// app/admin/DankookSection.tsx
// 단국대학교 한국어 코스 학생 승인 & 문장/일레븐랩스 음성 관리

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import {
  GraduationCap, Users, BookOpen, Plus, Trash2, Volume2,
  Loader2, CheckCircle, XCircle, RefreshCw, Music, Sparkles,
} from "lucide-react";
import type { DankookSentenceItem } from "@/types";

interface Props {
  idToken: string;
  voices: { id: string; name: string; description: string; gender: "male" | "female" }[];
  defaultVoiceId: string;
}

interface DankookStudent {
  email: string;
  name?: string;
  alias?: string;
  dankook_status: "pending" | "approved";
  dankook_student_id?: string;
  dankook_applied_at?: any;
}

export default function DankookSection({ idToken, voices, defaultVoiceId }: Props) {
  const [subTab, setSubTab] = useState<"students" | "sentences">("students");

  // ── 학생 상태 ─────────────────────────
  const [students, setStudents] = useState<DankookStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // ── 문장 상태 ─────────────────────────
  const [sentences, setSentences] = useState<DankookSentenceItem[]>([]);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPronunciation, setNewPronunciation] = useState("");
  const [newRuleFormula, setNewRuleFormula] = useState("");
  const [newMeaningKo, setNewMeaningKo] = useState("");
  const [newChapter, setNewChapter] = useState(1);
  const [addingSentence, setAddingSentence] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // ── 음성 생성 상태 ─────────────────────
  const [generatingVoiceId, setGeneratingVoiceId] = useState<string | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── 1. 학생 목록 불러오기 ───────────────
  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const snap = await getDocs(collection(db, "sori_users"));
      const list: DankookStudent[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.dankook_status === "pending" || data.dankook_status === "approved") {
          list.push({
            email: d.id,
            name: data.name,
            alias: data.alias,
            dankook_status: data.dankook_status,
            dankook_student_id: data.dankook_student_id,
            dankook_applied_at: data.dankook_applied_at,
          });
        }
      });
      setStudents(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStudents(false);
    }
  };

  // ── 학생 승인 / 해제 ───────────────────
  const handleUpdateStudentStatus = async (email: string, status: "approved" | "none") => {
    try {
      await updateDoc(doc(db, "sori_users", email), { dankook_status: status });
      setStudents(prev =>
        status === "none"
          ? prev.filter(s => s.email !== email)
          : prev.map(s => s.email === email ? { ...s, dankook_status: status } : s)
      );
      alert(status === "approved" ? "단국대 학생이 승인되었습니다! 🐻🎉" : "승인이 해제되었습니다.");
    } catch (e) {
      console.error(e);
      alert("상태 변경 실패");
    }
  };

  // ── 2. 문장 목록 불러오기 ───────────────
  const loadSentences = async () => {
    setLoadingSentences(true);
    try {
      const snap = await getDocs(
        query(collection(db, "sori_curriculum_dankook"), orderBy("chapter", "asc"))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DankookSentenceItem));
      setSentences(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSentences(false);
    }
  };

  // ── AI 발음/규칙 공식 자동 분석 ───
  const handleAIAutoFill = async () => {
    if (!newText.trim()) return alert("먼저 분석할 문장을 입력해 주세요.");
    setAiAnalyzing(true);
    try {
      const res = await fetch("/api/admin/pronunciation-helper", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: newText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.pronunciation) setNewPronunciation(data.pronunciation);
      if (data.rule_formula) setNewRuleFormula(data.rule_formula);
      if (data.meaning_ko) setNewMeaningKo(data.meaning_ko);
      alert("✨ AI 발음 분석 완료!\n자동 입력된 발음 표기, 규칙, 의미를 확인하고 필요시 수정한 뒤 등록해 주세요.");
    } catch (e: any) {
      console.error(e);
      alert(`AI 분석 실패: ${e.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // ── 문장 등록 ─────────────────────────
  const handleAddSentence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return alert("문장을 입력하세요.");
    setAddingSentence(true);
    try {
      await addDoc(collection(db, "sori_curriculum_dankook"), {
        text: newText.trim(),
        pronunciation: newPronunciation.trim() || newText.trim(),
        rule_formula: newRuleFormula.trim() || "",
        meaning_ko: newMeaningKo.trim() || "",
        chapter: Number(newChapter) || 1,
        has_audio: false,
        created_at: serverTimestamp(),
      });
      setNewText("");
      setNewPronunciation("");
      setNewRuleFormula("");
      setNewMeaningKo("");
      await loadSentences();
      alert("단국대 문장이 등록되었습니다! 📝\n이제 아래에서 일레븐랩스로 음성을 생성할 수 있습니다.");
    } catch (e) {
      console.error(e);
      alert("문장 등록 실패");
    } finally {
      setAddingSentence(false);
    }
  };

  // ── 문장 삭제 ─────────────────────────
  const handleDeleteSentence = async (id: string) => {
    if (!confirm("이 문장을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "sori_curriculum_dankook", id));
      setSentences(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  };

  // ── 일레븐랩스 음성 생성 ───────────────
  const handleGenerateAudio = async (item: DankookSentenceItem) => {
    const voiceId = selectedVoices[item.id] || defaultVoiceId;
    setGeneratingVoiceId(item.id);
    try {
      const res = await fetch("/api/admin/generate-audio", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          docId: item.id,
          colName: "sori_curriculum_dankook",
          text: item.pronunciation || item.text,
          voiceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 로컬 상태 즉시 반영
      setSentences(prev =>
        prev.map(s => s.id === item.id ? { ...s, audio_path: data.audio_path, has_audio: true } : s)
      );
      alert("🎉 일레븐랩스 음성 생성 및 저장이 완료되었습니다!");
    } catch (e: any) {
      console.error(e);
      alert(`음성 생성 실패: ${e.message}`);
    } finally {
      setGeneratingVoiceId(null);
    }
  };

  // ── 오디오 미리듣기 ───────────────────
  const handlePlayAudio = (url?: string, id?: string) => {
    if (!url) return;
    if (audioRef.current && playingId === id) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(id ?? null);
    audio.onended = () => { audioRef.current = null; setPlayingId(null); };
    audio.play().catch(() => setPlayingId(null));
  };

  useEffect(() => {
    loadStudents();
    loadSentences();
  }, []);

  const pendingStudents = students.filter(s => s.dankook_status === "pending");
  const approvedStudents = students.filter(s => s.dankook_status === "approved");

  return (
    <div className="space-y-6">
      {/* 헤더 안내 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-6 shadow-md flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl">🐻</span>
            <h2 className="text-xl font-black">단국대학교 전용 관리</h2>
          </div>
          <p className="text-xs text-blue-100">
            단국대학교 학생들의 연결 요청을 승인하고, 전용 문장과 일레븐랩스 정답 발음 음성을 관리합니다. (인증 학생은 전액 무료)
          </p>
        </div>
      </div>

      {/* 학생 배포용 QR 코드 카드 */}
      <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs shrink-0">
          <img
            src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=https://sori-tutor.vercel.app/dankook"
            alt="단국대 전용 QR코드"
            className="w-28 h-28"
          />
        </div>
        <div className="space-y-2 flex-1 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="text-xs font-black bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
              학생 배포 전용
            </span>
            <h3 className="font-black text-slate-800 text-sm">단국대 학생 전용 페이지 QR 코드</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            학생들에게 이 QR 코드 또는 링크를 주시면, <strong>단국대학교 전용 화면</strong>으로 즉시 연결됩니다.<br />
            (학생이 인증 요청을 보내면 아래 '학생 승인 관리'에서 승인해 주시면 됩니다.)
          </p>
          <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
            <input
              readOnly
              value="https://sori-tutor.vercel.app/dankook"
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 font-mono w-56 select-all"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText("https://sori-tutor.vercel.app/dankook");
                alert("단국대 전용 페이지 링크가 복사되었습니다! 📋");
              }}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg transition"
            >
              링크 복사
            </button>
            <a
              href="/dankook"
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition"
            >
              페이지 열기 ↗
            </a>
          </div>
        </div>
      </div>

      {/* 서브 탭 전환 */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setSubTab("students")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "students"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users size={18} /> 학생 승인 관리
          {pendingStudents.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
              {pendingStudents.length}명 대기
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("sentences")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "sentences"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen size={18} /> 문장 및 음성 관리 ({sentences.length})
        </button>
      </div>

      {/* ── 탭 1: 학생 승인 관리 ── */}
      {subTab === "students" && (
        <div className="space-y-6">
          {/* 대기 중인 학생 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                승인 대기 학생 ({pendingStudents.length}명)
              </h3>
              <button
                onClick={loadStudents}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <RefreshCw size={12} className={loadingStudents ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>

            {loadingStudents ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                불러오는 중...
              </div>
            ) : pendingStudents.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">승인 대기 중인 학생이 없습니다.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingStudents.map(student => (
                  <div key={student.email} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">
                          {student.name || student.alias || "학습자"}
                        </span>
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-mono">
                          {student.dankook_student_id || "학번 미입력"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{student.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStudentStatus(student.email, "approved")}
                        className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm transition"
                      >
                        <CheckCircle size={14} /> 승인하기
                      </button>
                      <button
                        onClick={() => handleUpdateStudentStatus(student.email, "none")}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl flex items-center gap-1 transition"
                      >
                        <XCircle size={14} /> 거절
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 승인 완료 학생 목록 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
              승인 완료 학생 ({approvedStudents.length}명)
            </h3>
            {approvedStudents.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">승인된 학생이 없습니다.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {approvedStudents.map(student => (
                  <div key={student.email} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">
                          {student.name || student.alias || "학습자"}
                        </span>
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-mono">
                          {student.dankook_student_id || "학번 미입력"}
                        </span>
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-md">
                          승인됨
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{student.email}</p>
                    </div>
                    <button
                      onClick={() => handleUpdateStudentStatus(student.email, "none")}
                      className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1 rounded-lg border border-red-200 hover:bg-red-50 transition"
                    >
                      승인 해제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 탭 2: 문장 & 일레븐랩스 음성 관리 ── */}
      {subTab === "sentences" && (
        <div className="space-y-6">
          {/* 새 문장 등록 폼 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <Plus size={18} className="text-blue-600" />
              새 단국대 문장 등록
            </h3>
            <p className="text-xs text-slate-500">
              쉬운 규칙 표기(예: <code>국 + 대 = 꾹때 (된소리)</code>)와 소리나는 표기를 입력하면 초급 학생이 직관적으로 이해할 수 있습니다.
            </p>

            <form onSubmit={handleAddSentence} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    연습할 문장 (원문) <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAIAutoFill}
                    disabled={aiAnalyzing || !newText.trim()}
                    className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {aiAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {aiAnalyzing ? "AI 분석 중..." : "AI 발음·규칙·의미 자동완성"}
                  </button>
                </div>
                <input
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  placeholder="예: 단국대학교에서 한국어를 배워요"
                  required
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">소리나는 대로 발음 표기 *</label>
                <input
                  value={newPronunciation}
                  onChange={e => setNewPronunciation(e.target.value)}
                  placeholder="예: [단국때학꾜에서 한구거를 배워요]"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  쉬운 규칙 설명 (받침 + ? = ??)
                </label>
                <input
                  value={newRuleFormula}
                  onChange={e => setNewRuleFormula(e.target.value)}
                  placeholder="예: 국[ㄱ] + 대[ㄷ] = 때 (된소리되기)"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">문장 의미 (선택)</label>
                <input
                  value={newMeaningKo}
                  onChange={e => setNewMeaningKo(e.target.value)}
                  placeholder="예: 단국대학교에서 한국어를 배웁니다."
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">단원 (과/Chapter)</label>
                <input
                  type="number"
                  min={1}
                  value={newChapter}
                  onChange={e => setNewChapter(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="md:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={addingSentence}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {addingSentence ? "등록 중..." : "문장 등록하기 🚀"}
                </button>
              </div>
            </form>
          </div>

          {/* 문장 목록 & 일레븐랩스 음성 생성 목록 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Music size={18} className="text-blue-600" />
                단국대 코스 문장 목록 ({sentences.length}개)
              </h3>
              <button
                onClick={loadSentences}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <RefreshCw size={12} className={loadingSentences ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>

            {loadingSentences ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                불러오는 중...
              </div>
            ) : sentences.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">등록된 단국대 문장이 없습니다. 위에서 등록해 주세요.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sentences.map(item => (
                  <div key={item.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-[11px] font-black px-2 py-0.5 rounded-md">
                          {item.chapter}과
                        </span>
                        <h4 className="font-black text-slate-800 text-base">{item.text}</h4>
                      </div>
                      <p className="text-xs text-green-700 font-bold">
                        소리: {item.pronunciation}
                      </p>
                      {item.rule_formula && (
                        <p className="text-xs text-blue-800 bg-blue-50 px-2 py-0.5 rounded font-mono inline-block">
                          📌 규칙: {item.rule_formula}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {item.audio_path ? (
                        <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-xl border border-green-200">
                          <button
                            onClick={() => handlePlayAudio(item.audio_path, item.id)}
                            className="flex items-center gap-1 text-xs font-bold text-green-700 hover:text-green-900"
                          >
                            <Volume2 size={14} />
                            {playingId === item.id ? "정지" : "미리듣기"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">음성 없음</span>
                      )}

                      {/* 일레븐랩스 보이스 선택 & 생성 버튼 */}
                      <select
                        value={selectedVoices[item.id] || defaultVoiceId}
                        onChange={e => setSelectedVoices(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-lg p-1.5 bg-white font-medium"
                      >
                        {voices.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleGenerateAudio(item)}
                        disabled={generatingVoiceId === item.id}
                        className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                      >
                        {generatingVoiceId === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} />
                        )}
                        {item.audio_path ? "음성 재생성" : "일레븐랩스 음성 생성"}
                      </button>

                      <button
                        onClick={() => handleDeleteSentence(item.id)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                        title="문장 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
