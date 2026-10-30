"use client";
// app/admin/StudentHistoryPanel.tsx
// 동국대 / 단국대 학생별 발음 학습 기록(history) 조회 및 통계 대시보드

import { useEffect, useState, useMemo } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  BarChart3, RefreshCw, Loader2, User, Calendar, Award,
  CheckCircle2, AlertCircle, Search, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import type {
  StudentLearningSummary,
  StudentHistoryRecord,
} from "@/app/api/admin/student-history/route";

interface Props {
  univ: "dongguk" | "dankook";
  idToken: string;
  initialStudentEmail?: string | null;
}

function formatDateTime(ms: number | null): string {
  if (!ms) return "기록 없음";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function getScoreBadgeStyle(score: number) {
  if (score >= 90) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (score >= 75) return "bg-blue-100 text-blue-800 border-blue-300";
  if (score >= 55) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-red-100 text-red-700 border-red-300";
}

function getCourseLabel(type: string) {
  switch (type) {
    case "dongguk":
      return { text: "동국대 1급", cls: "bg-amber-100 text-amber-800" };
    case "dankook":
      return { text: "단국대 코스", cls: "bg-blue-100 text-blue-800" };
    case "word":
      return { text: "일반 단어", cls: "bg-slate-100 text-slate-700" };
    case "sentence":
      return { text: "일반 문장", cls: "bg-indigo-100 text-indigo-700" };
    case "dialogue":
      return { text: "실전 담화", cls: "bg-purple-100 text-purple-700" };
    default:
      return { text: type, cls: "bg-slate-100 text-slate-700" };
  }
}

export default function StudentHistoryPanel({
  univ,
  idToken,
  initialStudentEmail = null,
}: Props) {
  const [students, setStudents] = useState<StudentLearningSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(initialStudentEmail);
  const [courseFilter, setCourseFilter] = useState<"all" | "univ_only">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  const isDongguk = univ === "dongguk";
  const univLabel = isDongguk ? "동국대" : "단국대";
  const accentColor = isDongguk ? "amber" : "blue";

  useEffect(() => {
    if (initialStudentEmail !== undefined) {
      setSelectedEmail(initialStudentEmail);
    }
  }, [initialStudentEmail]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/student-history?univ=${univ}`,
        { method: "GET" },
        idToken
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "학습 기록 조회 실패");
      setStudents(data.students || []);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "학습 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [univ]);

  // 전체 요약 통계 계산
  const overview = useMemo(() => {
    const totalStudents = students.length;
    const activeStudents = students.filter(s => s.totalCount > 0).length;
    const allRecords = students.flatMap(s => s.records);
    const totalPractices = allRecords.length;
    const univPractices = allRecords.filter(r => r.type === univ).length;
    const avgScore =
      totalPractices > 0
        ? Math.round(allRecords.reduce((acc, r) => acc + r.score, 0) / totalPractices)
        : 0;
    const bestScore = totalPractices > 0 ? Math.max(...allRecords.map(r => r.score)) : 0;

    return {
      totalStudents,
      activeStudents,
      totalPractices,
      univPractices,
      avgScore,
      bestScore,
    };
  }, [students, univ]);

  // 필터링된 상세 학습 기록
  const filteredRecords = useMemo(() => {
    let list: StudentHistoryRecord[] = [];
    if (selectedEmail) {
      const target = students.find(s => s.email === selectedEmail);
      list = target ? target.records : [];
    } else {
      list = students.flatMap(s => s.records);
      list.sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));
    }

    if (courseFilter === "univ_only") {
      list = list.filter(r => r.type === univ);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        r =>
          r.text.toLowerCase().includes(q) ||
          r.recognized.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.studentId.toLowerCase().includes(q) ||
          r.studentEmail.toLowerCase().includes(q)
      );
    }

    return list;
  }, [students, selectedEmail, courseFilter, searchQuery, univ]);

  return (
    <div className="space-y-6">
      {/* 1. 상단 전체 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">참여 학생 / 전체 학생</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {overview.activeStudents}명{" "}
            <span className="text-sm font-bold text-slate-400">/ {overview.totalStudents}명</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">총 발음 연습 횟수</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {overview.totalPractices}회{" "}
            <span className="text-xs font-bold text-indigo-600">
              ({univLabel} {overview.univPractices}회)
            </span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">학생 전체 평균 점수</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{overview.avgScore}점</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">최고 달성 점수</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{overview.bestScore}점</p>
        </div>
      </div>

      {/* 2. 학생별 학습 요약 리스트 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <User size={18} className={accentColor === "amber" ? "text-amber-600" : "text-blue-600"} />
              학생별 학습 현황 ({students.length}명)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              학생을 클릭하면 아래에서 해당 학생의 문장별 발음 기록과 AI 피드백을 상세히 볼 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedEmail && (
              <button
                onClick={() => setSelectedEmail(null)}
                className="text-xs bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-slate-900 transition"
              >
                전체 학생 기록 보기
              </button>
            )}
            <button
              onClick={loadHistory}
              disabled={loading}
              className="flex items-center gap-1 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-900 hover:bg-slate-50 transition"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 새로고침
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-600">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            학생들의 학습 기록을 불러오는 중...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold">
            ❌ {error}
          </div>
        ) : students.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            아직 등록된 {univLabel} 학생이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {students.map(stu => {
              const isSelected = selectedEmail === stu.email;
              return (
                <button
                  key={stu.email}
                  type="button"
                  onClick={() => setSelectedEmail(isSelected ? null : stu.email)}
                  className={`text-left p-4 rounded-xl border-2 transition flex flex-col justify-between gap-2 ${
                    isSelected
                      ? accentColor === "amber"
                        ? "border-amber-500 bg-amber-50/70 shadow-sm"
                        : "border-blue-600 bg-blue-50/70 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-slate-900 truncate">
                          {stu.name}
                        </span>
                        {stu.studentId && (
                          <span className="text-[11px] font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                            {stu.studentId}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                        {stu.email}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        stu.totalCount > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {stu.totalCount > 0 ? `${stu.totalCount}회 연습` : "미학습"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold">{univLabel} 문장</p>
                      <p className="text-xs font-black text-slate-900">{stu.univCount}회</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold">평균 점수</p>
                      <p className="text-xs font-black text-blue-600">
                        {stu.totalCount > 0 ? `${stu.avgScore}점` : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold">최고 점수</p>
                      <p className="text-xs font-black text-emerald-600">
                        {stu.totalCount > 0 ? `${stu.bestScore}점` : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> 최근: {formatDateTime(stu.lastStudyAtMs)}
                    </span>
                    <span className="font-bold text-indigo-600">
                      {isSelected ? "선택됨 ✓" : "상세 보기 →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. 상세 발음 연습 기록 리스트 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-600" />
              {selectedEmail
                ? `${students.find(s => s.email === selectedEmail)?.name ?? selectedEmail} 학생의 상세 학습 기록 (${filteredRecords.length}건)`
                : `전체 학생 최근 발음 학습 기록 (${filteredRecords.length}건)`}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 코스 필터 */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-bold">
              <button
                type="button"
                onClick={() => setCourseFilter("all")}
                className={`px-3 py-1.5 transition ${
                  courseFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                전체 기록
              </button>
              <button
                type="button"
                onClick={() => setCourseFilter("univ_only")}
                className={`px-3 py-1.5 transition ${
                  courseFilter === "univ_only"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {univLabel} 문장만
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="학생 이름·학번·문장 검색"
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-1">
            <p className="font-bold text-sm text-slate-700">표시할 발음 학습 기록이 없습니다.</p>
            <p>학생이 문장 발음 연습을 완료하면 이곳에 점수와 발음 인식 결과가 실시간으로 기록됩니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto pr-1">
            {filteredRecords.map(rec => {
              const badge = getCourseLabel(rec.type);
              const isExpanded = expandedRecordId === rec.id;
              return (
                <div key={`${rec.studentEmail}_${rec.id}`} className="py-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      {/* 학생 정보 + 코스 배지 + 일시 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          👤 {rec.studentName}
                          {rec.studentId ? ` (${rec.studentId})` : ""}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${badge.cls}`}>
                          {badge.text}
                          {rec.chapter ? ` · ${rec.chapter}과` : ""}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {formatDateTime(rec.dateMs)}
                        </span>
                      </div>

                      {/* 목표 문장 & 학생 실제 발음 비교 */}
                      <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <p className="font-black text-sm text-slate-900">
                          🎯 목표: &ldquo;{rec.text}&rdquo;
                          {rec.pronunciation && (
                            <span className="text-xs font-bold text-emerald-700 ml-1.5">
                              {rec.pronunciation}
                            </span>
                          )}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-slate-700">
                        🗣️ 학생 발음:{" "}
                        <span
                          className={
                            rec.score >= 80
                              ? "text-blue-700 font-black"
                              : "text-rose-600 font-black"
                          }
                        >
                          &ldquo;{rec.recognized || "(인식된 음성 없음)"}&rdquo;
                        </span>
                      </p>
                    </div>

                    {/* 우측 점수 배지 & 피드백 토글 */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span
                        className={`px-3 py-1.5 rounded-xl border text-sm font-black ${getScoreBadgeStyle(
                          rec.score
                        )}`}
                      >
                        {rec.score}점
                      </span>
                      {(rec.feedback || rec.advice) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRecordId(isExpanded ? null : rec.id)
                          }
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
                        >
                          AI 피드백
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 펼쳐진 AI 상세 피드백 */}
                  {isExpanded && (rec.feedback || rec.advice) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 text-slate-800">
                      {rec.feedback && (
                        <p>
                          <span className="font-black text-indigo-700">📌 발음 분석: </span>
                          {rec.feedback}
                        </p>
                      )}
                      {rec.advice && (
                        <p>
                          <span className="font-black text-emerald-700">💡 교정 팁: </span>
                          {rec.advice}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
