"use client";
// app/components/AdBanner.tsx
// 애드센스 광고 유닛 — 위치별로 재사용

import { useEffect, useRef } from "react";

interface AdBannerProps {
  slot: string;           // 애드센스 광고 유닛 ID (심사 통과 후 발급)
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  className?: string;
  label?: boolean;        // "광고" 레이블 표시 여부
}

export default function AdBanner({
  slot,
  format = "auto",
  className = "",
  label = true,
}: AdBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      const w = window as any;
      if (w.adsbygoogle) {
        w.adsbygoogle = w.adsbygoogle || [];
        w.adsbygoogle.push({});
        pushed.current = true;
      }
    } catch (e) {
      console.warn("AdSense push error:", e);
    }
  }, []);

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      {label && (
        <p className="text-center text-[10px] text-slate-300 mb-1 tracking-widest uppercase">
          Advertisement
        </p>
      )}
      <ins
        ref={adRef}
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