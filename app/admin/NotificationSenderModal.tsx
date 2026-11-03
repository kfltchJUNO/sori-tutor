"use client";
// app/admin/NotificationSenderModal.tsx
// 관리자 페이지: 인증 학생 대상 학습 독려 알림/알람 발송 모달 (즉시 발송 및 예약 발송 지원)

import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  Bell, X, Send, Clock, Calendar, CheckCircle2,
  AlertCircle, Loader2, Sparkles, Trash2, RefreshCw
} from "lucide-react";
import type { ScheduledNotification } from "@/app/api/admin/send-notification/route";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  idToken: string;
  defaultTargetType?: "dongguk" | "dongguk3" | "dankook" | "all_approved";
  initialStudentEmail?: string | null;
}

const TEMPLATES = [
  {
    title: "오늘의 한국어 발음 훈련이 기다리고 있어요! 🎯",
    content: "하루 5분 꾸준한 발음 연습이 자연스러운 억양을 만들어요! 지금 접속해서 오늘의 문장을 소리 내어 읽어보세요.",
  },
  {
    title: "선생님이 새로운 맞춤 연습 문장을 등록했습니다! 🌟",
    content: "새로운 과와 발음 공식이 추가되었습니다. 원어민 음성을 들어보고 내 발음 점수를 확인해보세요!",
  },
  {
    title: "🔥 연속 학습 스트릭을 이어가세요!",
    content: "꾸준함이 최고의 실력입니다! 오늘도 잊지 말고 발음 훈련을 완료해 보세요.",
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
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [content, setContent] = useState(TEMPLATES[0].content);
  const [link, setLink] = useState(
    defaultTargetType === "dongguk" ? "/dongguk" : defaultTargetType === "dongguk3" ? "/dongguk3" : defaultTargetType === "dankook" ? "/dankook" : ""
  );

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
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 leading-tight">학생 학습 독려 알림 발송</h3>
              <p className="text-xs text-slate-500">인증 학생들에게 즉시 발송하거나 예약 시간에 맞춰 발송합니다.</p>
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

            {/* 2. 추천 템플릿 버튼 */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" /> 추천 문구 템플릿 (클릭 시 자동 입력):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTitle(tmpl.title);
                      setContent(tmpl.content);
                    }}
                    className="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg border border-amber-200 transition"
                  >
                    {idx === 0 ? "🎯 오늘의 5분 미션" : idx === 1 ? "🌟 새 문장 안내" : "🔥 스트릭 독려"}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 제목 & 본문 */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                알림 제목 *
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="예: 오늘의 한국어 발음 훈련 시간입니다 🎯"
                required
                className="w-full border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                알림 본문 내용 *
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={3}
                placeholder="학생들에게 전달할 독려 메시지를 입력하세요."
                required
                className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-900 leading-relaxed outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* 4. 발송 방식: 즉시 vs 예약 */}
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
                    * 지정한 시간이 도래하면 학생들의 알림함(inbox)으로 자동 전달됩니다.
                  </p>
                </div>
              )}
            </div>

            {/* 전송 버튼 */}
            <button
              type="submit"
              disabled={sending}
              className={`w-full py-3.5 text-white font-black text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 ${
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
                ? "알람 예약 등록하기 ⏰"
                : "지금 즉시 발송하기 📢"}
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
              <div className="space-y-2.5">
                {scheduledList.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                              item.status === "sent"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.status === "sent"
                              ? `발송완료 (${item.sent_count || 0}명)`
                              : "⏰ 예약 대기중"}
                          </span>
                          <span className="text-xs font-bold text-slate-500 font-mono">
                            {item.scheduledAtFormatted}
                          </span>
                        </div>
                        <h4 className="font-black text-sm text-slate-900 mt-1">{item.title}</h4>
                      </div>

                      {item.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteScheduled(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                          title="예약 취소"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {item.content}
                    </p>

                    <div className="text-[11px] text-slate-400">
                      대상:{" "}
                      {item.targetType === "all_approved"
                        ? "전체 인증 학생"
                        : item.targetType === "dongguk"
                        ? "동국대 1급"
                        : item.targetType === "dongguk3"
                        ? "동국대 3급"
                        : item.targetType === "dankook"
                        ? "단국대"
                        : item.targetEmail || "개별 학생"}
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
