"use client";
// app/components/LicenseModal.tsx
// — Gumroad 라이선스 키 입력 UI
// — useDeepLink: QR 딥링크 파라미터 처리 (?step=N&unit=N&mode=practice)

import { useState, useEffect } from "react";
import { X, BookOpen, ExternalLink, CheckCircle, Loader2, Lock, Unlock } from "lucide-react";
import { auth } from "@/lib/firebase";

// ──────────────────────────────────────────
// useDeepLink 훅
// QR 코드 링크: https://sori-tutor.vercel.app/?step=2&unit=3&mode=practice
// ──────────────────────────────────────────
export function useDeepLink(onNavigate: (step: number, unit: number) => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const step = params.get("step");
    const unit = params.get("unit");
    const mode = params.get("mode");

    if (step && unit && mode === "practice") {
      onNavigate(Number(step), Number(unit));
      // URL 파라미터 제거 (히스토리 오염 방지)
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);
}

// ──────────────────────────────────────────
// Step 상품 정보
// ──────────────────────────────────────────
const STEP_PRODUCTS = [
  { step: 1, name: "STEP Korean Step 1", level: "입문", desc: "한글 자모 ~ TOPIK I 기초", gumroadUrl: "https://gumroad.com/l/STEP1_URL" },
  { step: 2, name: "STEP Korean Step 2", level: "TOPIK I 1급", desc: "자기소개 ~ 쇼핑/교통", gumroadUrl: "https://gumroad.com/l/STEP2_URL" },
  { step: 3, name: "STEP Korean Step 3", level: "TOPIK I 2급", desc: "가족 ~ 건강/여행", gumroadUrl: "https://gumroad.com/l/STEP3_URL" },
  { step: 4, name: "STEP Korean Step 4", level: "TOPIK II 3급", desc: "일상 ~ 직업/계획", gumroadUrl: "https://gumroad.com/l/STEP4_URL" },
  { step: 5, name: "STEP Korean Step 5", level: "TOPIK II 3급+", desc: "사회 ~ 미디어/환경", gumroadUrl: "https://gumroad.com/l/STEP5_URL" },
  { step: 6, name: "STEP Korean Step 6", level: "TOPIK II 4급", desc: "뉴스 ~ 의학/직업", gumroadUrl: "https://gumroad.com/l/STEP6_URL" },
  { step: 7, name: "STEP Korean Step 7", level: "TOPIK II 5급", desc: "학술 ~ 철학/과학", gumroadUrl: "https://gumroad.com/l/STEP7_URL" },
  { step: 8, name: "STEP Korean Step 8", level: "TOPIK II 6급", desc: "정치 ~ 실전 모의고사", gumroadUrl: "https://gumroad.com/l/STEP8_URL" },
];

// ──────────────────────────────────────────
// LicenseModal 컴포넌트
// ──────────────────────────────────────────
interface Props {
  onClose: () => void;
  purchasedSteps: number[];
  onUnlock: (step: number) => void; // 부모 상태 업데이트
}

export default function LicenseModal({ onClose, purchasedSteps, onUnlock }: Props) {
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [view, setView] = useState<"list" | "verify">("list");

  const handleVerify = async () => {
    if (!licenseKey.trim() || !selectedStep) return;
    setVerifying(true);
    setResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("로그인 필요");

      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ licenseKey: licenseKey.trim(), step: selectedStep }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: `Step ${selectedStep} 활성화 완료!` });
        onUnlock(selectedStep);
      } else {
        setResult({ success: false, message: data.error ?? "검증 실패" });
      }
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex items-center justify-between flex-none">
          <div className="flex items-center gap-3">
            <BookOpen size={22} />
            <div>
              <h2 className="font-black text-lg leading-tight">STEP Korean 교재 연동</h2>
              <p className="text-xs text-white/60">라이선스 키를 입력해 커리큘럼을 잠금 해제하세요</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1"><X size={20} /></button>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto">
          {view === "list" ? (
            <div className="p-4 space-y-3">
              {STEP_PRODUCTS.map(product => {
                const owned = purchasedSteps.includes(product.step);
                return (
                  <div
                    key={product.step}
                    className={`rounded-2xl border-2 p-4 transition ${
                      owned
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${owned ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"}`}>
                          {product.step}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.level} · {product.desc}</p>
                        </div>
                      </div>
                      {owned ? (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-bold">
                          <Unlock size={14} /> 활성화
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <a
                            href={product.gumroadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-amber-600 flex items-center gap-1"
                          >
                            <ExternalLink size={12} /> 구매
                          </a>
                          <button
                            onClick={() => {
                              setSelectedStep(product.step);
                              setLicenseKey("");
                              setResult(null);
                              setView("verify");
                            }}
                            className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-black flex items-center gap-1"
                          >
                            <Lock size={12} /> 키 입력
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <button
                onClick={() => { setView("list"); setResult(null); }}
                className="text-sm text-slate-500 font-bold mb-4 flex items-center gap-1 hover:text-slate-700"
              >
                ← 목록으로
              </button>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-3">
                  {selectedStep}
                </div>
                <h3 className="font-black text-xl text-slate-800">
                  STEP Korean Step {selectedStep}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {STEP_PRODUCTS.find(p => p.step === selectedStep)?.desc}
                </p>
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-slate-500 block mb-2">
                  라이선스 키 (구매 이메일에서 확인)
                </label>
                <input
                  value={licenseKey}
                  onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full border-2 border-slate-200 focus:border-slate-800 rounded-xl p-4 text-center font-mono font-bold text-lg tracking-widest focus:outline-none transition"
                />
              </div>

              {result && (
                <div className={`mb-4 p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${
                  result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}>
                  {result.success ? <CheckCircle size={16} /> : <X size={16} />}
                  {result.message}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={!licenseKey.trim() || verifying || result?.success}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-base hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? <><Loader2 size={20} className="animate-spin" /> 검증 중...</> : "라이선스 활성화"}
              </button>

              <p className="text-xs text-center text-slate-400 mt-4">
                교재 구매 후 이메일로 발송된 라이선스 키를 입력하세요.<br />
                문제가 있으시면 앱 내 문의하기를 이용해주세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}