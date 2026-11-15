"use client";
// app/admin/DemoSurveySection.tsx
// 최고 관리자 전용: 테스트·체험 통합 관리 허브
// 1. [🏫 테스트 반 & 체험 링크]: 공개 체험실(/demo) 및 테스트 반(Test Classes), QR코드, 학생 명단 원스톱 관리
// 2. [📝 테스트 문장 & 음성 관리]: 1~6급 테스트 문장 CRUD 및 ElevenLabs 원어민 음성 자동 생성/재생
// 3. [📊 설문 통계 & 응답]: 10회 체험 누적 평가 기록, AI 채점 오류 보고 분석, 6개 국어 설문 통계 및 CSV 추출

import { useState, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  MessageSquare, RefreshCw, Loader2, Download, Star,
  Languages, Filter, AlertCircle, Calendar, FlaskConical,
  QrCode, ExternalLink, RotateCcw, Copy, Check, Printer,
  Volume2, Plus, Trash2, Edit2, Play, Square, Sparkles,
  Globe, BookOpen, Clock, Layers, CheckCircle2, X,
  School, Users, User, Activity, AlertTriangle
} from "lucide-react";
import type { DemoSurveyData, DemoSentenceDoc, DemoEvaluationLog } from "@/lib/demoData";
import type { ClassData } from "@/app/api/admin/classes/route";
import type { TeacherData } from "@/app/api/admin/teachers/route";
import type { ClassStudentInfo } from "@/app/api/admin/classes/students/route";

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

const TEST_COLLECTION_OPTIONS = [
  { label: "🧪 테스트 전용 문장 (1~6급)", collection: "sori_demo_sentences", level: "테스트" },
  { label: "일반 문장 커리큘럼", collection: "sori_curriculum_sentence", level: "일반 문장" },
  { label: "동국대 1급 (기초)", collection: "sori_curriculum_dongguk", level: "동국대 1급" },
  { label: "동국대 3급 (중급)", collection: "sori_curriculum_dongguk3", level: "동국대 3급" },
  { label: "단국대 전용 코스", collection: "sori_curriculum_dankook", level: "단국대" },
];

export default function DemoSurveySection({ idToken }: Props) {
  // 상단 서브탭 ("classes": 테스트반&체험링크, "sentences": 문장&음성 관리, "surveys": 설문응답&통계)
  const [activeSubTab, setActiveSubTab] = useState<"classes" | "sentences" | "surveys">("classes");

  // ── 1. 테스트 반 및 선생님 관리 상태 ──
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  // 테스트 반 모달 상태
  const [showCreateTestClassModal, setShowCreateTestClassModal] = useState(false);
  const [selectedTestClassForStudents, setSelectedTestClassForStudents] = useState<ClassData | null>(null);
  const [selectedTestClassForQR, setSelectedTestClassForQR] = useState<ClassData | null>(null);
  const [testClassStudents, setTestClassStudents] = useState<ClassStudentInfo[]>([]);
  const [loadingTestStudents, setLoadingTestStudents] = useState(false);

  // 새 테스트 반 폼 상태
  const [newTestClassName, setNewTestClassName] = useState("");
  const [newTestClassInstitution, setNewTestClassInstitution] = useState("소리튜터 테스트");
  const [newTestClassLevelOption, setNewTestClassLevelOption] = useState(0);
  const [newTestClassTeacherEmail, setNewTestClassTeacherEmail] = useState("");
  const [newTestClassMemo, setNewTestClassMemo] = useState("");
  const [creatingTestClass, setCreatingTestClass] = useState(false);

  // 학생 수동 추가 폼 상태
  const [addTestStudentEmail, setAddTestStudentEmail] = useState("");
  const [addTestStudentName, setAddTestStudentName] = useState("");
  const [addTestStudentId, setAddTestStudentId] = useState("");
  const [addingTestStudent, setAddingTestStudent] = useState(false);

  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);

  // ── 2. 설문 및 누적 평가 기록 통계 상태 ──
  const [surveys, setSurveys] = useState<DemoSurveyData[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    avgSatisfaction: "0.0",
    avgClarity: "0.0",
    avgTts: "0.0",
    avgRevisit: "0.0",
    errorReportCount: 0,
    errorTypeCounts: {},
  });
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("all");

  // 테스트 참여자 평가 로그 (누적 결과)
  const [evalLogs, setEvalLogs] = useState<DemoEvaluationLog[]>([]);
  const [evalStats, setEvalStats] = useState({
    totalCount: 0,
    uniqueDeviceCount: 0,
    avgScore: "0.0",
  });
  const [loadingEvalLogs, setLoadingEvalLogs] = useState(false);

  // 리셋 상태
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDemoQrModal, setShowDemoQrModal] = useState(false);

  // ── 3. 데모 문장 & 음성 관리 상태 ──
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
  const demoQrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
    demoUrl
  )}`;

  // 반 목록 & 선생님 목록 조회
  const loadClasses = async () => {
    setLoadingClasses(true);
    setClassError(null);
    try {
      const [classRes, teacherRes] = await Promise.all([
        adminFetch("/api/admin/classes", { method: "GET" }, idToken),
        adminFetch("/api/admin/teachers", { method: "GET" }, idToken),
      ]);
      const classData = await classRes.json();
      const teacherData = await teacherRes.json();
      if (classRes.ok) setClasses(classData.classes || []);
      if (teacherRes.ok) setTeachers(teacherData.teachers || []);
    } catch (e: any) {
      setClassError(e.message);
    } finally {
      setLoadingClasses(false);
    }
  };

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

  // 참여자 발음 평가 누적 로그 불러오기
  const loadEvalLogs = async () => {
    setLoadingEvalLogs(true);
    try {
      const res = await adminFetch("/api/demo/logs", { method: "GET" }, idToken);
      const data = await res.json();
      if (res.ok) {
        setEvalLogs(data.logs || []);
        setEvalStats({
          totalCount: data.totalCount || 0,
          uniqueDeviceCount: data.uniqueDeviceCount || 0,
          avgScore: data.avgScore || "0.0",
        });
      }
    } catch (e) {
      console.warn("평가 로그 조회 실패:", e);
    } finally {
      setLoadingEvalLogs(false);
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
    loadClasses();
    loadSurveys();
    loadEvalLogs();
    loadSentences();
  }, [idToken]);

  // ── 테스트 반 생성 핸들러 ──
  const handleCreateTestClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestClassName.trim()) return alert("테스트 반 이름을 입력하세요.");
    setCreatingTestClass(true);
    try {
      const selectedOpt = TEST_COLLECTION_OPTIONS[newTestClassLevelOption];
      const selectedTeacher = teachers.find(t => t.email === newTestClassTeacherEmail);

      const res = await adminFetch(
        "/api/admin/classes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newTestClassName.trim(),
            institution: newTestClassInstitution.trim(),
            level: selectedOpt.level,
            curriculumCollection: selectedOpt.collection,
            teacherEmail: newTestClassTeacherEmail,
            teacherName: selectedTeacher?.name || "선생님 미지정",
            memo: newTestClassMemo.trim(),
            isTest: true,
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "테스트 반 생성 실패");

      setShowCreateTestClassModal(false);
      setNewTestClassName("");
      setNewTestClassMemo("");
      loadClasses();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setCreatingTestClass(false);
    }
  };

  // ── 테스트 반 삭제 핸들러 ──
  const handleDeleteTestClass = async (classId: string, name: string) => {
    if (!confirm(`'${name}' 테스트 반을 정말 삭제하시겠습니까? (소속 학생들의 배정이 해제됩니다)`)) return;
    try {
      const res = await adminFetch(`/api/admin/classes?classId=${classId}`, { method: "DELETE" }, idToken);
      if (!res.ok) throw new Error("테스트 반 삭제 실패");
      loadClasses();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── 테스트 반 소속 학생 목록 조회 ──
  const openTestClassStudentsModal = async (c: ClassData) => {
    setSelectedTestClassForStudents(c);
    setLoadingTestStudents(true);
    try {
      const res = await adminFetch(`/api/admin/classes/students?classId=${c.id}`, { method: "GET" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "학생 목록 조회 실패");
      setTestClassStudents(data.students || []);
    } catch (e: any) {
      alert("학생 목록 조회 실패: " + e.message);
    } finally {
      setLoadingTestStudents(false);
    }
  };

  // ── 테스트 반에 학생 수동 배정 ──
  const handleAddTestStudentToClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTestClassForStudents || !addTestStudentEmail.trim()) return;

    setAddingTestStudent(true);
    try {
      const res = await adminFetch(
        "/api/admin/classes/students",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: selectedTestClassForStudents.id,
            email: addTestStudentEmail.trim(),
            name: addTestStudentName.trim(),
            studentId: addTestStudentId.trim(),
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "학생 배정 실패");

      setAddTestStudentEmail("");
      setAddTestStudentName("");
      setAddTestStudentId("");
      openTestClassStudentsModal(selectedTestClassForStudents);
      loadClasses();
    } catch (e: any) {
      alert("학생 배정 오류: " + e.message);
    } finally {
      setAddingTestStudent(false);
    }
  };

  // ── 테스트 반에서 학생 배정 해제 ──
  const handleRemoveTestStudentFromClass = async (email: string) => {
    if (!confirm(`'${email}' 학생을 이 테스트 반에서 제외하시겠습니까?`)) return;
    try {
      const res = await adminFetch(
        `/api/admin/classes/students?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
        idToken
      );
      if (!res.ok) throw new Error("배정 해제 실패");
      if (selectedTestClassForStudents) openTestClassStudentsModal(selectedTestClassForStudents);
      loadClasses();
    } catch (e: any) {
      alert(e.message);
    }
  };

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

  // 내 기기 10회 횟수 즉시 리셋 (관리자 테스트 재개용)
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
      setResetMessage("✅ 관리자 기기의 체험 횟수가 0회로 초기화되었습니다. 즉시 다시 10회 테스트하실 수 있습니다!");
      setTimeout(() => setResetMessage(null), 5000);
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setResetting(false);
    }
  };

  // 전체 체험 기기 횟수 일괄 리셋
  const handleResetAllDevices = async () => {
    if (!confirm("모든 기기의 10회 체험 제한 기록을 초기화하시겠습니까? (모든 사용자가 다시 10회 이용 가능해집니다)")) return;
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

  const handleCopyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedInviteCode(code);
    setTimeout(() => setCopiedInviteCode(null), 2000);
  };

  const handleCopyInviteUrl = (code: string) => {
    const url = `${origin}/join?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedInviteCode(`url-${code}`);
    setTimeout(() => setCopiedInviteCode(null), 2000);
  };

  const testClasses = classes.filter(c => c.isTest);

  const filteredSurveys = selectedLang === "all"
    ? surveys
    : surveys.filter((s) => s.language === selectedLang);

  const koreanSurveyCount =
    typeof stats.koreanTesterCount === "number"
      ? stats.koreanTesterCount
      : surveys.filter(
          (s) =>
            s.isKorean ||
            s.nationality?.includes("한국") ||
            s.nationality?.includes("KR") ||
            s.nationality?.includes("Korea")
        ).length;
  const foreignerSurveyCount = Math.max(0, surveys.length - koreanSurveyCount);

  // 설문조사 CSV 추출 (국적, 급수, 학습기간, 약점, 오류 보고 컬럼 포함 + UTF-8 BOM)
  const handleExportCSV = () => {
    if (filteredSurveys.length === 0) return;

    const headers = [
      "제출일시", "구분(한국인테스터/외국인)", "언어", "학습자국적", "목표/현재급수", "학습기간", "자신이생각하는약점",
      "이상결과/오류경험여부", "오류유형목록", "오류상세설명",
      "Q1_사용편의성(1~5)", "Q2_피드백도움(1~5)", "Q3_AI음성만족(1~5)", "Q4_재이용의향(1~5)",
      "주관식학생의견", "기기식별ID"
    ];

    const rows = filteredSurveys.map((s) => [
      `"${formatDateTime(s.createdAtMs)}"`,
      s.isKorean || s.nationality?.includes("한국") || s.nationality?.includes("KR") || s.nationality?.includes("Korea") ? '"한국인 테스터"' : '"외국인 학습자"',
      `"${LANG_LABEL_MAP[s.language] || s.language}"`,
      `"${s.nationality || "미지정"}"`,
      `"${s.targetLevel || "미지정"}"`,
      `"${s.studyPeriod || "미지정"}"`,
      `"${(s.weaknesses || []).join(", ") || "없음"}"`,
      s.experiencedError ? '"예 (오류 발생)"' : '"아니오 (정상)"',
      `"${(s.errorTypes || []).join(" | ") || "없음"}"`,
      `"${(s.errorDetail || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
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

  // 실시간 발음 평가 로그 CSV 추출
  const handleExportEvalLogsCSV = () => {
    if (evalLogs.length === 0) return;

    const headers = [
      "평가일시", "날짜", "기기식별ID", "급수", "연습문장", "학생실제발화(STT)", "발음종합점수", "음소정확도", "무음감지여부", "피드백내용"
    ];

    const rows = evalLogs.map((log) => [
      `"${formatDateTime(log.createdAtMs)}"`,
      `"${log.date}"`,
      `"${log.deviceId}"`,
      `"${log.level}"`,
      `"${(log.targetText || "").replace(/"/g, '""')}"`,
      `"${(log.recognizedText || "").replace(/"/g, '""')}"`,
      log.score,
      log.phonemeScore,
      log.isSilence ? '"무음 (침묵)"' : '"발화 감지"',
      `"${(log.feedback || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `소리튜터_체험발음평가로그_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSentencesList = filterLevel === "all"
    ? sentences
    : sentences.filter((s) => s.level === filterLevel);

  return (
    <div className="space-y-6">
      {/* ── 최상단 서브탭 바 ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 flex-wrap">
        <button
          onClick={() => setActiveSubTab("classes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition ${
            activeSubTab === "classes"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <School size={14} />
          <span>🏫 테스트 반 & 체험 링크 ({testClasses.length + 1})</span>
        </button>

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
          <Activity size={14} />
          <span>📊 테스트 결과 & 설문 분석 ({evalStats.totalCount}회 / {surveys.length}건)</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          [서브탭 1] 테스트 반 & 무설치 공개 체험실 통합 관제
          ══════════════════════════════════════════════════════════ */}
      {activeSubTab === "classes" && (
        <div className="space-y-6">
          {/* 🌟 1. 무설치 원클릭 공개 체험실 (/demo) 대표 카드 */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md space-y-4 border border-indigo-800/40">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black text-xs rounded-full">
                    PUBLIC DEMO
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    실시간 운영 중 (1인당 10회 제한)
                  </span>
                  <h3 className="font-black text-lg">소리튜터 무설치 공개 발음 체험실</h3>
                </div>
                <p className="text-xs text-slate-300">
                  학생들이 로그인이나 반 가입 없이 브라우저에서 바로 발음 검사를 체험(1인당 10회)하고 설문을 제출할 수 있는 공식 공개 링크입니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDemoQrModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10"
                >
                  <QrCode size={14} /> 체험 QR 코드
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
              <span className="truncate flex-1 text-slate-200 px-2 font-bold">{demoUrl}</span>
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl transition flex items-center gap-1 shrink-0"
              >
                {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedLink ? "복사됨!" : "링크 복사"}</span>
              </button>
            </div>

            {/* 🔄 기기 횟수 리셋 도구 및 누적 지표 */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-4 text-slate-300 flex-wrap">
                <span>총 테스트 실시: <strong className="text-amber-300 font-bold">{evalStats.totalCount}회</strong></span>
                <span>참여 기기: <strong className="text-amber-300 font-bold">{evalStats.uniqueDeviceCount}대</strong></span>
                <span>설문 제출: <strong className="text-amber-300 font-bold">{surveys.length}건</strong></span>
                <span>평균 만족도: <strong className="text-amber-300 font-bold">{stats.avgSatisfaction || "5.0"}★</strong></span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetMyDevice}
                  disabled={resetting}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-300/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  title="관리자 브라우저의 10회 횟수를 리셋하여 계속 체험 테스트 가능"
                >
                  <RotateCcw size={12} className={resetting ? "animate-spin" : ""} />
                  <span>내 기기 10회 초기화</span>
                </button>

                <button
                  onClick={handleResetAllDevices}
                  disabled={resetting}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  title="모든 사용자 기기의 10회 제한을 일괄 초기화"
                >
                  <RotateCcw size={12} />
                  <span>전체 기기 일괄 리셋</span>
                </button>
              </div>
            </div>

            {resetMessage && (
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs text-emerald-200 font-bold">
                {resetMessage}
              </div>
            )}
          </div>

          {/* 🏫 2. 개설된 테스트 반 목록 (Test Classes) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <FlaskConical className="text-amber-600" size={18} />
                  개설된 테스트 전용 반 목록 ({testClasses.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  정규 수업과 분리되어 특정 학생 집단이나 테스트 세션에 맞춤 배정할 수 있는 테스트 반입니다.
                </p>
              </div>

              <button
                onClick={() => setShowCreateTestClassModal(true)}
                className="flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-4 py-2 rounded-xl transition shadow-xs"
              >
                <Plus size={14} /> 새 테스트 반 개설하기
              </button>
            </div>

            {loadingClasses ? (
              <div className="py-12 text-center text-slate-700 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                테스트 반 목록을 불러오는 중...
              </div>
            ) : testClasses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-amber-300 p-8 text-center text-slate-700 text-xs space-y-2 bg-amber-50/20">
                <FlaskConical size={36} className="mx-auto text-amber-500" />
                <p className="font-bold text-slate-800 text-sm">아직 개설된 테스트 반이 없습니다.</p>
                <p className="text-slate-500">
                  우측 상단의 &apos;새 테스트 반 개설하기&apos;를 눌러 학생들에게 배정할 테스트 반을 만들어 보세요.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {testClasses.map((cls) => {
                  return (
                    <div
                      key={cls.id}
                      className="bg-white rounded-2xl border-2 border-amber-300 bg-amber-50/10 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              <FlaskConical size={10} /> 테스트용
                            </span>
                            <span className="text-[11px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md">
                              {cls.level}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">{cls.institution || "소리튜터"}</span>
                        </div>

                        <h4 className="font-black text-slate-900 text-base">{cls.name}</h4>

                        <p className="text-xs text-slate-600 flex items-center gap-1">
                          <User size={13} className="text-indigo-600" /> 담당: <strong>{cls.teacherName || "선생님 미지정"}</strong>
                        </p>

                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          연결 커리큘럼: <strong className="text-slate-800 font-mono">{cls.curriculumCollection}</strong>
                          {cls.memo && <p className="mt-1 text-slate-600">메모: {cls.memo}</p>}
                        </div>
                      </div>

                      {/* 초대 코드 및 학생 수 */}
                      <div className="pt-3 border-t border-amber-100 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">초대 코드</span>
                          <div className="flex items-center gap-1 font-mono font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                            <span>{cls.inviteCode}</span>
                            <button
                              onClick={() => handleCopyInviteCode(cls.inviteCode)}
                              className="text-slate-400 hover:text-indigo-600 p-0.5"
                              title="코드 복사"
                            >
                              {copiedInviteCode === cls.inviteCode ? (
                                <Check size={12} className="text-emerald-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 링크 복사 및 QR 코드 버튼 */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyInviteUrl(cls.inviteCode)}
                            className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition flex items-center justify-center gap-1"
                          >
                            {copiedInviteCode === `url-${cls.inviteCode}` ? (
                              <>
                                <Check size={12} className="text-emerald-600" /> 복사됨
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> 가입 링크 복사
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedTestClassForQR(cls)}
                            className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition flex items-center justify-center gap-1 shadow-xs"
                          >
                            <QrCode size={12} /> QR 코드
                          </button>
                        </div>

                        {/* 소속 학생 관리 & 삭제 */}
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => openTestClassStudentsModal(cls)}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 hover:underline"
                          >
                            <Users size={13} /> 소속 학생 ({cls.studentCount || 0}명) 관리 ➔
                          </button>

                          <button
                            onClick={() => handleDeleteTestClass(cls.id, cls.name)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                            title="테스트 반 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          [서브탭 2] 테스트 문장 & ElevenLabs 음성 관리 패널
          ══════════════════════════════════════════════════════════ */}
      {activeSubTab === "sentences" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <FlaskConical className="text-indigo-600" size={18} />
                테스트 문장 및 ElevenLabs 원어민 음성 관리
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                테스트 및 공개 체험에 사용되는 급수별(1~6급) 한국어 문장, 표준 발음 표기, 음운 규칙 해설 및 음성을 관리합니다.
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
            </div>
          </div>

          {/* 급수 필터 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {["all", "1급", "2급", "3급", "4급", "5급", "6급"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-3 py-1.5 rounded-xl font-black transition shrink-0 ${
                  filterLevel === lvl
                    ? "bg-slate-900 text-white shadow"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {lvl === "all" ? "전체 급수" : lvl}
              </button>
            ))}
          </div>

          {/* 문장 목록 */}
          {loadingSentences ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              문장 목록을 불러오는 중...
            </div>
          ) : filteredSentencesList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-xs space-y-3">
              <BookOpen size={32} className="mx-auto text-slate-400" />
              <p className="font-bold text-slate-700 text-sm">등록된 테스트 문장이 없습니다.</p>
              <p>우측 상단의 &apos;기본 6문장 일괄 등록&apos; 또는 &apos;새 테스트 문장 추가&apos;를 눌러 등록해 보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSentencesList.map((sen, idx) => (
                <div
                  key={sen.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md">
                          {sen.level}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          #{sen.order ?? idx + 1}
                        </span>
                      </div>

                      {/* 음성 상태 배지 */}
                      {sen.audio_path ? (
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={10} /> 음성 연결됨
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          음성 미생성 (TTS 대체)
                        </span>
                      )}
                    </div>

                    <h4 className="font-black text-slate-900 text-base">{sen.text}</h4>
                    <p className="text-xs font-bold text-indigo-600 font-mono">{sen.pronunciation}</p>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      💡 {sen.ruleExplanation}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {sen.audio_path ? (
                        <button
                          type="button"
                          onClick={() => handlePlayAudio(sen.audio_path!)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1"
                        >
                          {playingAudioUrl === sen.audio_path ? <Square size={12} /> : <Play size={12} />}
                          <span>{playingAudioUrl === sen.audio_path ? "정지" : "미리듣기"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={generatingAudioId === sen.id}
                          onClick={() => handleGenerateElevenLabsAudio(sen)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                        >
                          {generatingAudioId === sen.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span>{generatingAudioId === sen.id ? "생성 중..." : "음성 생성"}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openSentenceModal(sen)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                        title="문장 수정"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSentence(sen)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition"
                        title="문장 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          [서브탭 3] 테스트 참여자 누적 결과 & 설문 분석 패널
          ══════════════════════════════════════════════════════════ */}
      {activeSubTab === "surveys" && (
        <div className="space-y-6">
          {/* 핵심 KPI 카드 5종 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                <Activity size={13} className="text-indigo-600" /> 총 테스트 실시
              </span>
              <p className="text-2xl font-black text-indigo-700 mt-1">{evalStats.totalCount}회</p>
              <p className="text-[11px] text-slate-400 mt-0.5">누적 발음 평가 횟수</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                <Users size={13} className="text-blue-600" /> 참여 기기(학습자)
              </span>
              <p className="text-2xl font-black text-blue-700 mt-1">{evalStats.uniqueDeviceCount}대</p>
              <p className="text-[11px] text-slate-400 mt-0.5">고유 기기 식별 집계</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                <Star size={13} className="text-amber-500 fill-amber-500" /> 평균 발음 점수
              </span>
              <p className="text-2xl font-black text-amber-600 mt-1">{evalStats.avgScore}점</p>
              <p className="text-[11px] text-slate-400 mt-0.5">100점 만점 기준</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                <MessageSquare size={13} className="text-emerald-600" /> 설문 제출자
              </span>
              <p className="text-2xl font-black text-emerald-700 mt-1">{surveys.length}명</p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                🇰🇷 한국인 {koreanSurveyCount}명 · 🌍 외국인 {foreignerSurveyCount}명
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                <Star size={13} className="text-purple-600 fill-purple-600" /> 전반적 만족도
              </span>
              <p className="text-2xl font-black text-purple-700 mt-1">{stats.avgSatisfaction || "5.0"}★</p>
              <p className="text-[11px] text-slate-400 mt-0.5">5.0 만점 기준</p>
            </div>
          </div>

          {/* ⚠️ AI 채점 이상 결과 및 오류 보고 분석 카드 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    AI 발음 채점 이상 결과 및 오류 피드백 집계
                  </h4>
                  <p className="text-xs text-slate-500">
                    참여자가 보고한 무음 점수 오류, 엉뚱한 말 고득점 오류 등 이상 징후 분석
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-bold">
                  오류 보고 건수: <strong>{stats.errorReportCount || 0}건</strong> / {surveys.length}건
                </span>
              </div>
            </div>

            {/* 오류 유형별 분포 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">🔇 무음 점수 오류</span>
                <strong className="text-slate-900 font-black text-base mt-0.5 block">
                  {stats.errorTypeCounts?.["🔇 아무 말도 안 했는데 점수가 나옴 (무음 점수 오류)"] || 0}건
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">❓ 엉뚱한 말 고득점</span>
                <strong className="text-slate-900 font-black text-base mt-0.5 block">
                  {stats.errorTypeCounts?.["❓ 엉뚱한 말을 했는데 높은 점수가 나옴"] || 0}건
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">📉 정확한 발음 저득점</span>
                <strong className="text-slate-900 font-black text-base mt-0.5 block">
                  {stats.errorTypeCounts?.["📉 정확하게 말했는데 너무 낮은 점수가 나옴"] || 0}건
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">🛑 음성 인식 먹통</span>
                <strong className="text-slate-900 font-black text-base mt-0.5 block">
                  {stats.errorTypeCounts?.["🛑 음성 인식이 잘 안 됨 / 무반응 먹통"] || 0}건
                </strong>
              </div>
            </div>
          </div>

          {/* 🎧 1. 실시간 테스트 참여자 발음 평가 기록 테이블 (최신순) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Activity size={17} className="text-indigo-600" />
                  실시간 테스트 참여자 발음 평가 기록 ({evalLogs.length}건)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  체험자가 실제로 소리 내어 말한 내용(STT), AI 평가 점수, 무음 감지 여부가 실시간 기록됩니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadEvalLogs}
                  disabled={loadingEvalLogs}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                  title="평가 로그 새로고침"
                >
                  <RefreshCw size={14} className={loadingEvalLogs ? "animate-spin" : ""} />
                </button>

                <button
                  onClick={handleExportEvalLogsCSV}
                  disabled={evalLogs.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow transition disabled:opacity-50"
                >
                  <Download size={14} /> 평가 로그 CSV 다운로드
                </button>
              </div>
            </div>

            {loadingEvalLogs ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                평가 로그를 불러오는 중...
              </div>
            ) : evalLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                아직 기록된 발음 평가 결과가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">일시</th>
                      <th className="py-2.5 px-3">기기 ID</th>
                      <th className="py-2.5 px-3">급수</th>
                      <th className="py-2.5 px-3">연습 문장</th>
                      <th className="py-2.5 px-3">학생 발화(STT 인식)</th>
                      <th className="py-2.5 px-3 text-right">점수</th>
                      <th className="py-2.5 px-3 text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evalLogs.slice(0, 50).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {formatDateTime(log.createdAtMs)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {log.deviceId.slice(0, 10)}...
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-bold text-[10px]">
                            {log.level}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[160px] truncate">
                          {log.targetText}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono max-w-[180px] truncate">
                          {log.recognizedText ? `"${log.recognizedText}"` : <span className="text-slate-400 italic">(인식 없음)</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] ${
                              log.score >= 90
                                ? "bg-emerald-100 text-emerald-800"
                                : log.score >= 75
                                ? "bg-indigo-100 text-indigo-800"
                                : log.score >= 50
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {log.score}점
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {log.isSilence ? (
                            <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              🔇 무음
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                              발화 완료
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 📋 2. 설문 응답 목록 & 엑셀 추출 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-slate-900 text-base">체험자 1분 설문 응답 ({filteredSurveys.length}건)</h3>
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  기기별 1회 한정 응답
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 언어 필터 */}
                <div className="flex items-center gap-1 text-xs">
                  <Languages size={14} className="text-slate-400" />
                  <select
                    value={selectedLang}
                    onChange={(e) => setSelectedLang(e.target.value)}
                    className="p-1.5 border border-slate-200 rounded-xl font-bold bg-white focus:outline-none"
                  >
                    <option value="all">전체 언어</option>
                    <option value="ko">🇰🇷 한국어</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="zh">🇨🇳 中文</option>
                    <option value="ja">🇯🇵 日本語</option>
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="my">🇲🇲 မြန်မာ</option>
                  </select>
                </div>

                <button
                  onClick={loadSurveys}
                  disabled={loadingSurveys}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                  title="새로고침"
                >
                  <RefreshCw size={14} className={loadingSurveys ? "animate-spin" : ""} />
                </button>

                <button
                  onClick={handleExportCSV}
                  disabled={filteredSurveys.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow transition disabled:opacity-50"
                >
                  <Download size={14} /> 설문 응답 CSV 다운로드
                </button>
              </div>
            </div>

            {loadingSurveys ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                설문 응답을 불러오는 중...
              </div>
            ) : filteredSurveys.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                아직 제출된 설문 응답이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredSurveys.map((sur) => (
                  <div key={sur.id} className="py-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black px-2 py-0.5 bg-slate-100 rounded-md text-slate-800">
                          {LANG_LABEL_MAP[sur.language] || sur.language}
                        </span>

                        {/* 한국인 테스터 배지 */}
                        {(sur.isKorean || sur.nationality?.includes("한국") || sur.nationality?.includes("KR") || sur.nationality?.includes("Korea")) && (
                          <span className="text-xs font-black px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-300 rounded-md flex items-center gap-1 shadow-xs">
                            🇰🇷 한국인 테스터
                          </span>
                        )}

                        {/* 학습자 국적 */}
                        {sur.nationality && (
                          <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md flex items-center gap-1">
                            <Globe size={11} /> {sur.nationality}
                          </span>
                        )}

                        {/* 목표 급수 */}
                        {sur.targetLevel && (
                          <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md flex items-center gap-1">
                            <BookOpen size={11} /> {sur.targetLevel}
                          </span>
                        )}

                        {/* 학습 기간 */}
                        {sur.studyPeriod && (
                          <span className="text-xs font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md flex items-center gap-1">
                            <Clock size={11} /> {sur.studyPeriod}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 font-mono">
                          {formatDateTime(sur.createdAtMs)}
                        </span>
                      </div>

                      {/* 기기 ID */}
                      <span className="text-[10px] text-slate-400 font-mono">
                        기기: {sur.deviceId.slice(0, 14)}...
                      </span>
                    </div>

                    {/* 취약 영역 태그 */}
                    {sur.weaknesses && sur.weaknesses.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="text-slate-500 font-bold flex items-center gap-1">
                          <Layers size={11} /> 본인 취약점:
                        </span>
                        {sur.weaknesses.map((w) => (
                          <span key={w} className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-md font-bold">
                            {w}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ⚠️ 이상 결과 / 점수 오류 보고 박스 */}
                    {sur.experiencedError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900">
                          <AlertCircle size={13} className="text-rose-600 shrink-0" />
                          <span>⚠️ 발음 평가 중 이상 결과 및 점수 오류 보고</span>
                        </div>
                        {sur.errorTypes && sur.errorTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {sur.errorTypes.map((type) => (
                              <span key={type} className="px-2 py-0.5 bg-rose-100 text-rose-900 rounded font-medium text-[11px]">
                                {type}
                              </span>
                            ))}
                          </div>
                        )}
                        {sur.errorDetail && (
                          <p className="text-[11px] text-rose-800 pt-0.5">
                            상세 설명: <strong>{sur.errorDetail}</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {/* 평점 배지 그리드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 text-[10px] block">사용 편의성</span>
                        <strong className="text-slate-800 font-black">{sur.satisfaction} / 5</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 text-[10px] block">피드백 도움도</span>
                        <strong className="text-slate-800 font-black">{sur.feedbackClarity} / 5</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 text-[10px] block">AI 음성 퀄리티</span>
                        <strong className="text-slate-800 font-black">{sur.ttsQuality} / 5</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500 text-[10px] block">재이용 의향</span>
                        <strong className="text-slate-800 font-black">{sur.revisitIntent} / 5</strong>
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

      {/* ── 모달 1: 새 테스트 반 개설 모달 ── */}
      {showCreateTestClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <FlaskConical size={18} className="text-amber-600" />
                새 테스트 전용 반 개설하기
              </h3>
              <button
                onClick={() => setShowCreateTestClassModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTestClass} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">테스트 반 이름 *</label>
                <input
                  type="text"
                  value={newTestClassName}
                  onChange={(e) => setNewTestClassName(e.target.value)}
                  placeholder="예: 2026 1학기 발음 종합 테스트"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">소속 기관 / 학교</label>
                <input
                  type="text"
                  value={newTestClassInstitution}
                  onChange={(e) => setNewTestClassInstitution(e.target.value)}
                  placeholder="예: 소리튜터 본원, 동국대학교"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">테스트 커리큘럼 문장 선택 *</label>
                <select
                  value={newTestClassLevelOption}
                  onChange={(e) => setNewTestClassLevelOption(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {TEST_COLLECTION_OPTIONS.map((opt, idx) => (
                    <option key={opt.collection} value={idx}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 &apos;테스트 전용 문장&apos;을 선택하면 본 탭의 문장 관리에서 등록한 1~6급 문장이 바로 출제됩니다.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">담당 선생님 배정</label>
                <select
                  value={newTestClassTeacherEmail}
                  onChange={(e) => setNewTestClassTeacherEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">선생님 미지정 (관리자 직접 관리)</option>
                  {teachers.map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">메모 (선택)</label>
                <input
                  type="text"
                  value={newTestClassMemo}
                  onChange={(e) => setNewTestClassMemo(e.target.value)}
                  placeholder="예: 발음 진단평가용"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTestClassModal(false)}
                  className="px-3 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingTestClass}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl transition shadow disabled:opacity-50"
                >
                  {creatingTestClass ? "생성 중..." : "테스트 반 개설"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 모달 2: 테스트 반 소속 학생 관리 모달 ── */}
      {selectedTestClassForStudents && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base">
                  {selectedTestClassForStudents.name} 소속 학생 명단
                </h3>
                <p className="text-xs text-slate-500">
                  초대 코드: <strong className="font-mono text-indigo-600">{selectedTestClassForStudents.inviteCode}</strong> · 소속 학생 {testClassStudents.length}명
                </p>
              </div>
              <button
                onClick={() => setSelectedTestClassForStudents(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* 학생 수동 추가 폼 */}
            <form onSubmit={handleAddTestStudentToClass} className="flex gap-1.5 flex-wrap p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <input
                type="email"
                required
                value={addTestStudentEmail}
                onChange={(e) => setAddTestStudentEmail(e.target.value)}
                placeholder="학생 이메일 (구글)"
                className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <input
                type="text"
                value={addTestStudentName}
                onChange={(e) => setAddTestStudentName(e.target.value)}
                placeholder="이름"
                className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <input
                type="text"
                value={addTestStudentId}
                onChange={(e) => setAddTestStudentId(e.target.value)}
                placeholder="학번/식별자"
                className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingTestStudent}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition disabled:opacity-50"
              >
                {addingTestStudent ? <Loader2 size={12} className="animate-spin" /> : "추가"}
              </button>
            </form>

            {/* 학생 목록 테이블 */}
            <div className="flex-1 overflow-y-auto pr-1">
              {loadingTestStudents ? (
                <div className="py-12 text-center text-slate-700 text-xs">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2 text-indigo-600" />
                  소속 학생을 불러오는 중...
                </div>
              ) : testClassStudents.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  아직 이 테스트 반에 등록된 학생이 없습니다. 가입 링크/QR을 공유하거나 위에서 수동으로 등록하세요.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {testClassStudents.map((s) => (
                    <div key={s.email} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{s.name}</span>
                          {s.studentId && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                              {s.studentId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">{s.email}</p>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-slate-500 text-[10px]">연습 {s.totalCount}회</p>
                          <p className="font-bold text-indigo-600">{s.totalCount > 0 ? `${s.avgScore}점` : "-"}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveTestStudentFromClass(s.email)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                          title="반에서 제외"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 모달 3: 테스트 반 초대 QR 코드 모달 ── */}
      {selectedTestClassForQR && (
        <TestClassQrModal
          classData={selectedTestClassForQR}
          onClose={() => setSelectedTestClassForQR(null)}
        />
      )}

      {/* ── 모달 4: 문장 추가/수정 모달 ── */}
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

      {/* ── 모달 5: 무설치 무료 체험(/demo) QR 모달 ── */}
      {showDemoQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-base">무설치 무료 체험(/demo) QR</h3>
              <button onClick={() => setShowDemoQrModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={demoQrImgUrl} alt="데모 QR" className="w-52 h-52 mx-auto rounded-xl bg-white" />
            </div>
            <p className="text-xs font-mono text-slate-500 break-all">{demoUrl}</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleCopyLink}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition"
              >
                {copiedLink ? "복사됨!" : "링크 복사"}
              </button>
              <button
                onClick={() => setShowDemoQrModal(false)}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 테스트 반 전용 QR 코드 모달 컴포넌트 ──────────────
function TestClassQrModal({
  classData,
  onClose,
}: {
  classData: ClassData;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = `${origin}/join?code=${classData.inviteCode}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
    inviteUrl
  )}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(qrImgUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `소리튜터_${classData.name}_테스트QR.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${classData.name} - 테스트 초대 QR 코드</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 40px;
              box-sizing: border-box;
              text-align: center;
            }
            .card {
              border: 3px solid #f59e0b;
              border-radius: 24px;
              padding: 36px 48px;
              max-width: 440px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
            .badge {
              display: inline-block;
              background: #fef3c7;
              color: #92400e;
              border: 1px solid #fcd34d;
              font-weight: 900;
              font-size: 13px;
              padding: 4px 12px;
              border-radius: 999px;
              margin-bottom: 12px;
            }
            h1 { font-size: 24px; margin: 0 0 8px 0; color: #0f172a; }
            p { font-size: 14px; color: #64748b; margin: 4px 0 20px 0; }
            img { width: 220px; height: 220px; border-radius: 16px; margin: 12px 0; }
            .code-box {
              background: #f8fafc;
              border: 2px dashed #cbd5e1;
              border-radius: 12px;
              padding: 12px;
              margin-top: 16px;
            }
            .code { font-family: monospace; font-size: 26px; font-weight: 900; color: #4338ca; letter-spacing: 4px; }
            .url { font-size: 11px; color: #94a3b8; word-break: break-all; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">🧪 발음 테스트 전용 반</div>
            <h1>${classData.name}</h1>
            <p>${classData.institution || "소리튜터"} · 담당: ${classData.teacherName || "선생님"}</p>
            <img src="${qrImgUrl}" alt="QR Code" />
            <div class="code-box">
              <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">초대 코드</div>
              <div class="code">${classData.inviteCode}</div>
              <div class="url">${inviteUrl}</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="text-left">
            <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
              🧪 테스트 반 QR
            </span>
            <h3 className="font-black text-slate-900 text-base mt-1">{classData.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-amber-300 inline-block shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImgUrl} alt="테스트 반 QR" className="w-52 h-52 mx-auto rounded-xl bg-white" />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-500">초대 코드</p>
          <p className="font-mono font-black text-2xl text-indigo-600 tracking-wider">
            {classData.inviteCode}
          </p>
          <p className="text-[11px] font-mono text-slate-400 break-all">{inviteUrl}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copied ? "복사됨" : "복사"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Download size={12} />
            <span>{downloading ? "저장 중" : "저장"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition flex items-center justify-center gap-1 shadow-xs"
          >
            <Printer size={12} />
            <span>인쇄</span>
          </button>
        </div>
      </div>
    </div>
  );
}
