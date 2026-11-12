"use client";
// app/admin/DemoSurveySection.tsx
// 최고 관리자 전용: 테스트/체험 링크 관리, 기기 횟수 리셋, 5개 국어 설문조사 응답 조회 및 통계 대시보드

import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  MessageSquare, RefreshCw, Loader2, Download, Star,
  Languages, Filter, AlertCircle, Calendar, FlaskConical,
  QrCode, ExternalLink, RotateCcw, Copy, Check, Printer,
} from "lucide-react";
import type { DemoSurveyData } from "@/app/api/demo/survey/route";

interface Props {
  idToken: string;
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

const LANG_LABEL_MAP: Record<string, string> = {
  ko: "🇰🇷 한국어",
  en: "🇺🇸 English",
  zh: "🇨🇳 中文",
  ja: "🇯🇵 日本語",
  vi: "🇻🇳 Tiếng Việt",
  my: "🇲🇲 မြန်မာ",
};

export default function DemoSurveySection({ idToken }: Props) {
  const [surveys, setSurveys] = useState<DemoSurveyData[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    avgSatisfaction: "0.0",
    avgClarity: "0.0",
    avgTts: "0.0",
    avgRevisit: "0.0",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("all");

  // 리셋 상태
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDemoQrModal, setShowDemoQrModal] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const demoUrl = `${origin}/demo`;
  const demoQrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
    demoUrl
  )}`;

  const loadSurveys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/demo/survey", { method: "GET" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "설문 조회 실패");
      setSurveys(data.surveys || []);
      setStats(data.stats || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, [idToken]);

  // 내 기기 5회 횟수 즉시 리셋 (관리자 테스트 재개용)
  const handleResetMyDevice = async () => {
    const devId = typeof window !== "undefined" ? localStorage.getItem("sori_demo_device_id") : null;
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await adminFetch(
        "/api/admin/demo-reset",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: devId || "" }),
        },
        idToken
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "초기화 실패");
      setResetMessage("✅ 관리자 기기의 체험 횟수가 0회로 초기화되었습니다. 즉시 다시 5회 테스트하실 수 있습니다!");
      setTimeout(() => setResetMessage(null), 5000);
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setResetting(false);
    }
  };

  // 전체 체험 기기 횟수 일괄 리셋
  const handleResetAllDevices = async () => {
    if (!confirm("모든 기기의 일일 5회 체험 제한 기록을 초기화하시겠습니까? (모든 사용자가 다시 5회 이용 가능해집니다)")) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await adminFetch(
        "/api/admin/demo-reset",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        idToken
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "일괄 초기화 실패");
      setResetMessage(`✅ ${data.message}`);
      setTimeout(() => setResetMessage(null), 5000);
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(demoUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const filteredSurveys = selectedLang === "all"
    ? surveys
    : surveys.filter(s => s.language === selectedLang);

  // CSV 추출
  const handleExportCSV = () => {
    if (filteredSurveys.length === 0) return;

    const headers = [
      "제출일시", "언어", "체험급수",
      "Q1_사용편의성(1~5)", "Q2_피드백도움(1~5)", "Q3_AI음성만족(1~5)", "Q4_재이용의향(1~5)",
      "Q5_주관식의견", "기기식별자"
    ];

    const rows = filteredSurveys.map(s => [
      `"${formatDateTime(s.createdAtMs)}"`,
      `"${s.language}"`,
      `"${s.targetLevel || "미지정"}"`,
      s.satisfaction,
      s.feedbackClarity,
      s.ttsQuality,
      s.revisitIntent,
      `"${(s.comment || "").replace(/"/g, '""')}"`,
      `"${s.deviceId}"`,
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `소리튜터_체험설문응답_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 0. 테스트/체험 링크 관리 & 기기 횟수 리셋 카드 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <FlaskConical className="text-amber-600" /> 테스트·무료 체험 전용 관리실
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              학생 배포용 무설치 체험 링크(`/demo`), 전용 QR 코드, 그리고 관리자 테스트용 횟수 초기화 도구입니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/demo"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition"
            >
              <ExternalLink size={13} /> 체험창 바로 열기
            </a>
          </div>
        </div>

        {resetMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold animate-in fade-in">
            {resetMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 체험 링크 & QR 도구 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              🔗 무설치 체험 링크 & QR
            </h3>
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs font-mono">
              <span className="truncate flex-1 text-slate-600">{demoUrl}</span>
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-bold transition shrink-0"
              >
                {copiedLink ? "복사됨!" : "링크 복사"}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setShowDemoQrModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                <QrCode size={13} /> 대형 QR 코드 보기
              </button>
              <span className="text-[11px] text-slate-500">
                (카메라 스캔 시 앱 설치 없이 즉시 실행)
              </span>
            </div>
          </div>

          {/* 관리자 테스트용 기기 횟수 초기화 */}
          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-3">
            <h3 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
              🔄 관리자 테스트 횟수 리셋 도구
            </h3>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              체험 링크는 기기당 하루 5회로 제한되어 있습니다. 관리자가 계속 테스트할 수 있도록 제한 횟수를 즉시 0회로 초기화합니다.
            </p>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                onClick={handleResetMyDevice}
                disabled={resetting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50"
              >
                {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                내 기기 5회 즉시 리셋
              </button>
              <button
                onClick={handleResetAllDevices}
                disabled={resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition disabled:opacity-50"
              >
                전체 기기 일괄 리셋
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 1. 상단 설문 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">총 설문 응답</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalCount}건</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">Q1. 사용 편의성</p>
          <p className="text-2xl font-black text-indigo-600 mt-1 flex items-center gap-1">
            <Star size={18} className="fill-indigo-600 text-indigo-600" /> {stats.avgSatisfaction}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">Q2. 피드백 유용성</p>
          <p className="text-2xl font-black text-blue-600 mt-1 flex items-center gap-1">
            <Star size={18} className="fill-blue-600 text-blue-600" /> {stats.avgClarity}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500">Q3. AI 음성 만족</p>
          <p className="text-2xl font-black text-emerald-600 mt-1 flex items-center gap-1">
            <Star size={18} className="fill-emerald-600 text-emerald-600" /> {stats.avgTts}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-xs font-bold text-slate-500">Q4. 재이용 의향</p>
          <p className="text-2xl font-black text-amber-600 mt-1 flex items-center gap-1">
            <Star size={18} className="fill-amber-600 text-amber-600" /> {stats.avgRevisit}
          </p>
        </div>
      </div>

      {/* 2. 응답 리스트 및 필터 바 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <MessageSquare size={18} className="text-indigo-600" /> 체험 학생 설문 응답 목록 ({filteredSurveys.length}건)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              외국인 학생들이 6개 국어 설문으로 제출한 평가 점수와 주관식 피드백입니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 언어 필터 */}
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none"
            >
              <option value="all">전체 언어</option>
              <option value="ko">🇰🇷 한국어</option>
              <option value="en">🇺🇸 영어</option>
              <option value="zh">🇨🇳 중국어</option>
              <option value="ja">🇯🇵 日本語</option>
              <option value="vi">🇻🇳 Tiếng Việt</option>
              <option value="my">🇲🇲 မြန်မာ</option>
            </select>

            <button
              onClick={handleExportCSV}
              disabled={filteredSurveys.length === 0}
              className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              <Download size={13} /> 설문 CSV 추출
            </button>

            <button
              onClick={loadSurveys}
              disabled={loading}
              className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition"
              title="새로고침"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            설문 응답을 불러오는 중...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold">
            ❌ {error}
          </div>
        ) : filteredSurveys.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-1">
            <p className="font-bold text-slate-700 text-sm">아직 접수된 설문 응답이 없습니다.</p>
            <p>체험 링크(/demo)에서 사용자가 발음 연습 후 설문을 제출하면 이곳에 실시간 표시됩니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto pr-1">
            {filteredSurveys.map((sur) => (
              <div key={sur.id} className="py-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                      {LANG_LABEL_MAP[sur.language] || sur.language}
                    </span>
                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      체험 급수: {sur.targetLevel || "미지정"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Calendar size={11} /> {formatDateTime(sur.createdAtMs)}
                  </span>
                </div>

                {/* 4대 평가 점수 뱃지 */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Q1 사용성</span>
                    <span className="font-black text-indigo-600">{sur.satisfaction}점</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Q2 피드백</span>
                    <span className="font-black text-blue-600">{sur.feedbackClarity}점</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Q3 AI음성</span>
                    <span className="font-black text-emerald-600">{sur.ttsQuality}점</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Q4 재이용</span>
                    <span className="font-black text-amber-600">{sur.revisitIntent}점</span>
                  </div>
                </div>

                {/* 주관식 의견 */}
                {sur.comment && (
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-slate-800">
                    <strong className="text-indigo-900">💬 학생 의견:</strong> {sur.comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 대형 데모 QR 모달 */}
      {showDemoQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <h3 className="font-black text-slate-900 text-base">무설치 무료 체험(/demo) QR 코드</h3>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={demoQrImgUrl} alt="데모 QR" className="w-52 h-52 mx-auto rounded-xl bg-white" />
            </div>
            <p className="text-xs font-mono text-slate-600 break-all">{demoUrl}</p>
            <button
              onClick={() => setShowDemoQrModal(false)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
