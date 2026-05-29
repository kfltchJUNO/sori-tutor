"use client";
// components/views/PracticeView.tsx
// AdSense push는 ins 요소가 DOM에 마운트된 후 실행해야 함
import { useEffect, useState, useCallback } from "react";
import AdUnit from "@/app/components/AdUnit";
import { X, Volume2, CheckCircle, Info, Languages, Mic, ChevronLeft, Headphones } from "lucide-react";
import type { AnalysisResult, CourseType } from "@/types";

interface ParsedLine { role: string; text: string; }

interface Props {
  courseType: CourseType;
  currentProblem: any;
  result: AnalysisResult | null;
  translation: string | null;
  parsedScript: ParsedLine[];
  myRole: "A" | "B";
  targetLineIndex: number | null;
  completedLines: number[];
  isShadowingMode: boolean;
  ttsLoading: boolean;
  loading: boolean;
  recording: boolean;
  audioUrl: string | null;

  onBack: () => void;
  onSetMyRole: (r: "A" | "B") => void;
  onSetTargetLine: (i: number) => void;
  onToggleShadowing: () => void;
  onPlayTTS: (text: string, path?: string | null, voice?: string | null) => void;
  onRetry: () => void;
  onNext: () => void;
  onTranslate: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelAudio: () => void;
  onAnalyze: () => void;
  onNextDialogue: () => void;
  isAllMyLinesFinished: () => boolean;
}

export default function PracticeView({
  courseType, currentProblem, result, translation,
  parsedScript, myRole, targetLineIndex, completedLines,
  isShadowingMode, ttsLoading, loading, recording, audioUrl,
  onBack, onSetMyRole, onSetTargetLine, onToggleShadowing,
  onPlayTTS, onRetry, onNext, onTranslate,
  onStartRecording, onStopRecording, onCancelAudio, onAnalyze, onNextDialogue,
  isAllMyLinesFinished,
}: Props) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // 쉐도잉: 음성 재생 완료 후 카운트다운 → 녹음 시작
  const handleShadowingPlay = useCallback(() => {
    const audioSrc = currentProblem?.audio_path;
    const text = currentProblem?.text ?? "";

    const startCountdown = () => {
      setCountdown(3);
      let count = 3;
      const timer = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
        } else {
          clearInterval(timer);
          setCountdown(null);
          onStartRecording();
        }
      }, 800);
    };

    if (audioSrc) {
      // MP3 파일 — onended 이벤트로 정확한 종료 감지
      const audio = new Audio(audioSrc);
      audio.onended = () => startCountdown();
      audio.onerror = () => startCountdown(); // 로드 실패 시 바로 시작
      audio.play().catch(() => startCountdown());
    } else {
      // TTS — onPlayTTS 후 음성 길이 추정 (음절 수 × 250ms + 여유 500ms)
      onPlayTTS(text, null, null);
      const syllableCount = (text.match(/[가-힣]/g) ?? []).length || text.length / 2;
      const estimatedDuration = Math.max(syllableCount * 250 + 500, 2000);
      setTimeout(startCountdown, estimatedDuration);
    }
  }, [currentProblem, onStartRecording, onPlayTTS]);

  return (
    <div className="flex flex-col h-full pb-24">
      {/* 상단 컨트롤 */}
      <div className="flex justify-between items-center mb-4">
        <button onClick={onBack}><X size={20} /></button>
        {courseType === "dialogue" ? (
          <div className="flex gap-2">
            {(["A", "B"] as const).map((r) => (
              <button
                key={r}
                onClick={() => onSetMyRole(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition shadow-sm 
                  ${myRole === r ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-white text-slate-500 border border-slate-200"}`}
              >
                {r} (나)
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isShadowingMode ? "text-purple-600" : "text-slate-400"}`}>
              쉐도잉 모드
            </span>
            <button
              onClick={onToggleShadowing}
              className={`w-10 h-5 rounded-full relative transition ${isShadowingMode ? "bg-purple-600" : "bg-slate-300"}`}
            >
              <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${isShadowingMode ? "left-6" : "left-1"}`} />
            </button>
          </div>
        )}
      </div>

      {/* 결과 화면 */}
      {result ? (
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
          <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-2 border-b">
            <h3 className="font-bold text-lg text-slate-800">분석 결과</h3>
            <span className={`text-2xl font-black ${result.score >= 80 ? "text-green-500" : "text-orange-500"}`}>
              {result.score}점
            </span>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">인식된 소리</span>
              <div className="text-lg font-bold text-red-500 bg-white p-2 rounded border border-red-100">
                {result.recognized}
              </div>
            </div>
            <div className="flex justify-center"><div className="w-0.5 h-3 bg-slate-300" /></div>
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">정답 소리</span>
              <div className="text-lg font-bold text-green-600 bg-white p-2 rounded border border-green-100">
                {result.correct}
              </div>
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
            <div className="flex justify-end mb-1">
              <button
                onClick={onTranslate}
                className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded-lg shadow-sm flex items-center gap-1 hover:bg-blue-50 transition"
              >
                <Languages size={12} /> 번역 (0.5🪙)
              </button>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-bold text-blue-500 block">발음 교정</span>
                <p className="text-sm text-blue-800 font-bold">{result.explanation}</p>
              </div>
            </div>
            {result.advice && (
              <div className="flex items-start gap-2 pt-2 border-t border-blue-200">
                <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-indigo-500 block">억양 / 감정 Tip</span>
                  <p className="text-xs text-indigo-700">{result.advice}</p>
                </div>
              </div>
            )}
            {translation && (
              <div className="mt-3 pt-3 border-t border-blue-200 animate-in fade-in">
                <p className="text-xs font-bold text-purple-600 mb-1">🌏 번역된 피드백</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{translation}</p>
              </div>
            )}
          </div>
          {/* 광고 #3: 분석 결과 확인 후 */}
          <div className="w-full bg-slate-50 rounded-xl overflow-hidden my-2 border border-slate-100">
            <AdUnit slot="SLOT_ID_3" format="rectangle" />
          </div>
          <div className="flex flex-col gap-2 shrink-0 bg-white pt-2 border-t">
            <button onClick={onRetry} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold flex items-center justify-center gap-2">
              <Mic size={18} /> 다시 녹음하기
            </button>
            <button onClick={onNext} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg">
              {courseType === "dialogue" ? "확인" : "다음 문제 (랜덤)"}
            </button>
          </div>
        </div>
      ) : (
        // 연습 화면
        <div className="flex flex-col h-full">
          {isShadowingMode && courseType !== "dialogue" && (
            <div className="bg-purple-50 text-purple-700 text-xs p-2 rounded-lg mb-4 text-center">
              🎧 <b>Shadowing:</b> 원어민 음성을 듣고 동시에 따라 말해보세요!
            </div>
          )}

          {courseType === "dialogue" ? (
            <div className="space-y-6 flex-1 pb-10">
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <h1 className="font-bold text-lg text-purple-900">{currentProblem.title}</h1>
                <p className="text-sm text-purple-700 mt-1">{currentProblem.translation}</p>
              </div>
              <div className="space-y-4">
                {parsedScript.map((line, idx) => {
                  const isMe = line.role === myRole;
                  const isCompleted = completedLines.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => { if (isMe) onSetTargetLine(idx); }}
                      className={`flex ${isMe ? "justify-end" : "justify-start"} animate-in fade-in`}
                    >
                      <div className={`max-w-[85%] p-3 rounded-2xl relative cursor-pointer border-2 transition-all
                        ${isMe
                          ? targetLineIndex === idx
                            ? "bg-blue-100 border-blue-500 ring-2 ring-blue-200"
                            : isCompleted ? "bg-blue-50 border-blue-200 opacity-60" : "bg-blue-50 border-blue-300 shadow-sm"
                          : "bg-white border-gray-200 text-slate-600"}
                        ${isMe ? "rounded-tr-none" : "rounded-tl-none"}`}
                      >
                        <span className="text-[10px] font-bold block opacity-50 mb-1">{line.role}</span>
                        <p className={`text-base font-medium ${isMe ? "text-slate-900" : "text-slate-700"}`}>
                          {line.text}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); onPlayTTS(line.text, currentProblem.audio_paths?.[idx]); }}
                          className="absolute -right-2 -bottom-2 bg-white border rounded-full p-1 shadow-sm hover:bg-gray-50"
                        >
                          <Volume2 size={12} className="text-gray-500" />
                        </button>
                        {isMe && isCompleted && (
                          <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-green-500">
                            <CheckCircle size={16} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center pb-20 animate-in zoom-in duration-300">
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center mb-6 w-full relative">
                <button
                  onClick={() => onPlayTTS(
                    currentProblem.pronunciation ?? currentProblem.text,
                    currentProblem.audio_path
                  )}
                  className="absolute top-4 right-4 bg-blue-100 text-blue-600 p-3 rounded-full hover:bg-blue-200 transition"
                >
                  {ttsLoading
                    ? <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    : <Volume2 size={24} />}
                </button>
                <h1 className="text-4xl font-black text-slate-800 mb-4 break-keep">{currentProblem.text}</h1>
                {currentProblem.pronunciation && (
                  <p className="text-xl text-slate-500 font-serif mb-8 italic">{currentProblem.pronunciation}</p>
                )}
                <div className="bg-slate-50 text-slate-600 text-sm font-medium p-3 rounded-xl inline-block border border-slate-200">
                  💡 {courseType === "word" ? currentProblem.tip : currentProblem.translation}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 녹음 하단 바 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] rounded-t-3xl z-50">
        <div className="flex flex-col items-center gap-4">
          {loading && (
            <div className="text-slate-500 animate-pulse font-bold text-sm">
              AI가 소리를 분석 중입니다... 🎧
            </div>
          )}
          {/* 쉐도잉 모드 — 카운트다운 */}
          {!recording && !audioUrl && !loading && isShadowingMode && courseType !== "dialogue" && countdown !== null && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-purple-100 border-4 border-purple-500 flex items-center justify-center">
                <span className="text-3xl font-black text-purple-600 animate-pulse">{countdown}</span>
              </div>
              <span className="text-xs text-purple-600 font-bold">준비하세요!</span>
            </div>
          )}
          {/* 쉐도잉 모드 — 재생 버튼 */}
          {!recording && !audioUrl && !loading && isShadowingMode && courseType !== "dialogue" && countdown === null && (
            <button
              onClick={handleShadowingPlay}
              className="w-16 h-16 rounded-full bg-purple-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition animate-pulse"
            >
              <Headphones size={28} />
            </button>
          )}
          {!recording && !audioUrl && !loading && (!isShadowingMode || courseType === "dialogue") && (
            <button
              onClick={onStartRecording}
              className="w-16 h-16 rounded-full bg-green-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition"
            >
              <Mic size={32} />
            </button>
          )}
          {recording && (
            <div className="flex flex-col items-center">
              <button
                onClick={onStopRecording}
                className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100"
              >
                <div className="w-6 h-6 bg-white rounded-md" />
              </button>
              <span className="text-xs text-red-500 font-bold mt-2">녹음 중...</span>
            </div>
          )}
          {audioUrl && !recording && !loading && (
            <div className="flex gap-2 w-full animate-in slide-in-from-bottom">
              <button onClick={onCancelAudio} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
              <button onClick={onAnalyze} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md">피드백 받기</button>
            </div>
          )}
          {!audioUrl && !recording && !loading && courseType === "dialogue" && isAllMyLinesFinished() && (
            <div className="w-full animate-in slide-in-from-bottom">
              <button onClick={onNextDialogue} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg">
                🎉 참 잘했어요! 다음 대화로 이동 ▶
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}