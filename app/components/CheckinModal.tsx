"use client";

// components/CheckinModal.tsx
// 기존 AdModal(광고 보상형) 완전 대체
// — AdSense 정책 위반 제거
// — 토큰 지급은 /api/token 서버 엔드포인트를 통해서만 처리

import { useState } from "react";
import { Sparkles, X, CheckCircle, Calendar } from "lucide-react";

interface CheckinModalProps {
  onClose: () => void;
  onReward: (amount: number) => void; // 부모 UI 상태 업데이트용
}

export default function CheckinModal({ onClose, onReward }: CheckinModalProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "already">("idle");

  const handleCheckin = async () => {
    setStatus("loading");
    try {
      // 토큰 지급은 서버 API에서 처리 (useTokenTransaction의 claimCheckin과 동일 엔드포인트)
      const { auth } = await import("@/lib/firebase");
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("로그인 필요");

      const res = await fetch("/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "earn", reason: "출석 체크 보상" }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("이미")) {
          setStatus("already");
        } else {
          throw new Error(data.error);
        }
        return;
      }

      setStatus("done");
      onReward(data.earned ?? 1);
    } catch (e: any) {
      alert("오류: " + e.message);
      setStatus("idle");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-orange-400 to-amber-500 p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>
          <Calendar size={40} className="mx-auto mb-2 opacity-90" />
          <h2 className="text-xl font-black">오늘의 출석 체크</h2>
          <p className="text-sm text-white/80 mt-1">매일 출석하면 토큰 1개 지급!</p>
        </div>

        {/* 바디 */}
        <div className="p-6 text-center">
          {status === "idle" && (
            <>
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                오늘 아직 출석 체크를 하지 않으셨어요.<br />
                <span className="font-bold text-orange-500">🪙 토큰 1개</span>를 무료로 받으세요!
              </p>
              <button
                onClick={handleCheckin}
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-orange-200 transition active:scale-95"
              >
                ✅ 출석 체크하기
              </button>
            </>
          )}

          {status === "loading" && (
            <div className="py-8 flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-sm font-bold">처리 중...</p>
            </div>
          )}

          {status === "done" && (
            <div className="py-6 flex flex-col items-center gap-3 animate-in zoom-in">
              <CheckCircle size={48} className="text-green-500" />
              <p className="text-xl font-black text-slate-800">출석 완료!</p>
              <p className="text-slate-500 text-sm">
                <span className="font-bold text-orange-500">🪙 토큰 1개</span> 지급되었습니다.
              </p>
              <button
                onClick={onClose}
                className="mt-2 w-full py-3 bg-slate-900 text-white rounded-xl font-bold"
              >
                확인
              </button>
            </div>
          )}

          {status === "already" && (
            <div className="py-6 flex flex-col items-center gap-3">
              <Sparkles size={40} className="text-amber-400" />
              <p className="text-lg font-black text-slate-800">오늘은 이미 출석했어요!</p>
              <p className="text-slate-500 text-sm">내일 다시 방문하면 토큰을 받을 수 있어요.</p>
              <button
                onClick={onClose}
                className="mt-2 w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}