"use client";

// app/components/AudioWaveform.tsx
// Web Audio API AnalyserNode 기반 실시간 음성 파형 시각화 컴포넌트

import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  className?: string;
  barColor?: string;
}

export default function AudioWaveform({
  analyser,
  isRecording,
  className = "",
  barColor = "#3b82f6",
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 캔버스 해상도 보정
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 200;
    const height = canvas.clientHeight || 40;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const barCount = 24;
    const barWidth = 3;
    const gap = (width - barCount * barWidth) / (barCount + 1);

    if (!isRecording || !analyser) {
      // 대기/유휴 상태: 작은 점선 표시
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#cbd5e1";
      for (let i = 0; i < barCount; i++) {
        const x = gap + i * (barWidth + gap);
        const y = height / 2 - 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, 3, 1.5);
        ctx.fill();
      }
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameIdRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // 그라데이션 색상
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "#3b82f6");
      gradient.addColorStop(0.5, "#8b5cf6");
      gradient.addColorStop(1, "#ec4899");

      ctx.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        // 주파수 대역 샘플링 (음성 주파수에 맞춰 저~중음역대 집중)
        const sampleIndex = Math.floor((i / barCount) * (bufferLength * 0.6));
        const value = dataArray[sampleIndex] || 0;
        const percent = value / 255;
        // 최소 4px, 최대 (height - 4)px
        const barHeight = Math.max(4, percent * (height - 6));
        const x = gap + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
    };

    render();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [analyser, isRecording, barColor]);

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-48 h-9"
        style={{ display: "block" }}
      />
    </div>
  );
}
