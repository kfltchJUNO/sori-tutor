"use client";
// app/join/page.tsx
// 학생이 초대 코드로 반에 가입하는 전용 페이지

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, ArrowRight, School, User, Sparkles, Loader2, AlertCircle } from "lucide-react";

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [code, setCode] = useState(searchParams.get("code") || "");
  const [studentId, setStudentId] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [idToken, setIdToken] = useState("");
  const [classInfo, setClassInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const token = await user.getIdToken();
        setIdToken(token);
      }
    });
    return () => unsub();
  }, []);

  // 초대 코드 조회
  const fetchClassInfo = async (codeToFetch: string) => {
    if (!codeToFetch.trim()) return;
    setLoadingInfo(true);
    setError(null);
    try {
      const res = await fetch(`/api/join?code=${encodeURIComponent(codeToFetch.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "반 정보를 찾을 수 없습니다.");
      setClassInfo(data);
    } catch (e: any) {
      setClassInfo(null);
      setError(e.message);
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    const urlCode = searchParams.get("code");
    if (urlCode) {
      setCode(urlCode.toUpperCase());
      fetchClassInfo(urlCode.toUpperCase());
    }
  }, [searchParams]);

  // 구글 로그인
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setError("로그인에 실패했습니다: " + e.message);
    }
  };

  // 반 가입 확정
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !idToken) {
      await handleLogin();
      return;
    }

    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          studentId: studentId.trim(),
          name: currentUser.displayName || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "가입 처리에 실패했습니다.");

      setSuccessData(data);
      setTimeout(() => {
        router.push(data.redirectPath || "/");
      }, 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80 shadow-xl p-7 space-y-6">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <School size={28} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">수업 반(Class) 참여</h1>
          <p className="text-xs text-slate-700">
            선생님이 공유해 주신 초대 코드로 내 반에 등록하고 맞춤 발음 훈련을 시작하세요.
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 성공 메시지 */}
        {successData ? (
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2 animate-in fade-in">
            <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
            <h3 className="font-black text-emerald-900 text-base">
              🎉 {successData.className} 등록 완료!
            </h3>
            <p className="text-xs text-emerald-700 font-medium">
              잠시 후 전용 발음 학습실로 자동 이동합니다...
            </p>
            <Loader2 size={16} className="animate-spin text-emerald-600 mx-auto mt-2" />
          </div>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            {/* 초대 코드 입력 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">초대 코드 (6자리)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="예: DK3A26"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-mono font-black text-base text-center tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => fetchClassInfo(code)}
                  disabled={loadingInfo || !code.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {loadingInfo ? <Loader2 size={14} className="animate-spin" /> : "확인"}
                </button>
              </div>
            </div>

            {/* 반 정보 미리보기 카드 */}
            {classInfo && (
              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase bg-indigo-100 px-2 py-0.5 rounded-md">
                    {classInfo.level}
                  </span>
                  <span className="text-xs text-slate-700 font-medium">{classInfo.institution}</span>
                </div>
                <h4 className="font-black text-slate-900 text-base">{classInfo.name}</h4>
                <p className="text-xs text-slate-700 font-medium flex items-center gap-1">
                  <User size={12} className="text-indigo-600" /> 담당 선생님: <strong>{classInfo.teacherName}</strong>
                </p>
              </div>
            )}

            {/* 학번 입력 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                학번 (Student ID) <span className="text-slate-700 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="예: 2026110901"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 로그인 상태 및 가입 버튼 */}
            {!currentUser ? (
              <button
                type="button"
                onClick={handleLogin}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-md"
              >
                Google 계정으로 로그인하고 참여하기
              </button>
            ) : (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="truncate">👤 <strong>{currentUser.displayName || currentUser.email}</strong></span>
                  <span className="text-[11px] text-emerald-600 font-bold">로그인됨 ✓</span>
                </div>
                <button
                  type="submit"
                  disabled={joining || !code.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-md disabled:opacity-50"
                >
                  {joining ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> 등록 중...
                    </>
                  ) : (
                    <>
                      반 등록 완료 및 학습 시작 <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">로딩 중...</div>}>
      <JoinContent />
    </Suspense>
  );
}
