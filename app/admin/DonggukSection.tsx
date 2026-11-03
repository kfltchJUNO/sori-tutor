"use client";
// app/admin/DonggukSection.tsx
// 동국대학교 1급 학생 승인 & 문장/일레븐랩스 음성 관리

import { useEffect, useState, useRef } from "react";
import { db, adminFetch } from "@/lib/firebase";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import {
  GraduationCap, Users, BookOpen, Plus, Trash2, Volume2,
  Loader2, CheckCircle, XCircle, RefreshCw, Music, Sparkles, BarChart3, Bell
} from "lucide-react";
import type { DonggukSentenceItem } from "@/types";
import StudentHistoryPanel from "./StudentHistoryPanel";
import NotificationSenderModal from "./NotificationSenderModal";

interface Props {
  idToken: string;
  voices: { id: string; name: string; description: string; gender: "male" | "female" }[];
  defaultVoiceId: string;
}

interface DonggukStudent {
  email: string;
  name?: string;
  alias?: string;
  status: "pending" | "approved";
  student_id?: string;
  applied_at?: any;
}

export default function DonggukSection({ idToken, voices, defaultVoiceId }: Props) {
  const [level, setLevel] = useState<1 | 3>(1);
  const [subTab, setSubTab] = useState<"students" | "sentences" | "records">("students");
  const [historyTargetEmail, setHistoryTargetEmail] = useState<string | null>(null);
  const [showNotiModal, setShowNotiModal] = useState(false);
  const [notiTargetEmail, setNotiTargetEmail] = useState<string | null>(null);

  const currentColName = level === 1 ? "sori_curriculum_dongguk" : "sori_curriculum_dongguk3";
  const statusField = level === 1 ? "dongguk_status" : "dongguk3_status";
  const studentIdField = level === 1 ? "dongguk_student_id" : "dongguk3_student_id";
  const appliedAtField = level === 1 ? "dongguk_applied_at" : "dongguk3_applied_at";
  const portalUrl =
    level === 1
      ? "https://sori-tutor.vercel.app/dongguk"
      : "https://sori-tutor.vercel.app/dongguk3";
  const portalPath = level === 1 ? "/dongguk" : "/dongguk3";
  const levelLabel = level === 1 ? "1급" : "3급";

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
  const [newVoiceId, setNewVoiceId] = useState(defaultVoiceId);
  const [autoGenerateVoice, setAutoGenerateVoice] = useState(true);
  const [addingSentence, setAddingSentence] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // ── 음성 생성 & 미리듣기 상태 ─────────────────────
  const [newPreviewBase64, setNewPreviewBase64] = useState<string | null>(null);
  const [newPreviewing, setNewPreviewing] = useState(false);
  const [generatingVoiceId, setGeneratingVoiceId] = useState<string | null>(null);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [previewAudioMap, setPreviewAudioMap] = useState<Record<string, string>>({});
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
        const st = data[statusField];
        if (st === "pending" || st === "approved") {
          list.push({
            email: d.id,
            name: data.name,
            alias: data.alias,
            status: st,
            student_id: data[studentIdField],
            applied_at: data[appliedAtField],
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
  const handleUpdateStudentStatus = async (email: string, nextStatus: "approved" | "none") => {
    try {
      await updateDoc(doc(db, "sori_users", email), { [statusField]: nextStatus });
      setStudents(prev =>
        nextStatus === "none"
          ? prev.filter(s => s.email !== email)
          : prev.map(s => (s.email === email ? { ...s, status: nextStatus } : s))
      );
      alert(nextStatus === "approved" ? "학생이 승인되었습니다! 🎉" : "승인이 해제되었습니다.");
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
        query(collection(db, currentColName), orderBy("chapter", "asc"))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DonggukSentenceItem));
      setSentences(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSentences(false);
    }
  };

  // ── AI 발음/규칙 공식 자동 분석 ───
  const handleAIAutoFill = async () => {
    if (!newText.trim()) return alert("먼저 목표 문장을 입력해 주세요.");
    setAiAnalyzing(true);
    try {
      const res = await adminFetch("/api/admin/pronunciation-helper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: newText.trim() }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.pronunciation) setNewPronunciation(data.pronunciation);
      if (data.rule_formula) setNewRuleFormula(data.rule_formula);
      alert("✨ AI 발음 분석 완료!\n자동 입력된 발음 표기와 쉬운 규칙을 확인하고 필요시 수정한 뒤 등록해 주세요.");
    } catch (e: any) {
      console.error(e);
      alert(`AI 분석 실패: ${e.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // ── 새 문장 등록 전 음성 미리듣기 생성 ─────────
  const handlePreviewNewSentenceVoice = async () => {
    if (!newText.trim()) return alert("먼저 목표 문장을 입력해 주세요.");
    setNewPreviewing(true);
    try {
      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          text: newText.trim(),
          voiceId: newVoiceId,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewPreviewBase64(data.audioBase64);
      new Audio(`data:audio/mp3;base64,${data.audioBase64}`).play().catch(() => {});
    } catch (e: any) {
      alert(`미리듣기 생성 실패: ${e.message}`);
    } finally {
      setNewPreviewing(false);
    }
  };

  // ── 문장 등록 (미리 들어본 음성이 있으면 그대로 저장) ─────────
  const handleAddSentence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return alert("문장을 입력하세요.");
    setAddingSentence(true);
    try {
      const docRef = await addDoc(collection(db, currentColName), {
        text: newText.trim(),
        pronunciation: newPronunciation.trim() || newText.trim(),
        rule_formula: newRuleFormula.trim() || "",
        chapter: Number(newChapter) >= 0 ? Number(newChapter) : 0,
        level: level,
        voice_id: newVoiceId,
        has_audio: false,
        created_at: serverTimestamp(),
      });

      if (newPreviewBase64 || autoGenerateVoice) {
        const res = await adminFetch("/api/admin/generate-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "save",
            docId: docRef.id,
            colName: currentColName,
            text: newText.trim(),
            voiceId: newVoiceId,
            audioBase64: newPreviewBase64 || undefined,
          }),
        }, idToken);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Auto audio gen error:", errData);
        }
      }

      setNewText("");
      setNewPronunciation("");
      setNewRuleFormula("");
      setNewPreviewBase64(null);
      await loadSentences();
      alert(
        newPreviewBase64 || autoGenerateVoice
          ? "새 문장과 선택한 성우의 음성이 함께 등록되었습니다! 🎉"
          : "새 문장이 등록되었습니다! 📝\n이제 아래에서 일레븐랩스로 음성을 생성할 수 있습니다."
      );
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
      await deleteDoc(doc(db, currentColName, id));
      setSentences(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  };

  // ── 1단계: 일레븐랩스 음성 생성 (미리듣기 — 저장 전 들어보기) ───────
  const handleGeneratePreview = async (item: DonggukSentenceItem) => {
    const voiceId = selectedVoices[item.id] || (item as any).voice_id || defaultVoiceId;
    setGeneratingVoiceId(item.id);
    try {
      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          text: item.text,
          voiceId,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreviewAudioMap(prev => ({ ...prev, [item.id]: data.audioBase64 }));
      new Audio(`data:audio/mp3;base64,${data.audioBase64}`).play().catch(() => {});
    } catch (e: any) {
      console.error(e);
      alert(`음성 생성 실패: ${e.message}`);
    } finally {
      setGeneratingVoiceId(null);
    }
  };

  // ── 2단계: 들어본 음성을 확정 저장 ───────────────
  const handleConfirmSaveAudio = async (item: DonggukSentenceItem) => {
    const base64 = previewAudioMap[item.id];
    if (!base64) return;
    const voiceId = selectedVoices[item.id] || (item as any).voice_id || defaultVoiceId;
    setSavingVoiceId(item.id);
    try {
      const res = await adminFetch("/api/admin/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          docId: item.id,
          colName: currentColName,
          text: item.text,
          voiceId,
          audioBase64: base64,
        }),
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newAudioUrl = data.audio_path || data.url;
      setSentences(prev =>
        prev.map(s => s.id === item.id ? { ...s, audio_path: newAudioUrl, voice_id: voiceId, has_audio: true } as any : s)
      );
      setPreviewAudioMap(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      alert("✅ 음성이 저장되었습니다!");
    } catch (e: any) {
      console.error(e);
      alert(`음성 저장 실패: ${e.message}`);
    } finally {
      setSavingVoiceId(null);
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
  }, [level]);

  const pendingStudents = students.filter(s => s.status === "pending");
  const approvedStudents = students.filter(s => s.status === "approved");

  return (
    <div className="space-y-6">
      {/* ── 0. 급수 선택 (1급 / 3급 슬롯) ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1.5 bg-amber-100/70 rounded-2xl border border-amber-200 shadow-xs">
          <button
            type="button"
            onClick={() => setLevel(1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
              level === 1
                ? "bg-white text-amber-900 shadow-sm"
                : "text-amber-800 hover:text-amber-950"
            }`}
          >
            <span>🌱</span> 동국한국어 1급
          </button>
          <button
            type="button"
            onClick={() => setLevel(3)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
              level === 3
                ? "bg-orange-600 text-white shadow-sm"
                : "text-amber-800 hover:text-amber-950"
            }`}
          >
            <span>🌿</span> 동국한국어 3급
          </button>
        </div>

        <div className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
          현재 선택: <strong className="text-amber-700 font-black">동국한국어 {levelLabel}</strong> ({currentColName})
        </div>
      </div>

      {/* 헤더 안내 */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap size={28} />
            <h2 className="text-xl font-black">동국대학교 한국어 {levelLabel} 전용 관리</h2>
          </div>
          <p className="text-xs text-amber-100">
            학생들의 {levelLabel} 연결 요청을 승인하고, {levelLabel} 맞춤 문장과 일레븐랩스 정답 발음 음성을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => {
            setNotiTargetEmail(null);
            setShowNotiModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-amber-900 hover:bg-amber-50 font-black text-xs rounded-xl shadow-sm transition shrink-0"
        >
          <Bell size={15} className="text-amber-600" /> {levelLabel} 학생 알림 발송 / 예약
        </button>
      </div>

      {/* 학생 배포용 QR 코드 카드 */}
      <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs shrink-0">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${portalUrl}`}
            alt={`동국대 ${levelLabel} 전용 QR코드`}
            className="w-28 h-28"
          />
        </div>
        <div className="space-y-2 flex-1 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="text-xs font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
              학생 배포 전용 ({levelLabel})
            </span>
            <h3 className="font-black text-slate-900 text-sm">
              동국대 {levelLabel} 학생 전용 페이지 QR 코드
            </h3>
          </div>
          <p className="text-xs text-slate-900 leading-relaxed">
            학생들에게 이 QR 코드 또는 링크를 주시면, <strong>동국한국어 {levelLabel} 전용 화면</strong>으로 즉시 연결됩니다.<br />
            (학생이 인증 요청을 보내면 아래 &apos;학생 승인 관리&apos;에서 승인해 주시면 됩니다.)
          </p>
          <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
            <input
              readOnly
              value={portalUrl}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono w-64 select-all"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                alert(`동국대 ${levelLabel} 전용 페이지 링크가 복사되었습니다! 📋`);
              }}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg transition"
            >
              링크 복사
            </button>
            <a
              href={portalPath}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold px-3 py-1.5 rounded-lg transition"
            >
              페이지 열기 ↗
            </a>
          </div>
        </div>
      </div>

      {/* 서브 탭 전환 */}
      <div className="flex border-b border-slate-200 flex-wrap">
        <button
          onClick={() => setSubTab("students")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "students"
              ? "border-amber-500 text-amber-600 bg-amber-50/50"
              : "border-transparent text-slate-900 hover:text-slate-900"
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
          onClick={() => {
            setHistoryTargetEmail(null);
            setSubTab("records");
          }}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "records"
              ? "border-amber-500 text-amber-600 bg-amber-50/50"
              : "border-transparent text-slate-900 hover:text-slate-900"
          }`}
        >
          <BarChart3 size={18} /> 학생 학습 기록 ({approvedStudents.length}명)
        </button>
        <button
          onClick={() => setSubTab("sentences")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm border-b-2 transition ${
            subTab === "sentences"
              ? "border-amber-500 text-amber-600 bg-amber-50/50"
              : "border-transparent text-slate-900 hover:text-slate-900"
          }`}
        >
          <BookOpen size={18} /> 문장 등록 & 음성 생성 ({sentences.length})
        </button>
      </div>

      {/* ──────────────── 1. 학생 승인 관리 ──────────────── */}
      {subTab === "students" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
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
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-900 text-sm">
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
                      <span className="font-black text-slate-900 text-base">
                        {student.name || student.alias || "학생"}
                      </span>
                      {student.student_id && (
                        <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2 py-0.5 rounded-md">
                          학번/정보: {student.student_id}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-900 font-mono">{student.email}</p>
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
                      className="flex items-center gap-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-900 font-bold text-xs px-3 py-2 rounded-xl transition"
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
            <h3 className="font-black text-base text-slate-900 mb-3 flex items-center gap-2">
              <span>✅</span> 승인 완료된 학생 ({approvedStudents.length}명)
            </h3>
            {approvedStudents.length === 0 ? (
              <p className="text-xs text-slate-900 italic">아직 승인된 학생이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {approvedStudents.map(student => (
                  <div
                    key={student.email}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900">{student.name || student.alias || "학생"}</p>
                      <p className="text-[11px] text-slate-900 font-mono truncate max-w-[200px]">{student.email}</p>
                      {student.student_id && (
                        <span className="text-[10px] text-amber-700 font-semibold">{student.student_id}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setHistoryTargetEmail(student.email);
                          setSubTab("records");
                        }}
                        className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                      >
                        <BarChart3 size={12} /> 학습 기록
                      </button>
                      <button
                        onClick={() => {
                          setNotiTargetEmail(student.email);
                          setShowNotiModal(true);
                        }}
                        className="text-xs bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 p-1.5 rounded-lg transition"
                        title="이 학생에게 알림 보내기"
                      >
                        <Bell size={13} />
                      </button>
                      <button
                        onClick={() => handleUpdateStudentStatus(student.email, "none")}
                        className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded transition"
                      >
                        권한 회수
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── 1-2. 학생 학습 기록 조회 ──────────────── */}
      {subTab === "records" && (
        <StudentHistoryPanel
          univ={level === 1 ? "dongguk" : "dongguk3"}
          idToken={idToken}
          initialStudentEmail={historyTargetEmail}
        />
      )}

      {/* ──────────────── 2. 문장 등록 & 일레븐랩스 음성 생성 ──────────────── */}
      {subTab === "sentences" && (
        <div className="space-y-6">
          {/* 문장 등록 폼 */}
          <form onSubmit={handleAddSentence} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2 border-b pb-3">
              <Plus size={18} className="text-amber-500" /> 동국한국어 {levelLabel} 새 문장 등록
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-900">
                    목표 문장 <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAIAutoFill}
                    disabled={aiAnalyzing || !newText.trim()}
                    className="flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {aiAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {aiAnalyzing ? "AI 분석 중..." : "AI 발음·규칙 자동완성"}
                  </button>
                </div>
                <input
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  placeholder="예: 작년에 한국에 왔어요"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">단원 (과)</label>
                <select
                  value={newChapter}
                  onChange={e => setNewChapter(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                >
                  <option value={0}>과 미배정 (공통/기타)</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(n => (
                    <option key={n} value={n}>{n}과</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">
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
                <label className="text-xs font-bold text-slate-900 block mb-1">
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

            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenerateVoice}
                    onChange={e => setAutoGenerateVoice(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  일레븐랩스 정답 음성 포함
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">목소리 선택:</span>
                  <select
                    value={newVoiceId}
                    onChange={e => {
                      setNewVoiceId(e.target.value);
                      setNewPreviewBase64(null);
                    }}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-bold text-slate-900"
                  >
                    {voices.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handlePreviewNewSentenceVoice}
                    disabled={newPreviewing || !newText.trim()}
                    className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-xs transition disabled:opacity-50"
                  >
                    {newPreviewing ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                    {newPreviewBase64 ? "🔄 음성 재생성" : "🎧 음성 먼저 생성해 들어보기"}
                  </button>
                </div>
              </div>

              {newPreviewBase64 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-indigo-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-indigo-700">🎧 미리듣기 완료:</span>
                    <audio src={`data:audio/mp3;base64,${newPreviewBase64}`} controls className="h-8 w-52" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      ✓ 아래 [문장 등록하기]를 누르면 이 음성이 그대로 저장됩니다!
                    </span>
                    <button
                      type="button"
                      onClick={handlePreviewNewSentenceVoice}
                      disabled={newPreviewing}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold px-2.5 py-1 rounded-lg"
                    >
                      🔄 재생성
                    </button>
                  </div>
                </div>
              )}
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
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <BookOpen size={18} className="text-amber-500" /> 등록된 {levelLabel} 문장 목록 ({sentences.length}개)
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
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-900 text-sm">
                등록된 문장이 없습니다. 위에서 첫 번째 문장을 등록해보세요!
              </div>
            ) : (
              <div className="space-y-3">
                {sentences.map(item => (
                  <div
                    key={item.id}
                    className={`bg-white p-4 rounded-2xl border shadow-sm space-y-3 ${
                      previewAudioMap[item.id] ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-md">
                            {item.chapter ? `${item.chapter}과` : "과 미배정"}
                          </span>
                          <h4 className="font-black text-slate-900 text-base">{item.text}</h4>
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
                              {playingId === item.id ? "정지" : "저장된 음성 듣기"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">음성 없음</span>
                        )}

                        {/* 일레븐랩스 보이스 선택 & 생성(미리듣기) 버튼 */}
                        <select
                          value={selectedVoices[item.id] || (item as any).voice_id || defaultVoiceId}
                          onChange={e => setSelectedVoices(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="text-xs border border-slate-200 rounded-lg p-1.5 bg-white font-medium text-slate-900"
                        >
                          {voices.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => handleGeneratePreview(item)}
                          disabled={generatingVoiceId === item.id || savingVoiceId === item.id}
                          className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                        >
                          {generatingVoiceId === item.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Volume2 size={12} />
                          )}
                          {previewAudioMap[item.id] ? "🔄 재생성" : item.audio_path ? "🎧 새로 생성해 들어보기" : "🎧 음성 생성해 들어보기"}
                        </button>

                        <button
                          onClick={() => handleDeleteSentence(item.id)}
                          className="p-2 text-slate-900 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                          title="문장 삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* 미리듣기 후 [저장] 또는 [재생성] 선택 영역 */}
                    {previewAudioMap[item.id] && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50/80 rounded-xl border border-indigo-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-indigo-800">🎧 방금 생성된 음성:</span>
                          <audio src={`data:audio/mp3;base64,${previewAudioMap[item.id]}`} controls className="h-8 w-52" />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleGeneratePreview(item)}
                            disabled={generatingVoiceId === item.id || savingVoiceId === item.id}
                            className="flex items-center gap-1 text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-bold px-3 py-1.5 rounded-lg"
                          >
                            <RefreshCw size={12} className={generatingVoiceId === item.id ? "animate-spin" : ""} /> 다시 생성
                          </button>
                          <button
                            onClick={() => handleConfirmSaveAudio(item)}
                            disabled={savingVoiceId === item.id || generatingVoiceId === item.id}
                            className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3.5 py-1.5 rounded-lg shadow-xs disabled:opacity-50"
                          >
                            {savingVoiceId === item.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            💾 이 음성으로 확정 저장
                          </button>
                          <button
                            onClick={() => setPreviewAudioMap(prev => { const c = { ...prev }; delete c[item.id]; return c; })}
                            className="text-xs text-slate-900 hover:underline px-1.5"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 학습 독려 알림 / 예약 모달 */}
      <NotificationSenderModal
        isOpen={showNotiModal}
        onClose={() => setShowNotiModal(false)}
        idToken={idToken}
        defaultTargetType={level === 1 ? "dongguk" : "dongguk3"}
        initialStudentEmail={notiTargetEmail}
      />
    </div>
  );
}
