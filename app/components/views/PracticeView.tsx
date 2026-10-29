"use client";
// components/views/PracticeView.tsx
// AdSense push는 ins 요소가 DOM에 마운트된 후 실행해야 함
import { useEffect, useState, useCallback, useMemo } from "react";
import AdUnit from "@/app/components/AdUnit";
import AudioWaveform from "@/app/components/AudioWaveform";
import SoriIcon from "@/app/components/SoriIcon";
import { X, Volume2, CheckCircle, Info, Languages, Mic, ChevronLeft, Headphones, Sparkles } from "lucide-react";
import type { AnalysisResult, CourseType } from "@/types";

interface ParsedLine { role: string; text: string; }

const ANALYSIS_STEPS = [
  { icon: "👂", title: "귀를 쫑긋! 목소리 파형을 듣고 있어요", sub: "배경 소음을 걸러내고 실제 발음만 추출 중..." },
  { icon: "🔬", title: "글자마다 초성 · 모음 · 받침을 현미경 분석 중!", sub: "받침이 빠지지 않았는지, 모음이 정확한지 대조하고 있어요" },
  { icon: "🎵", title: "연음과 억양 리듬을 체크하고 있어요", sub: "한국어 원어민 발음 흐름과 비교하는 중..." },
  { icon: "✍️", title: "맞춤 발음 교정 노트를 작성하고 있어요!", sub: "거의 다 됐어요! 결과를 곧 보여드릴게요 ✨" },
];

const FUN_TIPS = [
  "💡 받침 뒤에 모음('ㅇ')이 오면 받침 소리가 다음 글자로 스르륵 넘어가요! (한국에 → [한구게])",
  "💡 '학교'는 [학꾜], '식당'은 [식땅]처럼 받침 뒤에서 된소리로 소리 날 때가 많아요!",
  "💡 '요'와 '여'의 차이! '요'는 입술을 동그랗게 오므리고, '여'는 입을 자연스럽게 벌려요.",
  "💡 '작년'은 [장년], '입니다'는 [임니다]처럼 뒷글자 'ㄴ/ㅁ'을 만나면 코소리(비음)로 부드럽게 바뀌어요!",
  "💡 글자와 글자 사이를 로보트처럼 끊어 읽지 말고, 한 호흡으로 부드럽게 이어 읽어보세요!",
];

// ── 발음 채점 중 인터랙티브 스캐너 화면 ────────────────────────────
function AnalyzingOverlay({
  targetText,
  pronunciation,
  ruleFormula,
}: {
  targetText: string;
  pronunciation?: string;
  ruleFormula?: string;
}) {
  const syllables = useMemo(() => {
    const chars = Array.from(targetText.trim()).filter(c => /[가-힣]/.test(c));
    return chars.length > 0 ? chars : ["소", "리", "분석"];
  }, [targetText]);

  const [scanIdx, setScanIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(8);
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * FUN_TIPS.length));

  // 음절 스캐너 이동 애니메이션 (280ms마다 다음 글자 스캔)
  useEffect(() => {
    const timer = setInterval(() => {
      setScanIdx(prev => (prev + 1) % syllables.length);
    }, 280);
    return () => clearInterval(timer);
  }, [syllables.length]);

  // 단계별 진행률 & 스텝 전환 애니메이션
  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      // 0~4.5초 동안 8% -> 94%까지 부드럽게 감속 상승
      const nextProg = Math.min(94, Math.round(8 + 86 * (1 - Math.exp(-elapsed / 2.2))));
      setProgress(nextProg);

      if (elapsed < 1.1) setStepIdx(0);
      else if (elapsed < 2.4) setStepIdx(1);
      else if (elapsed < 3.7) setStepIdx(2);
      else setStepIdx(3);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // 꿀팁 롤링 (2.8초마다 전환)
  useEffect(() => {
    const timer = setInterval(() => {
      setTipIdx(prev => (prev + 1) % FUN_TIPS.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const currentStep = ANALYSIS_STEPS[stepIdx];

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-4 animate-in fade-in duration-300">
      <div className="w-full bg-white rounded-3xl shadow-xl border-2 border-indigo-100 p-6 space-y-6 relative overflow-hidden">
        {/* 상단 배경 장식 오로라 */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-200/40 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-blue-200/40 rounded-full blur-2xl pointer-events-none" />

        {/* 1. 상단 배지 & 현재 분석 단계 */}
        <div className="text-center space-y-2 relative">
          <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full text-xs font-black">
            <Sparkles size={13} className="animate-spin" />
            AI 정밀 발음 스캐너 가동 중 ({progress}%)
          </div>
          <div className="pt-1">
            <div className="text-3xl mb-1 animate-bounce inline-block">{currentStep.icon}</div>
            <h3 className="text-base font-black text-slate-800 transition-all">{currentStep.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{currentStep.sub}</p>
          </div>
        </div>

        {/* 2. 글자별 레이저 스캐너 박스 */}
        <div className="bg-slate-900 rounded-2xl p-4 shadow-inner relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-bold text-indigo-300 mb-2.5 px-1">
            <span>🔍 실시간 음절 스캔 (초성·모음·받침)</span>
            <span className="font-mono text-emerald-400">
              [{syllables[scanIdx]}] 분석 중...
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 py-2">
            {syllables.map((ch, idx) => {
              const isScanning = idx === scanIdx;
              const isPassed = idx < scanIdx;
              return (
                <div
                  key={idx}
                  className={`relative w-11 h-12 rounded-xl flex items-center justify-center font-black text-lg transition-all duration-200 ${
                    isScanning
                      ? "bg-gradient-to-b from-indigo-500 to-blue-600 text-white scale-115 shadow-lg shadow-indigo-500/50 ring-2 ring-amber-300 -translate-y-1"
                      : isPassed
                      ? "bg-emerald-950/90 text-emerald-300 border border-emerald-600/50"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {ch}
                  {isScanning && (
                    <span className="absolute -top-2 -right-2 text-xs bg-amber-400 text-slate-900 rounded-full w-4 h-4 flex items-center justify-center shadow">
                      🔎
                    </span>
                  )}
                  {isPassed && !isScanning && (
                    <span className="absolute -bottom-1 right-1 text-[9px] text-emerald-400">✓</span>
                  )}
                </div>
              );
            })}
          </div>
          {pronunciation && (
            <p className="text-center text-xs text-indigo-200/90 mt-2 font-medium">
              목표 발음: <span className="text-amber-300 font-bold">{pronunciation}</span>
            </p>
          )}
        </div>

        {/* 3. 프로그레스 바 & 4단계 스텝 인디케이터 */}
        <div className="space-y-2.5">
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-200 relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[
              { label: "음성 인식", idx: 0 },
              { label: "자모 대조", idx: 1 },
              { label: "억양·연음", idx: 2 },
              { label: "노트 작성", idx: 3 },
            ].map(item => {
              const active = stepIdx === item.idx;
              const done = stepIdx > item.idx;
              return (
                <div
                  key={item.idx}
                  className={`text-center py-1.5 px-1 rounded-lg text-[11px] font-bold border transition-all ${
                    active
                      ? "bg-indigo-50 border-indigo-400 text-indigo-700 shadow-xs"
                      : done
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}
                >
                  {done ? "✅ " : active ? "⏳ " : ""}{item.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. 기다리는 동안 보는 원포인트 발음 꿀팁 */}
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 text-left transition-all">
          <div className="text-[11px] font-black text-amber-800 mb-1 flex items-center justify-between">
            <span>🎯 기다리는 동안 보는 1초 발음 꿀팁</span>
            {ruleFormula && (
              <span className="bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded-full text-[10px]">
                {ruleFormula}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-950 font-medium leading-relaxed break-keep">
            {FUN_TIPS[tipIdx]}
          </p>
        </div>
      </div>
    </div>
  );
}

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
  analyser?: AnalyserNode | null;

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
  isEmbedMode?: boolean;
}

export default function PracticeView({
  courseType, currentProblem, result, translation,
  parsedScript, myRole, targetLineIndex, completedLines,
  isShadowingMode, ttsLoading, loading, recording, audioUrl, analyser,
  onBack, onSetMyRole, onSetTargetLine, onToggleShadowing,
  onPlayTTS, onRetry, onNext, onTranslate,
  onStartRecording, onStopRecording, onCancelAudio, onAnalyze, onNextDialogue,
  isAllMyLinesFinished, isEmbedMode,
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

  const activeTargetText =
    courseType === "dialogue" && targetLineIndex !== null
      ? parsedScript[targetLineIndex]?.text ?? ""
      : currentProblem?.text ?? "";

  return (
    <div className="flex flex-col h-full pb-24">
      {/* 상단 컨트롤 */}
      <div className="flex justify-between items-center mb-4">
        <button onClick={onBack}><X size={20} /></button>
        {courseType === "dongguk" ? (
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
            <span>🏫</span> 동국한국어 1급 발음 마스터
          </div>
        ) : courseType === "dankook" ? (
          <div className="flex items-center gap-1.5 text-xs font-black text-blue-800 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
            <span>🐻</span> 단국한국어 발음 마스터
          </div>
        ) : courseType === "dialogue" ? (
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

      {/* 1. AI 채점 진행 중일 때 인터랙티브 스캐너 표시 */}
      {loading && !result ? (
        <AnalyzingOverlay
          targetText={activeTargetText}
          pronunciation={courseType !== "dialogue" ? currentProblem?.pronunciation : undefined}
          ruleFormula={courseType !== "dialogue" ? currentProblem?.rule_formula : undefined}
        />
      ) : result ? (
        /* 2. 결과 화면 */
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
          <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-2 border-b">
            <h3 className="font-bold text-lg text-slate-800">분석 결과</h3>
            <span className={`text-2xl font-black ${result.score >= 80 ? "text-green-500" : "text-orange-500"}`}>
              {result.score}점
            </span>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            {/* 음절 단위 발음 정밀 하이라이트 */}
            {result.syllableResults && result.syllableResults.length > 0 ? (
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-1.5">음절별 발음 진단 (초록: 일치, 주황: 받침 오류, 보라: 모음 오류, 빨강: 불일치)</span>
                <div className="flex flex-wrap gap-1.5 bg-white p-3 rounded-xl border border-slate-200">
                  {result.syllableResults.map((s, idx) => {
                    const isMatch = s.status === "match";
                    const isCoda = s.status === "coda_error";
                    const isVowel = s.status === "vowel_error";
                    return (
                      <span
                        key={idx}
                        title={s.tip}
                        className={`px-2.5 py-1 rounded-lg font-black text-lg transition-all cursor-help ${
                          isMatch
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : isCoda
                            ? "bg-amber-100 text-amber-800 border-2 border-amber-400 underline decoration-amber-500"
                            : isVowel
                            ? "bg-purple-100 text-purple-800 border-2 border-purple-400"
                            : "bg-red-100 text-red-700 border border-red-300 line-through"
                        }`}
                      >
                        {s.char}
                      </span>
                    );
                  })}
                </div>
                {/* 틀린 음절 맞춤 팁 */}
                {result.syllableResults.some(s => s.status !== "match" && s.tip) && (
                  <div className="mt-2 space-y-1">
                    {result.syllableResults.filter(s => s.status !== "match" && s.tip).map((s, idx) => (
                      <p key={idx} className="text-xs text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center gap-1.5 shadow-sm">
                        <span className="font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">[{s.char}]</span>
                        <span>{s.tip}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-1">인식된 소리</span>
                <div className="text-lg font-bold text-red-500 bg-white p-2 rounded border border-red-100">
                  {result.recognized}
                </div>
              </div>
            )}
            <div className="flex justify-center"><div className="w-0.5 h-3 bg-slate-300" /></div>
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">소리 나는 대로 발음</span>
              <div className="text-lg font-black text-green-700 bg-green-50 p-2.5 rounded-xl border border-green-200 tracking-wide">
                {result.correct.startsWith("[") ? result.correct : `[${result.correct}]`}
              </div>
            </div>
            {(result.ruleFormula || currentProblem?.rule_formula) && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-amber-950 animate-in fade-in">
                <div className="flex items-center gap-1.5 font-black text-xs text-amber-700 mb-1">
                  <span>📌</span> 초급 발음 변화 공식
                </div>
                <div className="text-base font-black text-amber-900 tracking-wide font-mono">
                  {result.ruleFormula || currentProblem?.rule_formula}
                </div>
              </div>
            )}
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
            <div className="flex justify-end mb-1">
              <button
                onClick={onTranslate}
                className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded-lg shadow-sm flex items-center gap-1 hover:bg-blue-50 transition"
              >
                <Languages size={12} /> {courseType === "dongguk" || courseType === "dankook" ? "무료 번역" : <>번역 (1<SoriIcon size={12} className="inline ml-0.5" />)</>}
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
          {/* 광고 #3: 분석 결과 확인 후 (Embed 모드에서는 숨김) */}
          {!isEmbedMode && (
            <div className="w-full bg-slate-50 rounded-xl overflow-hidden my-2 border border-slate-100">
              <AdUnit slot="SLOT_ID_3" format="rectangle" />
            </div>
          )}
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
                  💡 {courseType === "word" ? currentProblem.tip : (courseType === "dongguk" || courseType === "dankook") ? (currentProblem.rule_formula ? `규칙: ${currentProblem.rule_formula}` : currentProblem.tip || "천천히 또렷하게 읽어보세요.") : currentProblem.translation}
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
            <div className="flex items-center gap-2.5 text-indigo-600 font-black text-sm py-1">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>소리튜터 AI가 음절마다 꼼꼼히 채점하고 있어요... ✨</span>
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
            <div className="flex flex-col items-center gap-2">
              <AudioWaveform analyser={analyser ?? null} isRecording={recording} className="mb-1" />
              <button
                onClick={onStopRecording}
                className="w-16 h-16 rounded-full bg-slate-800 text-white shadow-xl flex items-center justify-center animate-pulse ring-4 ring-slate-100"
              >
                <div className="w-6 h-6 bg-red-500 rounded-md" />
              </button>
              <span className="text-xs text-red-500 font-bold">녹음 중입니다... (탭하여 완료)</span>
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
