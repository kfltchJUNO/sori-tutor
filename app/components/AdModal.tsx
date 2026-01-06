"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script"; 

interface AdModalProps {
  onClose: () => void;
  onReward: (amount: number) => void;
}

export default function AdModal({ onClose, onReward }: AdModalProps) {
  const [timeLeft, setTimeLeft] = useState(15); // 15초 카운트다운
  const adLoaded = useRef(false);

  useEffect(() => {
    // 1. 타이머 작동 로직
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // 2. 애드센스 광고 로드 로직 (중복 로드 방지)
    if (!adLoaded.current) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        adLoaded.current = true;
      } catch (e) {
        console.error("AdSense Load Error:", e);
      }
    }

    return () => clearInterval(timer);
  }, []);

  // 🔥 [핵심] 1~3개 랜덤 토큰 생성 및 지급
  const handleRewardClick = () => {
    const randomAmount = Math.floor(Math.random() * 3) + 1; // 1, 2, 3 중 하나
    onReward(randomAmount);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center text-white p-4 animate-in fade-in duration-300">
       <h2 className="text-xl font-bold mb-2">무료 토큰 충전소</h2>
       <p className="text-sm text-gray-300 mb-6 text-center">
         광고가 끝날 때까지 잠시만 기다려주세요.<br/>
         시청이 완료되면 <span className="text-yellow-400 font-bold">1~3개의 토큰</span>이 랜덤 지급됩니다!
       </p>
       
       {/* 카운트다운 표시 */}
       <div className="mb-4 text-2xl font-black text-green-400">
          ⏳ {timeLeft > 0 ? `${timeLeft}초 남음` : "시청 완료!"}
       </div>

       {/* 🔥 광고 영역 (배경에 안내 문구 포함) */}
       <div className="bg-white text-slate-300 flex items-center justify-center overflow-hidden rounded-lg mb-6 min-h-[250px] min-w-[300px] relative border border-slate-700 shadow-xl">
          {/* 광고 로딩 전/실패 시 보이는 배경 텍스트 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
              <span className="font-bold text-lg text-slate-400">광고 준비 중...</span>
              <span className="text-xs mt-2 text-slate-500">잠시만 기다리시면<br/>보상 버튼이 활성화됩니다.</span>
          </div>

          {/* 실제 애드센스 광고 (z-index로 텍스트 덮음) */}
          <div className="z-10 w-full h-full bg-transparent">
              <Script 
                async 
                src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4585319125929329"
                crossOrigin="anonymous"
                strategy="lazyOnload"
              />
              <ins className="adsbygoogle"
                   style={{ display: 'block', width: '100%', height: '100%' }}
                   data-ad-client="ca-pub-4585319125929329"
                   data-ad-slot="1820723750" // 본인의 광고 단위 ID 확인 필요
                   data-ad-format="auto"
                   data-full-width-responsive="true">
              </ins>
          </div>
       </div>

       {/* 보상 받기 버튼 (타이머 종료 후 활성화) */}
       {timeLeft === 0 ? (
         <button 
           onClick={handleRewardClick} 
           className="w-full max-w-xs bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg animate-bounce transition transform active:scale-95"
         >
           🎁 랜덤 토큰 받기
         </button>
       ) : (
         <button disabled className="w-full max-w-xs bg-gray-700 text-gray-400 py-4 rounded-xl font-bold text-lg cursor-not-allowed opacity-50">
           보상 대기 중...
         </button>
       )}

       {/* 닫기 버튼 */}
       <button onClick={onClose} className="mt-4 text-sm text-gray-500 hover:text-white underline">
         포기하고 닫기
       </button>
    </div>
  );
}