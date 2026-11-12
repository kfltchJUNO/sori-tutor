"use client";
// app/admin/ClassManagementSection.tsx
// 최고 관리자 전용: 반(Class) 및 선생님(Teacher), 학생 배정 통합 관리 컴포넌트

import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/firebase";
import {
  School, User, Plus, RefreshCw, Loader2, Copy, Check, Trash2,
  Users, BookOpen, Download, AlertCircle, Edit2, ExternalLink, X,
} from "lucide-react";
import type { ClassData } from "@/app/api/admin/classes/route";
import type { TeacherData } from "@/app/api/admin/teachers/route";
import type { ClassStudentInfo } from "@/app/api/admin/classes/students/route";

interface Props {
  idToken: string;
}

const LEVEL_COLLECTION_OPTIONS = [
  { label: "동국대 1급 (기초)", collection: "sori_curriculum_dongguk", level: "동국대 1급" },
  { label: "동국대 3급 (중급)", collection: "sori_curriculum_dongguk3", level: "동국대 3급" },
  { label: "단국대 전용 코스", collection: "sori_curriculum_dankook", level: "단국대" },
  { label: "일반 문장 커리큘럼", collection: "sori_curriculum_sentence", level: "일반 문장" },
];

export default function ClassManagementSection({ idToken }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"classes" | "teachers">("classes");

  // 데이터 상태
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달 상태
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showCreateTeacherModal, setShowCreateTeacherModal] = useState(false);
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<ClassData | null>(null);
  const [classStudents, setClassStudents] = useState<ClassStudentInfo[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // 신규 반 폼
  const [newClassName, setNewClassName] = useState("");
  const [newClassInstitution, setNewClassInstitution] = useState("동국대학교");
  const [newClassLevelOption, setNewClassLevelOption] = useState(0);
  const [newClassTeacherEmail, setNewClassTeacherEmail] = useState("");
  const [newClassMemo, setNewClassMemo] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);

  // 신규 선생님 폼
  const [newTeacherEmail, setNewTeacherEmail] = useState("");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherInstitution, setNewTeacherInstitution] = useState("동국대학교");
  const [newTeacherPhone, setNewTeacherPhone] = useState("");
  const [newTeacherMemo, setNewTeacherMemo] = useState("");
  const [creatingTeacher, setCreatingTeacher] = useState(false);

  // 학생 수동 추가 폼
  const [addStudentEmail, setAddStudentEmail] = useState("");
  const [addStudentName, setAddStudentName] = useState("");
  const [addStudentId, setAddStudentId] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);

  // 복사 피드백
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [classRes, teacherRes] = await Promise.all([
        adminFetch("/api/admin/classes", { method: "GET" }, idToken),
        adminFetch("/api/admin/teachers", { method: "GET" }, idToken),
      ]);

      const classData = await classRes.json();
      const teacherData = await teacherRes.json();

      if (!classRes.ok) throw new Error(classData.error || "반 목록 조회 실패");
      if (!teacherRes.ok) throw new Error(teacherData.error || "선생님 목록 조회 실패");

      setClasses(classData.classes || []);
      setTeachers(teacherData.teachers || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [idToken]);

  // 반 생성 핸들러
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    setCreatingClass(true);
    try {
      const selectedOpt = LEVEL_COLLECTION_OPTIONS[newClassLevelOption];
      const selectedTeacher = teachers.find(t => t.email === newClassTeacherEmail);

      const res = await adminFetch(
        "/api/admin/classes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newClassName.trim(),
            institution: newClassInstitution.trim(),
            level: selectedOpt.level,
            curriculumCollection: selectedOpt.collection,
            teacherEmail: newClassTeacherEmail,
            teacherName: selectedTeacher?.name || "선생님 미지정",
            memo: newClassMemo.trim(),
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "반 생성 실패");

      setShowCreateClassModal(false);
      setNewClassName("");
      setNewClassMemo("");
      loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setCreatingClass(false);
    }
  };

  // 반 삭제 핸들러
  const handleDeleteClass = async (classId: string, name: string) => {
    if (!confirm(`'${name}' 반을 정말 삭제하시겠습니까? (소속 학생들의 반 배정이 해제됩니다)`)) return;
    try {
      const res = await adminFetch(`/api/admin/classes?classId=${classId}`, { method: "DELETE" }, idToken);
      if (!res.ok) throw new Error("반 삭제 실패");
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 선생님 등록 핸들러
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherEmail.trim() || !newTeacherName.trim()) return;

    setCreatingTeacher(true);
    try {
      const res = await adminFetch(
        "/api/admin/teachers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: newTeacherEmail.trim(),
            name: newTeacherName.trim(),
            institution: newTeacherInstitution.trim(),
            phone: newTeacherPhone.trim(),
            memo: newTeacherMemo.trim(),
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "선생님 등록 실패");

      setShowCreateTeacherModal(false);
      setNewTeacherEmail("");
      setNewTeacherName("");
      setNewTeacherPhone("");
      setNewTeacherMemo("");
      loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setCreatingTeacher(false);
    }
  };

  // 선생님 삭제 핸들러
  const handleDeleteTeacher = async (email: string, name: string) => {
    if (!confirm(`'${name} (${email})' 선생님의 권한을 해제하시겠습니까?`)) return;
    try {
      const res = await adminFetch(
        `/api/admin/teachers?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
        idToken
      );
      if (!res.ok) throw new Error("선생님 삭제 실패");
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 특정 반의 소속 학생 목록 조회
  const openClassStudentsModal = async (c: ClassData) => {
    setSelectedClassForStudents(c);
    setLoadingStudents(true);
    try {
      const res = await adminFetch(`/api/admin/classes/students?classId=${c.id}`, { method: "GET" }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "학생 목록 조회 실패");
      setClassStudents(data.students || []);
    } catch (e: any) {
      alert("학생 목록 조회 실패: " + e.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  // 반에 학생 수동 배정
  const handleAddStudentToClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassForStudents || !addStudentEmail.trim()) return;

    setAddingStudent(true);
    try {
      const res = await adminFetch(
        "/api/admin/classes/students",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: selectedClassForStudents.id,
            email: addStudentEmail.trim(),
            name: addStudentName.trim(),
            studentId: addStudentId.trim(),
          }),
        },
        idToken
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "학생 배정 실패");

      setAddStudentEmail("");
      setAddStudentName("");
      setAddStudentId("");
      openClassStudentsModal(selectedClassForStudents);
      loadData();
    } catch (e: any) {
      alert("학생 배정 오류: " + e.message);
    } finally {
      setAddingStudent(false);
    }
  };

  // 반에서 학생 배정 해제
  const handleRemoveStudentFromClass = async (email: string) => {
    if (!confirm(`'${email}' 학생을 이 반에서 제외하시겠습니까?`)) return;
    try {
      const res = await adminFetch(
        `/api/admin/classes/students?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
        idToken
      );
      if (!res.ok) throw new Error("배정 해제 실패");
      if (selectedClassForStudents) openClassStudentsModal(selectedClassForStudents);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 초대 링크 복사
  const handleCopyInviteLink = (code: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/join?code=${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // 반 학생 CSV 다운로드
  const handleExportClassStudentsCSV = () => {
    if (!selectedClassForStudents || classStudents.length === 0) return;

    const headers = ["학번", "이름", "이메일", "반 이름", "담당 선생님", "배정 급수", "총 연습 횟수", "평균 점수"];
    const rows = classStudents.map(s => [
      `"${s.studentId || "-"}"`,
      `"${s.name || "-"}"`,
      `"${s.email}"`,
      `"${selectedClassForStudents.name}"`,
      `"${selectedClassForStudents.teacherName}"`,
      `"${selectedClassForStudents.level}"`,
      s.totalCount,
      s.avgScore,
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedClassForStudents.name}_학생목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 탭 및 액션 버튼 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <School className="text-indigo-600" /> 반(Class) & 선생님 통합 관리
          </h2>
          <p className="text-xs text-slate-700 mt-1">
            선생님을 등록하고 급수별 반을 개설하여 학생들을 배정할 수 있습니다. (선생님은 일레븐랩스 문장 생성 권한이 제한되어 비용이 보호됩니다)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold p-0.5 bg-slate-50">
            <button
              onClick={() => setActiveSubTab("classes")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeSubTab === "classes" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              🏫 반 목록 ({classes.length})
            </button>
            <button
              onClick={() => setActiveSubTab("teachers")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeSubTab === "teachers" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              👩‍🏫 선생님 목록 ({teachers.length})
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-slate-700"
            title="새로고침"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* 2. 반(Class) 관리 뷰 */}
      {activeSubTab === "classes" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-slate-900 text-base">개설된 반 목록</h3>
            <button
              onClick={() => setShowCreateClassModal(true)}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl transition shadow-xs"
            >
              <Plus size={14} /> 새 반 개설하기
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-700 text-xs">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              반 목록을 불러오는 중...
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-700 text-xs space-y-2">
              <School size={36} className="mx-auto text-slate-700" />
              <p className="font-bold text-slate-700 text-sm">아직 개설된 반이 없습니다.</p>
              <p>우측 상단의 &apos;새 반 개설하기&apos;를 눌러 급수와 선생님을 배정해 보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md">
                        {cls.level}
                      </span>
                      <span className="text-xs text-slate-700 font-medium">{cls.institution}</span>
                    </div>
                    <h4 className="font-black text-slate-900 text-base">{cls.name}</h4>
                    <p className="text-xs text-slate-700 flex items-center gap-1">
                      <User size={13} className="text-indigo-600" /> 담당: <strong>{cls.teacherName}</strong>
                    </p>
                  </div>

                  {/* 초대 코드 및 학생 수 */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-medium">소속 학생</span>
                      <span className="font-black text-indigo-600">{cls.studentCount}명 등록</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
                      <span className="font-mono font-bold text-slate-700 tracking-wider">코드: {cls.inviteCode}</span>
                      <button
                        onClick={() => handleCopyInviteLink(cls.inviteCode)}
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition"
                      >
                        {copiedCode === cls.inviteCode ? (
                          <>
                            <Check size={12} className="text-emerald-600" /> 복사됨!
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> 링크 복사
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => openClassStudentsModal(cls)}
                        className="flex-1 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition text-center"
                      >
                        학생 관리 & 통계
                      </button>
                      <button
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                        className="p-1.5 text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="반 삭제"
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

      {/* 3. 선생님(Teacher) 관리 뷰 */}
      {activeSubTab === "teachers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-slate-900 text-base">등록된 선생님 목록</h3>
            <button
              onClick={() => setShowCreateTeacherModal(true)}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl transition shadow-xs"
            >
              <Plus size={14} /> 신규 선생님 등록
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-700 text-xs">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              선생님 목록을 불러오는 중...
            </div>
          ) : teachers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-700 text-xs space-y-2">
              <User size={36} className="mx-auto text-slate-700" />
              <p className="font-bold text-slate-700 text-sm">등록된 선생님이 없습니다.</p>
              <p>우측 상단의 &apos;신규 선생님 등록&apos; 버튼으로 담당 교원을 등록해 보세요.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="divide-y divide-slate-100">
                {teachers.map((t) => {
                  const assignedClasses = classes.filter(c => c.teacherEmail === t.email);
                  return (
                    <div key={t.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900">{t.name}</span>
                          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                            {t.institution || "기관 미지정"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-mono">{t.email} {t.phone && `· ${t.phone}`}</p>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[11px] text-slate-700 font-medium">담당 반:</span>
                          {assignedClasses.length > 0 ? (
                            assignedClasses.map(c => (
                              <span key={c.id} className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                                {c.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-700 font-medium">배정된 반 없음</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleDeleteTeacher(t.email, t.name)}
                          className="text-xs text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
                        >
                          <Trash2 size={13} /> 권한 해제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 모달 1: 새 반 개설 모달 */}
      {showCreateClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <School size={18} className="text-indigo-600" /> 신규 반 개설
              </h3>
              <button onClick={() => setShowCreateClassModal(false)} className="text-slate-700 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">반 이름</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="예: 동국대 3급 A반, 초급 한국어 집중반"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">소속 기관/대학교</label>
                <input
                  type="text"
                  value={newClassInstitution}
                  onChange={(e) => setNewClassInstitution(e.target.value)}
                  placeholder="예: 동국대학교, 단국대학교"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">배정 급수 & 공식 문장 컬렉션</label>
                <select
                  value={newClassLevelOption}
                  onChange={(e) => setNewClassLevelOption(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {LEVEL_COLLECTION_OPTIONS.map((opt, idx) => (
                    <option key={opt.collection} value={idx}>
                      {opt.label} ({opt.collection})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-700 mt-1">
                  선택한 급수의 공식 문장들만 학생 화면에 표출되며, 선생님의 임의 생성이 차단되어 비용이 절감됩니다.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">담당 선생님</label>
                <select
                  value={newClassTeacherEmail}
                  onChange={(e) => setNewClassTeacherEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">(선생님 나중에 지정)</option>
                  {teachers.map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.name} ({t.email}) - {t.institution}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">메모/설명 (선택)</label>
                <input
                  type="text"
                  value={newClassMemo}
                  onChange={(e) => setNewClassMemo(e.target.value)}
                  placeholder="예: 2026학년도 가을학기 정규반"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateClassModal(false)}
                  className="px-3 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingClass}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                >
                  {creatingClass ? <Loader2 size={14} className="animate-spin" /> : "반 개설 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 2: 신규 선생님 등록 모달 */}
      {showCreateTeacherModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <User size={18} className="text-indigo-600" /> 신규 선생님 등록
              </h3>
              <button onClick={() => setShowCreateTeacherModal(false)} className="text-slate-700 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTeacher} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">선생님 구글 이메일 (로그인 ID)</label>
                <input
                  type="email"
                  required
                  value={newTeacherEmail}
                  onChange={(e) => setNewTeacherEmail(e.target.value)}
                  placeholder="teacher@univ.ac.kr"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">선생님 성함</label>
                <input
                  type="text"
                  required
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  placeholder="김한국 선생님"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">소속 기관/대학</label>
                <input
                  type="text"
                  value={newTeacherInstitution}
                  onChange={(e) => setNewTeacherInstitution(e.target.value)}
                  placeholder="동국대학교"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">연락처 (선택)</label>
                <input
                  type="tel"
                  value={newTeacherPhone}
                  onChange={(e) => setNewTeacherPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTeacherModal(false)}
                  className="px-3 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingTeacher}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                >
                  {creatingTeacher ? <Loader2 size={14} className="animate-spin" /> : "등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 3: 반 학생 관리 및 통계 모달 */}
      {selectedClassForStudents && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900 text-lg">{selectedClassForStudents.name}</h3>
                  <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                    {selectedClassForStudents.level}
                  </span>
                </div>
                <p className="text-xs text-slate-700 mt-0.5">
                  담당: {selectedClassForStudents.teacherName} · 코드: <strong>{selectedClassForStudents.inviteCode}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportClassStudentsCSV}
                  disabled={classStudents.length === 0}
                  className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <Download size={13} /> 학생 명단 CSV
                </button>
                <button onClick={() => setSelectedClassForStudents(null)} className="text-slate-700 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* 학생 수동 추가 인라인 폼 */}
            <form onSubmit={handleAddStudentToClass} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs flex flex-wrap items-center gap-2">
              <span className="font-black text-slate-700 shrink-0">학생 수동 배정:</span>
              <input
                type="email"
                required
                value={addStudentEmail}
                onChange={(e) => setAddStudentEmail(e.target.value)}
                placeholder="학생 이메일 (구글)"
                className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <input
                type="text"
                value={addStudentName}
                onChange={(e) => setAddStudentName(e.target.value)}
                placeholder="이름"
                className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <input
                type="text"
                value={addStudentId}
                onChange={(e) => setAddStudentId(e.target.value)}
                placeholder="학번"
                className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingStudent}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition disabled:opacity-50"
              >
                {addingStudent ? <Loader2 size={12} className="animate-spin" /> : "추가"}
              </button>
            </form>

            {/* 학생 목록 테이블 */}
            <div className="flex-1 overflow-y-auto pr-1">
              {loadingStudents ? (
                <div className="py-12 text-center text-slate-700 text-xs">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2 text-indigo-600" />
                  소속 학생을 불러오는 중...
                </div>
              ) : classStudents.length === 0 ? (
                <div className="py-10 text-center text-slate-700 text-xs">
                  아직 이 반에 등록된 학생이 없습니다. 초대 코드를 공유하거나 위에서 수동으로 등록하세요.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {classStudents.map((s) => (
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
                        <p className="text-[11px] text-slate-700 font-mono">{s.email}</p>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-slate-700 text-[10px]">연습 {s.totalCount}회</p>
                          <p className="font-bold text-indigo-600">{s.totalCount > 0 ? `${s.avgScore}점` : "-"}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveStudentFromClass(s.email)}
                          className="text-slate-700 hover:text-red-600 p-1 rounded transition"
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
    </div>
  );
}
