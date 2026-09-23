import React from "react";

interface SoriIconProps {
  size?: number;
  className?: string;
}

export default function SoriIcon({ size = 16, className = "" }: SoriIconProps) {
  return (
    <img
      src="/sori.jpg"
      alt="소리"
      className={`rounded-full object-cover inline-block shrink-0 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}
