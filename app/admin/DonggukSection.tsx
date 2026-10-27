"use client";
// app/admin/DonggukSection.tsx
// 동국대학교 1급 학생 승인 & 문장/일레븐랩스 음성 관리

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
import type { DonggukSentenceItem } from "@/types";

interface Props {
  idToken: string;
  voices: { id: string; name: string; description: string; gender: "male" | "female" }[];
  defaultVoiceId: string;
}

interface DonggukStudent {
  email: string;
  name?: string;
  alias?: string;
  dongguk_status: "pending" | "approved";
  dongguk_student_id?: string;
  dongguk_applied_at?: any;
}

export default function DonggukSection({ idToken, voices, defaultVoiceId }: Props) {
  const [subTab, setSubTab] = useState<"students" | "sentences">("students");

  // ── 학생 상태 ─────────────────────────
  const [students, setStudents] = useState<DonggukStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // ── 문장 상태 ─────────────────────────
  const [sentences, setSentences] = useState<DonggukSentenceItem[]>([]);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPronunciation, setNewPronunciation] = useState("");
  const [newRuleFormula, setNewRuleFormula] = useState("");
  const [newChapter, setNewChapter] = useState(1);
  const [addingSentence, setAddingSentence] = useState(false);

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
      const list: DonggukStudent[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.dongguk_status === "pending" || data.dongguk_status === "approved") {
          list.push({
            email: d.id,
            name: data.name,
            alias: data.alias,
            dongguk_status: data.dongguk_status,
            dongguk_student_id: data.dongguk_student_id,
            dongguk_applied_at: data.dongguk_applied_at,
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
      await updateDoc(doc(db, "sori_users", email), { dongguk_status: status });
      setStudents(prev =>
        status === "none"
          ? prev.filter(s => s.email !== email)
          : prev.map(s => s.email === email ? { ...s, dongguk_status: status } : s)
      );
      alert(status === "approved" ? "학생이 승인되었습니다! 🎉" : "승인이 해제되었습니다.");
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
        query(collection(db, "sori_curriculum_dongguk"), orderBy("chapter", "asc"))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DonggukSentenceItem));
      setSentences(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSentences(false);
    }
  };

  // ── 문장 등록 ─────────────────────────
  const handleAddSentence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return alert("문장을 입력하세요.");
    setAddingSentence(true);
    try {
      await addDoc(collection(db, "sori_curriculum_dongguk"), {
        text: newText.trim(),
        pronunciation: newPronunciation.trim() || newText.trim(),
        rule_formula: newRuleFormula.trim() || undefined,
        chapter: Number(newChapter) || 1,
        has_audio: false,
        created_at: serverTimestamp(),
      });
      setNewText("");
      setNewPronunciation("");
      setNewRuleFormula("");
      await loadSentences();
      alert("새 문장이 등록되었습니다! 📝\n이제 아래에서 일레븐랩스로 음성을 생성할 수 있습니다.");
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
      await deleteDoc(doc(db, "sori_curriculum_dongguk", id));
      setSentences(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  };

  // ── 일레븐랩스 음성 생성 ───────────────
  const handleGenerateAudio = async (item: DonggukSentenceItem) => {
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
          colName: "sori_curriculum_dongguk",
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

  const pendingStudents = students.filter(s => s.dongguk_status === "pending");
  const approvedStudents = students.filter(s => s.dongguk_status === "approved");

  return (
    <div className="space-y-6">
      {/* 헤더 안내 */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl p-6 shadow-md flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap size={28} />
            <h2 className="text-xl font-black">동국대학교 한국어 1급 전용 관리</h2>
          </div>
          <p className="text-xs text-amber-100">
            학생들의 연결 요청을 승인하고, 1급 맞춤 문장과 일레븐랩스 정답 발음 음성을 관리합니다.
          </p>
        </div>
      </div>

      {/* 서브 탭 전환 */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setSubTab("students")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "students"
              ? "border-amber-500 text-amber-600 bg-amber-50/50"
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
              ? "border-amber-500 text-amber-600 bg-amber-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen size={18} /> 문장 등록 & 음성 생성 ({sentences.length})
        </button>
      </div>

      {/* ──────────────── 1. 학생 승인 관리 ──────────────── */}
      {subTab === "students" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
              <span>⏳</span> 승인 대기 학생 목록 ({pendingStudents.length}명)
            </h3>
            <button
              onClick={loadStudents}
              className="flex items-center gap-1 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition"
            >
              <RefreshCw size={12} /> 새로고침
            </button>
          </div>

          {loadingStudents ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-amber-500" />
            </div>
          ) : pendingStudents.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
              승인 대기 중인 학생이 없습니다.
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingStudents.map(student => (
                <div
                  key={student.email}
                  className="bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-sm flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-slate-800 text-base">
                        {student.name || student.alias || "학생"}
                      </span>
                      {student.dongguk_student_id && (
                        <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2 py-0.5 rounded-md">
                          학번/정보: {student.dongguk_student_id}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono">{student.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateStudentStatus(student.email, "approved")}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow transition"
                    >
                      <CheckCircle size={14} /> 승인하기
                    </button>
                    <button
                      onClick={() => handleUpdateStudentStatus(student.email, "none")}
                      className="flex items-center gap-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 font-bold text-xs px-3 py-2 rounded-xl transition"
                    >
                      <XCircle size={14} /> 거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 승인 완료 학생 목록 */}
          <div className="pt-6 border-t border-slate-200">
            <h3 className="font-black text-base text-slate-700 mb-3 flex items-center gap-2">
              <span>✅</span> 승인 완료된 학생 ({approvedStudents.length}명)
            </h3>
            {approvedStudents.length === 0 ? (
              <p className="text-xs text-slate-400 italic">아직 승인된 학생이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {approvedStudents.map(student => (
                  <div
                    key={student.email}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-800">{student.name || student.alias || "학생"}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">{student.email}</p>
                      {student.dongguk_student_id && (
                        <span className="text-[10px] text-amber-700 font-semibold">{student.dongguk_student_id}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleUpdateStudentStatus(student.email, "none")}
                      className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded transition"
                    >
                      권한 회수
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── 2. 문장 등록 & 일레븐랩스 음성 생성 ──────────────── */}
      {subTab === "sentences" && (
        <div className="space-y-6">
          {/* 문장 등록 폼 */}
          <form onSubmit={handleAddSentence} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-black text-base text-slate-800 flex items-center gap-2 border-b pb-3">
              <Plus size={18} className="text-amber-500" /> 동국한국어 1급 새 문장 등록
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  목표 문장 <span className="text-red-500">*</span>
                </label>
                <input
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  placeholder="예: 작년에 한국에 왔어요"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">단원 (과)</label>
                <select
                  value={newChapter}
                  onChange={e => setNewChapter(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => (
                    <option key={n} value={n}>{n}과</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  소리 나는 대로 발음표기
                </label>
                <input
                  value={newPronunciation}
                  onChange={e => setNewPronunciation(e.target.value)}
                  placeholder="예: [장년에 한구게 와써요] (미입력 시 문장 그대로)"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  초급 발음 변화 공식 (? 받침 + ? = [??])
                </label>
                <input
                  value={newRuleFormula}
                  onChange={e => setNewRuleFormula(e.target.value)}
                  placeholder="예: ㄱ 받침 + ㄴ = [ㅇ]"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addingSentence}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-xl shadow-md hover:from-amber-600 hover:to-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {addingSentence ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              문장 등록하기
            </button>
          </form>

          {/* 등록된 문장 목록 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-base text-slate-800 flex items-center gap-2">
                <BookOpen size={18} className="text-amber-500" /> 등록된 1급 문장 목록 ({sentences.length}개)
              </h3>
              <button
                onClick={loadSentences}
                className="flex items-center gap-1 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition"
              >
                <RefreshCw size={12} /> 새로고침
              </button>
            </div>

            {loadingSentences ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-amber-500" />
              </div>
            ) : sentences.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
                등록된 문장이 없습니다. 위에서 첫 번째 문장을 등록해보세요!
              </div>
            ) : (
              <div className="space-y-3">
                {sentences.map(item => (
                  <div
                    key={item.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-md">
                          {item.chapter}과
                        </span>
                        <h4 className="font-black text-slate-800 text-base">{item.text}</h4>
                      </div>
                      <p className="text-xs text-green-700 font-bold">
                        소리: {item.pronunciation}
                      </p>
                      {item.rule_formula && (
                        <p className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-mono inline-block">
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
