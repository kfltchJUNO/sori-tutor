"use client";
// app/components/StudentHistoryModal.tsx
// 학교 전용 포털: 등록 학생 전용 학습 기록 및 오류 유형 분석 모달

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import {
  X, BarChart3, CheckCircle2, AlertTriangle, Sparkles,
  BookOpen, Clock, ChevronDown, ChevronUp, Award, RefreshCw, Layers, Flame
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentEmail: string;
  studentName?: string;
  univKey: "dongguk" | "dongguk3" | "dankook";
  univName: string;
  themeColor: "amber" | "blue";
  onStartWeaknessDrill?: () => void;
}

export interface StudentRecordItem {
  id: string;
  text: string;
  pronunciation?: string;
  chapter?: number;
  score: number;
  overallScore?: number;
  categoryScores?: {
    consonant?: number;
    vowel?: number;
    rule?: number;
    intonation?: number;
  };
  summary?: string;
  feedback?: string;
  advice?: string;
  errors?: {
    id?: string;
    category: string;
    subCategory: string;
    tag: string;
    targetWord: string;
    expectedPhoneme: string;
    userPhoneme: string;
    tip: string;
  }[];
  masteredTags?: string[];
  recognized?: string;
  correct?: string;
  type?: string;
  date?: any;
}

export default function StudentHistoryModal({
  isOpen,
  onClose,
  studentEmail,
  studentName,
  univKey,
  univName,
  themeColor,
  onStartWeaknessDrill,
}: Props) {
  const [records, setRecords] = useState<StudentRecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"analysis" | "timeline">("analysis");

  const primaryColor = themeColor === "amber" ? "amber" : "blue";
  const primaryBg = themeColor === "amber" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700";
  const primaryLightBg = themeColor === "amber" ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-blue-50 text-blue-900 border-blue-200";

  const loadStudentRecords = async () => {
    if (!studentEmail) return;
    setLoading(true);
    try {
      const histRef = collection(db, "sori_users", studentEmail, "history");
      const q = query(histRef, orderBy("date", "desc"), limit(100));
      const snap = await getDocs(q);

      const list: StudentRecordItem[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          text: d.text || "",
          pronunciation: d.pronunciation || "",
          chapter: d.chapter,
          score: d.overallScore ?? d.score ?? 0,
          overallScore: d.overallScore ?? d.score,
          categoryScores: d.categoryScores,
          summary: d.summary || d.feedback || "",
          feedback: d.feedback,
          advice: d.advice,
          errors: Array.isArray(d.errors) ? d.errors : [],
          masteredTags: Array.isArray(d.masteredTags) ? d.masteredTags : [],
          recognized: d.recognized || "",
          correct: d.correct || "",
          type: d.type || "",
          date: d.date,
        });
      });

      setRecords(list);
    } catch (e) {
      console.error("학습 기록 로딩 오류:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && studentEmail) {
      loadStudentRecords();
    }
  }, [isOpen, studentEmail]);

  // 통계 집계
  const stats = useMemo(() => {
    const total = records.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: 0,
        bestScore: 0,
        weakCount: 0,
        categoryAverages: { consonant: 0, vowel: 0, rule: 0, intonation: 0 },
        errorTagCounts: [] as { tag: string; category: string; subCategory: string; count: number; latestTip: string }[],
        masteredTagSet: [] as string[],
      };
    }

    const avgScore = Math.round(records.reduce((acc, r) => acc + (r.score || 0), 0) / total);
    const bestScore = Math.max(...records.map(r => r.score || 0));

    // 4대 영역 평균 (categoryScores가 있는 레코드 기준)
    let cSum = 0, vSum = 0, rSum = 0, iSum = 0;
    let catCount = 0;

    const errorMap = new Map<string, { category: string; subCategory: string; count: number; latestTip: string }>();
    const masteredSet = new Set<string>();

    records.forEach(rec => {
      if (rec.categoryScores) {
        catCount++;
        cSum += rec.categoryScores.consonant ?? 100;
        vSum += rec.categoryScores.vowel ?? 100;
        rSum += rec.categoryScores.rule ?? 100;
        iSum += rec.categoryScores.intonation ?? 100;
      }

      // 오류 태그 집계
      if (rec.errors) {
        rec.errors.forEach(err => {
          if (!err.tag) return;
          const prev = errorMap.get(err.tag);
          if (prev) {
            prev.count += 1;
          } else {
            errorMap.set(err.tag, {
              category: err.category,
              subCategory: err.subCategory,
              count: 1,
              latestTip: err.tip,
            });
          }
        });
      }

      // 마스터 태그 집계
      if (rec.masteredTags) {
        rec.masteredTags.forEach(t => masteredSet.add(t));
      }
    });

    const categoryAverages = catCount > 0 ? {
      consonant: Math.round(cSum / catCount),
      vowel: Math.round(vSum / catCount),
      rule: Math.round(rSum / catCount),
      intonation: Math.round(iSum / catCount),
    } : {
      consonant: avgScore,
      vowel: avgScore,
      rule: Math.max(0, avgScore - 8),
      intonation: avgScore,
    };

    const errorTagCounts = Array.from(errorMap.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);

    const weakCount = records.filter(r => (r.score < 75) || (r.errors && r.errors.length > 0)).length;

    return {
      total,
      avgScore,
      bestScore,
      weakCount,
      categoryAverages,
      errorTagCounts,
      masteredTagSet: Array.from(masteredSet),
    };
  }, [records]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${
              primaryColor === "amber" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
            }`}>
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-base text-slate-900 leading-tight">나의 학습 기록 및 오류 분석</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {univName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {studentName ? `${studentName} 학생` : "학생"}의 발음 훈련 통계 및 취약점 진단
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadStudentRecords}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
              title="새로고침"
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 상단 탭 (오류 분석 vs 상세 기록) */}
        <div className="flex border-b border-slate-200 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab("analysis")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === "analysis"
                ? "border-indigo-600 text-indigo-700 font-black"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <Sparkles size={13} />
            오류 유형 및 역량 분석
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === "timeline"
                ? "border-indigo-600 text-indigo-700 font-black"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <Clock size={13} />
            상세 연습 기록 ({records.length})
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
            <RefreshCw size={24} className="animate-spin mb-2 text-indigo-500" />
            학습 기록 및 오류 데이터를 불러오는 중...
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center space-y-2">
            <BookOpen size={36} className="text-slate-300 mx-auto" />
            <p className="font-bold text-slate-600 text-sm">아직 연습한 기록이 없습니다.</p>
            <p className="text-[11px] text-slate-400">문장을 소리 내어 말하고 AI 평가를 받아보세요!</p>
          </div>
        ) : (
          <div className="overflow-y-auto pr-1 flex-1 space-y-4">

            {/* ── [탭 1] 오류 유형 및 역량 분석 ── */}
            {activeTab === "analysis" && (
              <>
                {/* 1. 종합 요약 카드 */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">총 연습 횟수</span>
                    <span className="text-lg font-black text-slate-900">{stats.total}회</span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] text-indigo-500 font-bold block">전체 평균 점수</span>
                    <span className="text-lg font-black text-indigo-700">{stats.avgScore}점</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] text-emerald-600 font-bold block">최고 점수</span>
                    <span className="text-lg font-black text-emerald-700">{stats.bestScore}점</span>
                  </div>
                </div>

                {/* 취약 발음 집중 복습 배너 */}
                {onStartWeaknessDrill && stats.weakCount > 0 && (
                  <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 font-black text-sm">
                        <Flame size={18} className="text-amber-200 fill-amber-200" />
                        취약 발음 집중 복습 모드 ({stats.weakCount}개 문장)
                      </div>
                      <p className="text-[11px] text-rose-100 mt-0.5 leading-snug">
                        점수가 75점 미만이거나 오류가 감지된 문장만 모아서 빠르게 재학습합니다.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onStartWeaknessDrill();
                      }}
                      className="px-3 py-2 bg-white text-rose-600 font-black text-xs rounded-xl shadow-xs hover:bg-rose-50 transition shrink-0 flex items-center gap-1 active:scale-95"
                    >
                      지금 복습
                    </button>
                  </div>
                )}

                {/* 2. 4대 영역별 점수 분석 */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Layers size={14} className="text-indigo-600" />
                      4대 발음 영역별 완성도
                    </span>
                    <span className="text-[10px] text-slate-400">각 100점 만점 기준</span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {/* 자음 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">1. 자음 (Consonant)</span>
                        <span className="text-indigo-600 font-mono font-black">{stats.categoryAverages.consonant}점</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${stats.categoryAverages.consonant}%` }}
                        />
                      </div>
                    </div>

                    {/* 모음 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">2. 모음 (Vowel)</span>
                        <span className="text-purple-600 font-mono font-black">{stats.categoryAverages.vowel}점</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${stats.categoryAverages.vowel}%` }}
                        />
                      </div>
                    </div>

                    {/* 음운 변동 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">3. 음운 변동 (Phonological Rule)</span>
                        <span className="text-amber-600 font-mono font-black">{stats.categoryAverages.rule}점</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${stats.categoryAverages.rule}%` }}
                        />
                      </div>
                    </div>

                    {/* 억양 및 운율 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">4. 억양 및 운율 (Suprasegmental)</span>
                        <span className="text-emerald-600 font-mono font-black">{stats.categoryAverages.intonation}점</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${stats.categoryAverages.intonation}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. 자주 틀리는 오류 유형 TOP & 맞춤 행동 지침 */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-500" />
                      자주 틀리는 오류 유형 (취약 태그)
                    </span>
                    <span className="text-[10px] text-slate-400">발생 빈도순 정렬</span>
                  </div>

                  {stats.errorTagCounts.length === 0 ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>아직 감지된 주요 발음 오류가 없습니다! 매우 훌륭합니다. 🎉</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {stats.errorTagCounts.slice(0, 6).map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                {item.category} · {item.subCategory}
                              </span>
                              <span className="text-xs font-black text-rose-600">
                                {item.tag}
                              </span>
                            </div>
                            <span className="text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-lg shrink-0">
                              {item.count}회 감지
                            </span>
                          </div>
                          {item.latestTip && (
                            <div className="p-2.5 bg-amber-50/70 border border-amber-100 rounded-xl text-xs text-amber-900 leading-relaxed">
                              <span className="font-bold block mb-0.5">💡 선생님의 교정 팁:</span>
                              {item.latestTip}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. 마스터한 발음 칭찬 뱃지 */}
                {stats.masteredTagSet.length > 0 && (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-2">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <Award size={15} className="text-emerald-600" />
                      내가 완벽하게 마스터한 발음 규칙! 🌟
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.masteredTagSet.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs font-bold bg-white text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl shadow-2xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── [탭 2] 상세 연습 타임라인 ── */}
            {activeTab === "timeline" && (
              <div className="space-y-3">
                {records.map(rec => {
                  const isExpanded = expandedId === rec.id;
                  const dateStr = rec.date?.toDate
                    ? new Date(rec.date.toDate()).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "최근 연습";

                  return (
                    <div
                      key={rec.id}
                      className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2.5 transition hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {rec.chapter && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                {rec.chapter}과
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 font-mono">{dateStr}</span>
                          </div>
                          <h4 className="text-sm font-black text-slate-900 leading-snug">
                            {rec.text}
                          </h4>
                          {rec.pronunciation && (
                            <span className="text-xs text-emerald-600 font-bold">
                              [{rec.pronunciation}]
                            </span>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-xl font-black ${
                            rec.score >= 80 ? "text-indigo-600" : rec.score >= 60 ? "text-amber-600" : "text-rose-600"
                          }`}>
                            {rec.score}점
                          </span>
                        </div>
                      </div>

                      {/* 인식된 소리 */}
                      {rec.recognized && (
                        <div className="text-xs bg-slate-50 p-2 rounded-xl text-slate-700">
                          <span className="text-slate-400 mr-1.5 font-bold">내 발음:</span>
                          <span className="font-bold text-slate-800">{rec.recognized}</span>
                        </div>
                      )}

                      {/* 오류 태그 뱃지 리스트 */}
                      {rec.errors && rec.errors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rec.errors.map((err, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-lg"
                            >
                              {err.tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 펼쳐보기 버튼 */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                        className="text-[11px] text-indigo-600 font-bold flex items-center gap-1 hover:underline pt-1"
                      >
                        {isExpanded ? (
                          <>
                            접기 <ChevronUp size={12} />
                          </>
                        ) : (
                          <>
                            상세 오류 분석 및 교정 팁 보기 <ChevronDown size={12} />
                          </>
                        )}
                      </button>

                      {/* 상세 오류 내역 (펼침 영역) */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-100 space-y-2 animate-in fade-in">
                          {rec.summary && (
                            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl">
                              {rec.summary}
                            </p>
                          )}

                          {rec.categoryScores && (
                            <div className="grid grid-cols-4 gap-1 text-[11px] font-bold text-center pt-1">
                              <div className="bg-slate-50 p-1.5 rounded-lg border">
                                <span className="text-[9px] text-slate-400 block">자음</span>
                                <span className="text-indigo-600">{rec.categoryScores.consonant ?? 100}</span>
                              </div>
                              <div className="bg-slate-50 p-1.5 rounded-lg border">
                                <span className="text-[9px] text-slate-400 block">모음</span>
                                <span className="text-purple-600">{rec.categoryScores.vowel ?? 100}</span>
                              </div>
                              <div className="bg-slate-50 p-1.5 rounded-lg border">
                                <span className="text-[9px] text-slate-400 block">음운변동</span>
                                <span className="text-amber-600">{rec.categoryScores.rule ?? 100}</span>
                              </div>
                              <div className="bg-slate-50 p-1.5 rounded-lg border">
                                <span className="text-[9px] text-slate-400 block">억양</span>
                                <span className="text-emerald-600">{rec.categoryScores.intonation ?? 100}</span>
                              </div>
                            </div>
                          )}

                          {rec.errors && rec.errors.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {rec.errors.map((err, errIdx) => (
                                <div
                                  key={errIdx}
                                  className="p-2.5 bg-rose-50/60 border border-rose-100 rounded-xl text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-rose-800">{err.tag}</span>
                                    <span className="text-slate-500 font-mono">
                                      단어: &quot;{err.targetWord}&quot; (정답: [{err.expectedPhoneme}] ↔ 내소리: [{err.userPhoneme}])
                                    </span>
                                  </div>
                                  <p className="text-slate-700 leading-relaxed text-[11px]">
                                    👉 {err.tip}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition shrink-0"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
