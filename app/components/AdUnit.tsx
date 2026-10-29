"use client";
// app/components/AdUnit.tsx
// ins 요소가 DOM에 마운트될 때 1회만 push — 중복 push 오류 방지

import { useEffect, useRef } from "react";

interface Props {
  slot: string;
  format?: "auto" | "horizontal" | "rectangle" | "vertical";
  className?: string;
}

export default function AdUnit({ slot, format = "auto", className = "" }: Props) {
  const insRef  = useRef<HTMLModElement>(null);
  const pushed  = useRef(false);
  // 실제 숫자형 애드센스 슬롯 ID(예: "1234567890")가 아닐 경우(예: "SLOT_ID_4") 400 에러 방지를 위해 렌더링 생략
  const isValidSlot = Boolean(slot && /^\d+$/.test(slot.trim()));

  useEffect(() => {
    if (!isValidSlot) return;
    if (pushed.current) return;
    if (!insRef.current) return;

    // 이미 광고가 삽입된 요소인지 확인
    if (insRef.current.getAttribute("data-adsbygoogle-status")) return;

    try {
      const w = window as any;
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      pushed.current = true;
    } catch (e) {
      // 오류 무시 (심사 전엔 광고 없음)
    }
  }, [isValidSlot]);

  if (!isValidSlot) return null;

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <p style={{ textAlign: "center", fontSize: 10, color: "#cbd5e1", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
        Advertisement
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-4585319125929329"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}