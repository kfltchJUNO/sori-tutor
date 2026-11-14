"use client";
// app/admin/DemoSurveySection.tsx
// 최고 관리자 전용: 테스트 문장 및 음성 관리, 체험 링크(/demo), 기기 횟수 리셋, 6개 국어 설문조사(국적·급수·학습기간·약점) 대시보드

import { useState, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  MessageSquare, RefreshCw, Loader2, Download, Star,
  Languages, Filter, AlertCircle, Calendar, FlaskConical,
  QrCode, ExternalLink, RotateCcw, Copy, Check, Printer,
  Volume2, Plus, Trash2, Edit2, Play, Square, Sparkles,
  Globe, BookOpen, Clock, Layers, CheckCircle2, X
} from "lucide-react";
import type { DemoSurveyData, DemoSentenceDoc } from "@/lib/demoData";

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
  // 상단 서브탭 ("sentences": 문장&음성 관리, "surveys": 체험링크&설문응답)
  const [activeSubTab, setActiveSubTab] = useState<"sentences" | "surveys">("sentences");

  // ── 1. 설문 및 체험 통계 상태 ──
  const [surveys, setSurveys] = useState<DemoSurveyData[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    avgSatisfaction: "0.0",
    avgClarity: "0.0",
    avgTts: "0.0",
    avgRevisit: "0.0",
  });
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("all");

  // 리셋 상태
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDemoQrModal, setShowDemoQrModal] = useState(false);

  // ── 2. 데모 문장 & 음성 관리 상태 ──
  const [sentences, setSentences] = useState<DemoSentenceDoc[]>([]);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [sentenceError, setSentenceError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>("all");

  // 문장 추가/수정 모달 상태
  const [showSentenceModal, setShowSentenceModal] = useState(false);
  const [editingSentence, setEditingSentence] = useState<DemoSentenceDoc | null>(null);
  const [modalLevel, setModalLevel] = useState("1급");
  const [modalText, setModalText] = useState("");
  const [modalPron, setModalPron] = useState("");
  const [modalRule, setModalRule] = useState("");
  const [modalOrder, setModalOrder] = useState<number>(1);
  const [modalAudioPath, setModalAudioPath] = useState("");
  const [savingSentence, setSavingSentence] = useState(false);

  // ElevenLabs 음성 생성 중 상태
  const [generatingAudioId, setGeneratingAudioId] = useState<string | null>(null);
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const demoUrl = `${origin}/demo`;
  const demoQrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
    demoUrl
  )}`;

  // 설문 목록 불러오기
  const loadSurveys = async () => {
    setLoadingSurveys(true);
    setSurveyError(null);
    try {
      const res = await adminFetch("/api/demo/survey", { method: "GET" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "설문 조회 실패");
      setSurveys(data.surveys || []);
      setStats(data.stats || {});
    } catch (e: any) {
      setSurveyError(e.message);
    } finally {
      setLoadingSurveys(false);
    }
  };

  // 데모 문장 목록 불러오기
  const loadSentences = async () => {
    setLoadingSentences(true);
    setSentenceError(null);
    try {
      const res = await adminFetch("/api/demo/sentences", { method: "GET" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "문장 조회 실패");
      setSentences(data.sentences || []);
    } catch (e: any) {
      setSentenceError(e.message);
    } finally {
      setLoadingSentences(false);
    }
  };

  useEffect(() => {
    loadSurveys();
    loadSentences();
  }, [idToken]);

  // 기본 6문장 일괄 등록(시드)
  const handleSeedDefaultSentences = async () => {
    if (!confirm("초기 기본 6개 문장(1급~3급)을 Firestore에 일괄 등록하시겠습니까?")) return;
    setLoadingSentences(true);
    try {
      const res = await adminFetch("/api/demo/sentences?action=seed", { method: "POST" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");
      alert(data.message || "기본 6문장이 등록되었습니다.");
      loadSentences();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setLoadingSentences(false);
    }
  };

  // 문장 모달 열기 (추가 또는 수정)
  const openSentenceModal = (sentence?: DemoSentenceDoc) => {
    if (sentence) {
      setEditingSentence(sentence);
      setModalLevel(sentence.level);
      setModalText(sentence.text);
      setModalPron(sentence.pronunciation);
      setModalRule(sentence.ruleExplanation);
      setModalOrder(sentence.order || 1);
      setModalAudioPath(sentence.audio_path || "");
    } else {
      setEditingSentence(null);
      setModalLevel("1급");
      setModalText("");
      setModalPron("");
      setModalRule("");
      setModalOrder((sentences.length || 0) + 1);
      setModalAudioPath("");
    }
    setShowSentenceModal(true);
  };

  // 문장 저장 (POST / PUT)
  const handleSaveSentence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalText.trim()) return alert("문장 내용을 입력하세요.");

    setSavingSentence(true);
    try {
      if (editingSentence && !editingSentence.id.startsWith("default-")) {
        // 수정
        const res = await adminFetch(
          "/api/demo/sentences",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingSentence.id,
              level: modalLevel,
              text: modalText.trim(),
              pronunciation: modalPron.trim(),
              ruleExplanation: modalRule.trim(),
              order: modalOrder,
              audio_path: modalAudioPath.trim(),
            }),
          },
          idToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "수정 실패");
      } else {
        // 신규 추가
        const res = await adminFetch(
          "/api/demo/sentences",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: modalLevel,
              text: modalText.trim(),
              pronunciation: modalPron.trim(),
              ruleExplanation: modalRule.trim(),
              order: modalOrder,
              audio_path: modalAudioPath.trim(),
            }),
          },
          idToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "추가 실패");
      }

      setShowSentenceModal(false);
      loadSentences();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSavingSentence(false);
    }
  };

  // 문장 삭제
  const handleDeleteSentence = async (sentence: DemoSentenceDoc) => {
    if (!confirm(`"${sentence.text}" 문장을 정말 삭제하시겠습니까?`)) return;
    try {
      const res = await adminFetch(
        `/api/demo/sentences?id=${encodeURIComponent(sentence.id)}`,
        { method: "DELETE" },
        idToken
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "삭제 실패");
      loadSentences();
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  // ElevenLabs 원어민 음성 자동 생성 & Storage 저장
  const handleGenerateElevenLabsAudio = async (sentence: DemoSentenceDoc) => {
    if (sentence.id.startsWith("default-")) {
      alert("먼저 [기본 6문장 일괄 등록] 버튼을 눌러 DB에 문장을 저장한 후 음성을 생성해 주세요.");
      return;
    }

    setGeneratingAudioId(sentence.id);
    try {
      const res = await adminFetch(
        "/api/admin/generate-audio",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            colName: "sori_demo_sentences",
            docId: sentence.id,
            text: sentence.text,
          }),
        },
        idToken
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "음성 생성 실패");
      alert("✨ ElevenLabs 원어민 음성이 생성되어 문장에 자동 연결되었습니다!");
      loadSentences();
    } catch (e: any) {
      alert("음성 생성 오류: " + e.message);
    } finally {
      setGeneratingAudioId(null);
    }
  };

  // 오디오 미리듣기
  const handlePlayAudio = (url: string) => {
    if (playingAudioUrl === url && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingAudioUrl(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    setPlayingAudioUrl(url);

    audio.onended = () => setPlayingAudioUrl(null);
    audio.onerror = () => {
      alert("오디오 재생 실패");
      setPlayingAudioUrl(null);
    };
    audio.play().catch(() => setPlayingAudioUrl(null));
  };

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
    : surveys.filter((s) => s.language === selectedLang);

  // 설문조사 CSV 추출 (국적, 급수, 학습기간, 약점 컬럼 포함 + UTF-8 BOM)
  const handleExportCSV = () => {
    if (filteredSurveys.length === 0) return;

    const headers = [
      "제출일시", "언어", "학습자국적", "목표/현재급수", "학습기간", "자신이생각하는약점",
      "Q1_사용편의성(1~5)", "Q2_피드백도움(1~5)", "Q3_AI음성만족(1~5)", "Q4_재이용의향(1~5)",
      "주관식학생의견", "기기식별ID"
    ];

    const rows = filteredSurveys.map((s) => [
      `"${formatDateTime(s.createdAtMs)}"`,
      `"${LANG_LABEL_MAP[s.language] || s.language}"`,
      `"${s.nationality || "미지정"}"`,
      `"${s.targetLevel || "미지정"}"`,
      `"${s.studyPeriod || "미지정"}"`,
      `"${(s.weaknesses || []).join(", ") || "없음"}"`,
      s.satisfaction,
      s.feedbackClarity,
      s.ttsQuality,
      s.revisitIntent,
      `"${(s.comment || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      `"${s.deviceId}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `소리튜터_체험설문응답_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSentencesList = filterLevel === "all"
    ? sentences
    : sentences.filter((s) => s.level === filterLevel);

  return (
    <div className="space-y-6">
      {/* ── 최상단 서브탭 바 ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab("sentences")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition ${
            activeSubTab === "sentences"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <BookOpen size={14} />
          <span>📝 테스트 문장 & 음성 관리 ({sentences.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("surveys")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition ${
            activeSubTab === "surveys"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <MessageSquare size={14} />
          <span>📊 체험 링크, 리셋 & 설문 응답 ({surveys.length})</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          [서브탭 1] 테스트 문장 & 음성 관리 패널
          ══════════════════════════════════════════════════════════ */}
      {activeSubTab === "sentences" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <FlaskConical className="text-indigo-600" size={18} />
                무설치 체험(/demo) 문장 및 ElevenLabs 음성 관리
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                체험용 한국어 문장, 발음 표기, 음운 규칙 설명 및 원어민 ElevenLabs 음성을 관리합니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {sentences.length === 0 && (
                <button
                  onClick={handleSeedDefaultSentences}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl shadow transition"
                >
                  <Sparkles size={14} /> 기본 6문장 일괄 등록
                </button>
              )}
              <button
                onClick={() => openSentenceModal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow transition"
              >
                <Plus size={14} /> 새 테스트 문장 추가
              </button>
              <button
                onClick={loadSentences}
                disabled={loadingSentences}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                title="새로고침"
              >
                <RefreshCw size={14} className={loadingSentences ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* 급수 필터 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {["all", "1급", "2급", "3급", "4급", "5급", "6급"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterLevel === lvl
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {lvl === "all" ? "전체 급수" : lvl}
              </button>
            ))}
          </div>

          {/* 문장 목록 리스트 */}
          {loadingSentences ? (
            <div className="py-12 text-center text-slate-500 text-xs bg-white rounded-2xl border border-slate-200">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              테스트 문장을 불러오는 중...
            </div>
          ) : filteredSentencesList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs bg-white rounded-2xl border border-slate-200 space-y-3">
              <p className="font-bold text-slate-700 text-sm">등록된 테스트 문장이 없습니다.</p>
              <p>기본 6문장을 자동으로 채우거나 새 문장을 직접 추가하세요.</p>
              <button
                onClick={handleSeedDefaultSentences}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                기본 6문장 자동 생성
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredSentencesList.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 hover:border-indigo-300 transition"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-100 text-indigo-800">
                        {item.level}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono font-bold">
                        순서 #{item.order || idx + 1}
                      </span>
                      {item.audio_path ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <Volume2 size={11} /> ElevenLabs 음성 보유
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
                          Web Speech 브라우저 기본 음성
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h4 className="font-black text-base text-slate-900">{item.text}</h4>
                      <span className="text-xs font-bold text-indigo-600 font-mono">
                        {item.pronunciation}
                      </span>
                    </div>

                    {item.ruleExplanation && (
                      <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                        💡 {item.ruleExplanation}
                      </p>
                    )}
                  </div>

                  {/* 작업 버튼들 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 오디오 미리듣기 */}
                    {item.audio_path && (
                      <button
                        onClick={() => handlePlayAudio(item.audio_path!)}
                        className={`p-2 rounded-xl border transition ${
                          playingAudioUrl === item.audio_path
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                        title="원어민 음성 미리듣기"
                      >
                        {playingAudioUrl === item.audio_path ? <Square size={14} className="fill-white" /> : <Play size={14} />}
                      </button>
                    )}

                    {/* ElevenLabs 음성 생성 버튼 */}
                    <button
                      onClick={() => handleGenerateElevenLabsAudio(item)}
                      disabled={generatingAudioId === item.id}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                      title="ElevenLabs 원어민 고음질 오디오 생성"
                    >
                      {generatingAudioId === item.id ? (
                        <Loader2 size={13} className="animate-spin text-amber-700" />
                      ) : (
                        <Sparkles size={13} className="text-amber-600" />
                      )}
                      <span>{item.audio_path ? "음성 재생성" : "음성 생성"}</span>
                    </button>

                    <button
                      onClick={() => openSentenceModal(item)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                      title="수정"
                    >
                      <Edit2 size={14} />
                    </button>

                    <button
                      onClick={() => handleDeleteSentence(item)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl border border-rose-200 transition"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          [서브탭 2] 체험 링크, 횟수 리셋 & 다국어 설문 응답 관제
          ══════════════════════════════════════════════════════════ */}
      {activeSubTab === "surveys" && (
        <div className="space-y-6">
          {/* 체험 링크 & QR 배포 카드 */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black text-xs rounded-full">
                    PUBLIC TRIAL
                  </span>
                  <h3 className="font-black text-lg">소리튜터 무설치 무료 체험 링크 & QR 배포</h3>
                </div>
                <p className="text-xs text-slate-300">
                  학생들이 로그인 없이 브라우저에서 바로 발음 연습을 체험하고 설문을 제출할 수 있는 전용 링크입니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDemoQrModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition"
                >
                  <QrCode size={14} /> QR 코드 보기
                </button>
                <a
                  href="/demo"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition shadow"
                >
                  <ExternalLink size={14} /> 새 탭에서 열기
                </a>
              </div>
            </div>

            {/* 링크 복사 바 */}
            <div className="flex items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/15 text-xs font-mono">
              <span className="truncate flex-1 text-slate-200 px-2">{demoUrl}</span>
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl transition flex items-center gap-1 shrink-0"
              >
                {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedLink ? "복사됨!" : "링크 복사"}</span>
              </button>
            </div>
          </div>

          {/* 🔄 관리자 테스트 횟수 리셋 도구 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <RotateCcw size={15} className="text-amber-500" />
                  관리자 전용 체험 횟수(하루 5회) 즉시 리셋 도구
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  기기 식별을 통해 하루 5회로 제한된 카운터를 즉시 0회로 초기화하여 관리자가 마음껏 반복 테스트할 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetMyDevice}
                  disabled={resetting}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw size={13} /> 내 기기 5회 즉시 리셋
                </button>
                <button
                  onClick={handleResetAllDevices}
                  disabled={resetting}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  전체 기기 일괄 리셋
                </button>
              </div>
            </div>

            {resetMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold animate-in fade-in">
                {resetMessage}
              </div>
            )}
          </div>

          {/* 4대 평가 평균 점수 대시보드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block">Q1 사용 편의성</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-indigo-600">{stats.avgSatisfaction}</span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block">Q2 피드백 명확성</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-blue-600">{stats.avgClarity}</span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block">Q3 AI 음성 만족도</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-emerald-600">{stats.avgTts}</span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block">Q4 재이용 의향</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-amber-600">{stats.avgRevisit}</span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
            </div>
          </div>

          {/* 설문 응답 목록 리스트 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <MessageSquare className="text-indigo-600" size={18} />
                  접수된 설문 응답 목록 ({filteredSurveys.length}건)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  체험자들이 제출한 국적, 급수, 학습기간, 취약 분야 및 평가 점수를 실시간 확인합니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  className="text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none"
                >
                  <option value="all">전체 언어</option>
                  <option value="ko">🇰🇷 한국어</option>
                  <option value="en">🇺🇸 영어</option>
                  <option value="zh">🇨🇳 중국어</option>
                  <option value="ja">🇯🇵 일본어</option>
                  <option value="vi">🇻🇳 베트남어</option>
                  <option value="my">🇲🇲 미얀마어</option>
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
                  disabled={loadingSurveys}
                  className="p-1.5 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200 transition"
                  title="새로고침"
                >
                  <RefreshCw size={13} className={loadingSurveys ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {loadingSurveys ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                설문 응답을 불러오는 중...
              </div>
            ) : filteredSurveys.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs space-y-1">
                <p className="font-bold text-slate-700 text-sm">아직 접수된 설문 응답이 없습니다.</p>
                <p>체험 링크(/demo)에서 사용자가 발음 연습 후 설문을 제출하면 이곳에 실시간 표시됩니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto pr-1">
                {filteredSurveys.map((sur) => (
                  <div key={sur.id} className="py-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {LANG_LABEL_MAP[sur.language] || sur.language}
                        </span>

                        {sur.nationality && (
                          <span className="text-xs font-black bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Globe size={11} /> {sur.nationality}
                          </span>
                        )}

                        {sur.targetLevel && (
                          <span className="text-xs font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md">
                            급수: {sur.targetLevel}
                          </span>
                        )}

                        {sur.studyPeriod && (
                          <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Clock size={11} /> {sur.studyPeriod}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Calendar size={11} /> {formatDateTime(sur.createdAtMs)}
                      </span>
                    </div>

                    {/* 취약 분야 태그 */}
                    {Array.isArray(sur.weaknesses) && sur.weaknesses.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap text-xs">
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                          ⚠️ 약점:
                        </span>
                        {sur.weaknesses.map((w, wIdx) => (
                          <span
                            key={wIdx}
                            className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md text-[11px]"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    )}

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
        </div>
      )}

      {/* ── 문장 추가/수정 모달 ── */}
      {showSentenceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">
                {editingSentence ? "테스트 문장 수정" : "새 테스트 문장 추가"}
              </h3>
              <button
                onClick={() => setShowSentenceModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveSentence} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">급수 (Level)</label>
                  <select
                    value={modalLevel}
                    onChange={(e) => setModalLevel(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="1급">1급 (기초)</option>
                    <option value="2급">2급 (중초급)</option>
                    <option value="3급">3급 (중급)</option>
                    <option value="4급">4급 (중상급)</option>
                    <option value="5급">5급 (고급)</option>
                    <option value="6급">6급 (최고급)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">정렬 순서 (Order)</label>
                  <input
                    type="number"
                    value={modalOrder}
                    onChange={(e) => setModalOrder(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">한국어 문장 (Text) *</label>
                <input
                  type="text"
                  value={modalText}
                  onChange={(e) => setModalText(e.target.value)}
                  placeholder="예: 학교에 가요."
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">표준 발음 표기 (Pronunciation)</label>
                <input
                  type="text"
                  value={modalPron}
                  onChange={(e) => setModalPron(e.target.value)}
                  placeholder="예: [학꾜에 가요]"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">음운 규칙 및 발음 설명</label>
                <textarea
                  rows={2}
                  value={modalRule}
                  onChange={(e) => setModalRule(e.target.value)}
                  placeholder="예: 학[ㄱ] + 교[ㄱ] = [꾜] (된소리되기/경음화)"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">오디오 URL (선택)</label>
                <input
                  type="text"
                  value={modalAudioPath}
                  onChange={(e) => setModalAudioPath(e.target.value)}
                  placeholder="저장 후 목록에서 '음성 생성' 버튼을 누르면 자동 등록됩니다."
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSentenceModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingSentence}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow transition disabled:opacity-50"
                >
                  {savingSentence ? "저장 중..." : "문장 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 대형 데모 QR 모달 */}
      {showDemoQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <h3 className="font-black text-slate-900 text-base">무설치 무료 체험(/demo) QR 코드</h3>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={demoQrImgUrl} alt="데모 QR" className="w-52 h-52 mx-auto rounded-xl bg-white" />
            </div>
            <p className="text-xs font-mono text-slate-500 break-all">{demoUrl}</p>
            <button
              onClick={() => setShowDemoQrModal(false)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
