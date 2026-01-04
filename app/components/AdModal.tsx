"use client";

import { useState, useEffect, useRef } from "react";
// Next.js Script 컴포넌트 (필요 시 사용, 이미 layout에 있다면 제외 가능)
import Script from "next/script"; 

interface AdModalProps {
  onClose: () => void;
  onReward: (amount: number) => void; // 토큰 개수를 인자로 받음
}

export default function AdModal({ onClose, onReward }: AdModalProps) {
  const [timeLeft, setTimeLeft] = useState(15); // 15초 타이머
  const adLoaded = useRef(false);

  useEffect(() => {
    // 1. 타이머 작동
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // 2. 애드센스 광고 로드 트리거 (컴포넌트 마운트 시 1회 실행)
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

  // 보상 받기 버튼 클릭 핸들러 (1~3 랜덤 생성)
  const handleRewardClick = () => {
    const randomAmount = Math.floor(Math.random() * 3) + 1; // 1, 2, 3 중 하나
    onReward(randomAmount);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center text-white p-4">
       {/* 1. 안내 문구 수정 */}
       <h2 className="text-xl font-bold mb-2">무료 토큰 충전소</h2>
       <p className="text-sm text-gray-300 mb-6 text-center">
         광고가 끝날 때까지 잠시만 기다려주세요.<br/>
         시청이 완료되면 <span className="text-yellow-400 font-bold">1~3개의 토큰</span>이 랜덤 지급됩니다!
       </p>
       
       <div className="mb-4 text-2xl font-black text-green-400">
          ⏳ {timeLeft > 0 ? `${timeLeft}초 남음` : "시청 완료!"}
       </div>

       {/* 2. 구글 애드센스 광고 영역 (리액트 문법 적용) */}
       <div className="bg-white text-black flex items-center justify-center overflow-hidden rounded-lg mb-6 min-h-[250px] min-w-[300px]">
          {/* 광고 스크립트 로드 (헤더에 없다면 여기서 로드) */}
          <Script 
            async 
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4585319125929329"
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
          
          <ins className="adsbygoogle"
               style={{ display: 'block', width: '300px', height: '250px' }} // 크기 명시 권장
               data-ad-client="ca-pub-4585319125929329"
               data-ad-slot="1820723750"
               data-ad-format="auto"
               data-full-width-responsive="true">
          </ins>
       </div>

       {/* 3. 버튼 영역 */}
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

       <button onClick={onClose} className="mt-4 text-sm text-gray-500 hover:text-white underline">
         포기하고 닫기
       </button>
    </div>
  );
}