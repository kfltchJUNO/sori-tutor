"use client";
// app/components/PwaInstallPrompt.tsx
// 최초 입장 시 바탕화면/홈 화면에 바로가기 아이콘 저장을 안내하고 실행하는 컴포넌트

import { useState, useEffect } from "react";
import { Download, X, Smartphone, Share, PlusSquare, Check } from "lucide-react";

interface Props {
  portalName?: string; // 예: "동국한국어", "단국한국어", "소리튜터"
}

export default function PwaInstallPrompt({ portalName = "소리튜터" }: Props) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. 이미 PWA 독립형(바탕화면 앱)으로 실행 중인지 확인
    const isInStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isInStandalone) {
      setIsStandalone(true);
      return;
    }

    // 2. 사용자가 최근에 닫았는지 확인 (3일 동안 다시 묻지 않음)
    const dismissedTime = localStorage.getItem("sori_pwa_prompt_dismissed");
    if (dismissedTime) {
      const diff = Date.now() - Number(dismissedTime);
      if (diff < 1000 * 60 * 60 * 24 * 3) {
        return;
      }
    }

    // 3. iOS 기기 여부 확인
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 4. Chrome / Android / Edge 등의 beforeinstallprompt 이벤트 리스닝
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // 최초 입장 1.2초 후 자연스럽게 팝업 표시
      setTimeout(() => {
        setShowPrompt(true);
      }, 1200);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS인 경우 이벤트가 발생하지 않으므로 2초 후 가이드 팝업 표시
    if (isIosDevice && !isInStandalone) {
      const iosDismissed = localStorage.getItem("sori_pwa_ios_dismissed");
      if (!iosDismissed) {
        setTimeout(() => {
          setShowPrompt(true);
        }, 1800);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // 설치 버튼 클릭 (Android / PC)
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
      localStorage.setItem("sori_pwa_installed", "true");
    }
    setDeferredPrompt(null);
  };

  // 닫기
  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("sori_pwa_prompt_dismissed", Date.now().toString());
    if (isIOS) {
      localStorage.setItem("sori_pwa_ios_dismissed", "true");
    }
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Smartphone size={26} />
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">
            <span>✨</span> 1초 만에 바로가기 생성
          </div>
          <h3 className="text-lg font-black text-slate-900 leading-snug">
            {portalName}을 바탕화면에<br />아이콘으로 저장할까요?
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            홈 화면에 아이콘을 추가하면 브라우저 주소를 입력할 필요 없이 <strong>앱처럼 터치 한 번으로 매일 편리하게</strong> 발음 공부를 시작할 수 있습니다.
          </p>
        </div>

        {/* iOS 사파리 가이드 */}
        {isIOS ? (
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-slate-900">
              <Share size={14} className="text-blue-600" /> 아이폰(iOS) 추가 방법:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed">
              <li>사파리 하단의 <strong>공유 버튼</strong>(네모에 위 화살표 <Share size={11} className="inline text-blue-600" />)을 누릅니다.</li>
              <li>메뉴를 올려 <strong>&apos;홈 화면에 추가&apos;</strong>(<PlusSquare size={11} className="inline" />)를 누르면 완료됩니다.</li>
            </ol>
            <button
              onClick={handleDismiss}
              className="w-full mt-2 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl shadow transition hover:bg-slate-800"
            >
              알겠습니다, 확인했어요
            </button>
          </div>
        ) : (
          /* Android / Chrome / PC 바로 설치 버튼 */
          <div className="space-y-2 pt-1">
            <button
              onClick={handleInstallClick}
              disabled={!deferredPrompt}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download size={18} />
              바탕화면에 아이콘 저장하기
            </button>
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 text-xs text-slate-400 font-bold hover:text-slate-600 transition"
            >
              나중에 하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
