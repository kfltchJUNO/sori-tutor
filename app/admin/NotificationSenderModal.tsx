"use client";
// app/admin/NotificationSenderModal.tsx
// 관리자 페이지: 인증 학생 대상 "공부할 시간이에요" 알림/알람 발송 모달 (즉시 발송 및 예약 발송 지원)

import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  Bell, X, Send, Clock, Calendar, CheckCircle2,
  AlertCircle, Loader2, Sparkles, Trash2, RefreshCw, BookmarkPlus
} from "lucide-react";
import type { ScheduledNotification } from "@/app/api/admin/send-notification/route";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  idToken: string;
  defaultTargetType?: "dongguk" | "dongguk3" | "dankook" | "all_approved";
  initialStudentEmail?: string | null;
}

export interface NotiTemplate {
  id?: string;
  label: string;
  title: string;
  content: string;
  isCustom?: boolean;
}

// ── 초급 유학생을 위한 친절하고 쉬운 기본 알림 멘트 6종 ──
const DEFAULT_TEMPLATES: NotiTemplate[] = [
  {
    label: "⏰ 공부할 시간",
    title: "⏰ 한국어 공부할 시간이에요!",
    content: "오늘도 5분만 한국어로 소리 내어 말해볼까요? 지금 바로 시작해보세요! 😊",
  },
  {
    label: "🗣️ 발음 연습하기",
    title: "🗣️ 오늘의 발음 연습을 시작해볼까요?",
    content: "선생님과 함께 소리 내어 읽어봐요! 하루 한 문장씩 읽으면 발음이 점점 좋아져요. 👍",
  },
  {
    label: "🌟 새 문장 도착",
    title: "🌟 새로운 연습 문장이 준비되었어요!",
    content: "새로운 단원 문장이 추가되었습니다. 소리를 들어보고 내 발음 점수도 확인해봐요! 🎯",
  },
  {
    label: "👏 오늘도 힘내요",
    title: "👏 오늘도 힘내서 연습해봐요!",
    content: "틀려도 괜찮아요! 소리 내어 말할수록 한국어 실력이 쑥쑥 늘어요. 파이팅! 💪",
  },
  {
    label: "🌙 자기 전 3분",
    title: "🌙 자기 전에 3분만 복습해볼까요?",
    content: "오늘 배운 문장을 한 번만 다시 읽어보고 잠자리에 들어요. 내일 더 자연스러워질 거예요! ✨",
  },
  {
    label: "🌈 주말 짬 연습",
    title: "🌈 주말에도 잠깐 연습해봐요!",
    content: "바쁘더라도 잠깐 짬을 내어 한 문장만 말해볼까요? 꾸준히 연습하는 여러분이 최고예요! 🏆",
  },
];

export default function NotificationSenderModal({
  isOpen,
  onClose,
  idToken,
  defaultTargetType = "all_approved",
  initialStudentEmail = null,
}: Props) {
  const [activeTab, setActiveTab] = useState<"send" | "scheduled">("send");

  // 발송 폼 상태
  const [targetType, setTargetType] = useState<"all_approved" | "dongguk" | "dongguk3" | "dankook" | "individual">(
    initialStudentEmail ? "individual" : defaultTargetType
  );
  const [targetEmail, setTargetEmail] = useState(initialStudentEmail || "");
  const [title, setTitle] = useState(DEFAULT_TEMPLATES[0].title);
  const [content, setContent] = useState(DEFAULT_TEMPLATES[0].content);
  const [link, setLink] = useState(
    defaultTargetType === "dongguk" ? "/dongguk" : defaultTargetType === "dongguk3" ? "/dongguk3" : defaultTargetType === "dankook" ? "/dankook" : ""
  );

  // 템플릿 선택 및 커스텀 저장 상태
  const [customTemplates, setCustomTemplates] = useState<NotiTemplate[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sori_custom_noti_templates");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [selectedTemplateLabel, setSelectedTemplateLabel] = useState<string>(DEFAULT_TEMPLATES[0].label);
  const [showSaveCustomDialog, setShowSaveCustomDialog] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState("");

  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState(() => {
    // 기본 예약 일시: 내일 오전 9시
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const hh = String(tomorrow.getHours()).padStart(2, "0");
    const min = String(tomorrow.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  });

  const [sending, setSending] = useState(false);
  const [scheduledList, setScheduledList] = useState<ScheduledNotification[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialStudentEmail) {
      setTargetType("individual");
      setTargetEmail(initialStudentEmail);
    } else {
      setTargetType(defaultTargetType);
    }
  }, [initialStudentEmail, defaultTargetType]);

  // 템플릿 클릭 시 입력창에 불러와 수정 가능하도록 설정
  const handleSelectTemplate = (tmpl: NotiTemplate) => {
    setTitle(tmpl.title);
    setContent(tmpl.content);
    setSelectedTemplateLabel(tmpl.label);
  };

  // 현재 입력한 멘트를 커스텀 템플릿으로 저장
  const handleSaveAsCustomTemplate = () => {
    if (!title.trim() || !content.trim()) {
      return alert("제목과 본문을 먼저 입력해주세요.");
    }
    const label = customLabelInput.trim() || title.slice(0, 8);
    const newTmpl: NotiTemplate = {
      id: "custom_" + Date.now(),
      label: `📌 ${label}`,
      title: title.trim(),
      content: content.trim(),
      isCustom: true,
    };
    const updated = [newTmpl, ...customTemplates];
    setCustomTemplates(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("sori_custom_noti_templates", JSON.stringify(updated));
    }
    setSelectedTemplateLabel(newTmpl.label);
    setShowSaveCustomDialog(false);
    setCustomLabelInput("");
    alert("새 안내 멘트 템플릿으로 저장되었습니다! 템플릿 목록에서 언제든 다시 불러올 수 있습니다. ⭐");
  };

  // 커스텀 템플릿 삭제
  const handleDeleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 템플릿을 삭제하시겠습니까?")) return;
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("sori_custom_noti_templates", JSON.stringify(updated));
    }
  };

  // 예약 목록 조회
  const loadScheduledList = async () => {
    setLoadingScheduled(true);
    try {
      const res = await adminFetch("/api/admin/send-notification", { method: "GET" }, idToken);
      const data = await res.json();
      if (res.ok) {
        setScheduledList(data.notifications || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScheduled(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadScheduledList();
    }
  }, [isOpen]);

  // 알림 발송 실행
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return alert("제목을 입력해주세요.");
    if (!content.trim()) return alert("본문을 입력해주세요.");
    if (targetType === "individual" && !targetEmail.trim()) {
      return alert("개별 학생의 이메일을 입력해주세요.");
    }

    setSending(true);
    try {
      const res = await adminFetch(
        "/api/admin/send-notification",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType,
            targetEmail: targetType === "individual" ? targetEmail.trim() : undefined,
            title: title.trim(),
            content: content.trim(),
            link: link.trim() || undefined,
            sendMode,
            scheduledAt: sendMode === "scheduled" ? scheduledAt : undefined,
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");

      alert(data.message || "알림이 성공적으로 처리되었습니다! 🎉");
      loadScheduledList();
      if (sendMode === "scheduled") {
        setActiveTab("scheduled");
      } else {
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      alert(`알림 발송 실패: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // 예약 알림 삭제
  const handleDeleteScheduled = async (id: string) => {
    if (!confirm("이 예약 알림을 취소하시겠습니까?")) return;
    setDeletingId(id);
    try {
      const res = await adminFetch(
        `/api/admin/send-notification?id=${id}`,
        { method: "DELETE" },
        idToken
      );
      if (res.ok) {
        setScheduledList(prev => prev.filter(item => item.id !== id));
        alert("예약 알림이 취소되었습니다.");
      } else {
        alert("취소 실패");
      }
    } catch (e) {
      console.error(e);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 leading-tight">학생 &apos;공부할 시간이에요 ⏰&apos; 알림 발송</h3>
              <p className="text-xs text-slate-500">인증 학생들에게 쉬운 한국어로 공부 알림을 즉시 발송하거나 예약 발송합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 탭 전환 */}
        <div className="flex border-b border-slate-200 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab("send")}
            className={`flex-1 py-2.5 text-center border-b-2 transition ${
              activeTab === "send"
                ? "border-amber-500 text-amber-700 font-black"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            새 알림 작성
          </button>
          <button
            onClick={() => setActiveTab("scheduled")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === "scheduled"
                ? "border-amber-500 text-amber-700 font-black"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <Clock size={13} />
            예약 알림 관리 ({scheduledList.filter(s => s.status === "pending").length})
          </button>
        </div>

        {/* ── [탭 1] 새 알림 작성 폼 ── */}
        {activeTab === "send" && (
          <form onSubmit={handleSend} className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* 1. 발송 대상 선택 */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                발송 대상 학생
              </label>
              <select
                value={targetType}
                onChange={e => setTargetType(e.target.value as any)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all_approved">🎓 전체 인증 완료 학생 (동국대 1급/3급, 단국대 모두)</option>
                <option value="dongguk">🌱 동국대 1급 승인 학생만</option>
                <option value="dongguk3">🌿 동국대 3급 승인 학생만</option>
                <option value="dankook">🐻 단국대 승인 학생만</option>
                <option value="individual">👤 개별 학생 직접 지정</option>
              </select>

              {targetType === "individual" && (
                <input
                  type="email"
                  value={targetEmail}
                  onChange={e => setTargetEmail(e.target.value)}
                  placeholder="학생 구글 이메일 (예: student@gmail.com)"
                  required
                  className="w-full mt-2 border border-slate-200 rounded-xl p-2.5 text-xs font-mono bg-white text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>

            {/* 2. 추천 & 사용자 정의 안내 멘트 템플릿 (쉬운 말) */}
            <div className="space-y-2 bg-amber-50/60 p-3.5 rounded-2xl border border-amber-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600" />
                  쉬운 말 안내 멘트 선택:
                </span>
                <button
                  type="button"
                  onClick={() => setShowSaveCustomDialog(!showSaveCustomDialog)}
                  className="text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 underline underline-offset-2 transition"
                >
                  <BookmarkPlus size={12} />
                  {showSaveCustomDialog ? "저장창 닫기" : "현재 멘트 템플릿으로 저장"}
                </button>
              </div>

              {/* 현재 멘트 저장 입력창 (토글 시) */}
              {showSaveCustomDialog && (
                <div className="p-2.5 bg-white rounded-xl border border-amber-200 space-y-2 animate-in fade-in">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customLabelInput}
                      onChange={e => setCustomLabelInput(e.target.value)}
                      placeholder="버튼 이름 (예: 점심 공부 알림)"
                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveAsCustomTemplate}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition shrink-0"
                    >
                      저장하기
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    * 아래 입력창의 제목과 본문이 새 템플릿 버튼으로 저장됩니다.
                  </p>
                </div>
              )}

              {/* 템플릿 칩 리스트 */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[...DEFAULT_TEMPLATES, ...customTemplates].map((tmpl, idx) => {
                  const isSelected = selectedTemplateLabel === tmpl.label;
                  return (
                    <div
                      key={tmpl.id || idx}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`group cursor-pointer text-xs font-bold px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 select-none ${
                        isSelected
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                          : "bg-white hover:bg-amber-100/80 text-amber-900 border-amber-200"
                      }`}
                    >
                      <span>{tmpl.label}</span>
                      {tmpl.isCustom && tmpl.id && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomTemplate(tmpl.id!, e)}
                          className={`p-0.5 rounded-full hover:bg-red-500 hover:text-white transition ${
                            isSelected ? "text-amber-100" : "text-slate-400"
                          }`}
                          title="템플릿 삭제"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-amber-800/80 leading-relaxed">
                💡 템플릿 버튼을 누르면 아래 입력창에 문구가 채워지며, <strong>원하는 내용으로 자유롭게 수정·편집하여 발송</strong>할 수 있습니다.
              </p>
            </div>

            {/* 3. 제목 & 본문 (선생님이 자유롭게 편집) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  알림 제목 (학생에게 보일 제목) *
                </label>
                <span className="text-[10px] text-slate-400 font-medium">자유롭게 편집 가능</span>
              </div>
              <input
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  setSelectedTemplateLabel("");
                }}
                placeholder="예: ⏰ 한국어 공부할 시간이에요!"
                required
                className="w-full border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  알림 본문 내용 (쉬운 한국어 메시지) *
                </label>
                <span className="text-[10px] text-slate-400 font-medium">자유롭게 편집 가능</span>
              </div>
              <textarea
                value={content}
                onChange={e => {
                  setContent(e.target.value);
                  setSelectedTemplateLabel("");
                }}
                rows={3}
                placeholder="학생들에게 전달할 쉬운 안내 메시지를 입력하세요."
                required
                className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-900 leading-relaxed outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* 4. 바로가기 링크 */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                알림 클릭 시 이동할 화면 경로 (선택)
              </label>
              <input
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="예: /dongguk 또는 /dankook"
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* 5. 발송 방식: 즉시 vs 예약 */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="text-xs font-bold text-slate-700 block">
                발송 시점 설정
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSendMode("now")}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                    sendMode === "now"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Send size={13} /> 즉시 발송
                </button>
                <button
                  type="button"
                  onClick={() => setSendMode("scheduled")}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                    sendMode === "scheduled"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Clock size={13} /> 예약 시간 설정
                </button>
              </div>

              {sendMode === "scheduled" && (
                <div className="pt-1 space-y-1 animate-in fade-in">
                  <span className="text-[11px] font-bold text-amber-800">예약 일시 선택:</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    required
                    className="w-full border border-amber-300 rounded-xl p-2.5 text-xs font-bold bg-white text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    * 지정한 시간이 되면 학생들의 알림함(inbox)으로 자동 전달됩니다.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={sending}
              className={`w-full py-3.5 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 ${
                sendMode === "scheduled"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-slate-900 hover:bg-slate-800"
              }`}
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : sendMode === "scheduled" ? (
                <Clock size={16} />
              ) : (
                <Send size={16} />
              )}
              {sending
                ? "처리 중..."
                : sendMode === "scheduled"
                ? "알림 예약 등록하기 ⏰"
                : "지금 '공부할 시간이에요' 알림 보내기 🚀"}
            </button>
          </form>
        )}

        {/* ── [탭 2] 예약 알림 관리 ── */}
        {activeTab === "scheduled" && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">등록된 예약 알림 내역</span>
              <button
                type="button"
                onClick={loadScheduledList}
                disabled={loadingScheduled}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-bold"
              >
                <RefreshCw size={12} className={loadingScheduled ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>

            {loadingScheduled ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-1" />
                예약 내역 조회 중...
              </div>
            ) : scheduledList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                현재 등록된 예약 알림이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledList.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                        {item.targetType === "all_approved"
                          ? "전체 학생"
                          : item.targetType === "dongguk"
                          ? "동국대 1급"
                          : item.targetType === "dongguk3"
                          ? "동국대 3급"
                          : item.targetType === "dankook"
                          ? "단국대"
                          : `개별: ${item.targetEmail}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                          <Clock size={11} /> {item.scheduledAtFormatted || (item.scheduledAtMs ? new Date(item.scheduledAtMs).toLocaleString("ko-KR") : "")}
                        </span>
                        {item.status === "pending" && (
                          <button
                            onClick={() => handleDeleteScheduled(item.id)}
                            disabled={deletingId === item.id}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                            title="예약 취소"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">{item.title}</h4>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{item.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
