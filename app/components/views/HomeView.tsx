"use client";
// components/views/HomeView.tsx
import { Mic, Star, MessageSquare, MessageCircle, Trophy, GraduationCap, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";
import SoriIcon from "@/app/components/SoriIcon";
import type { SoriUser } from "@/types";

interface Props {
  user: SoriUser;
  onSelectCourse: (type: "word" | "sentence" | "dialogue") => void;
  onEnterFreeTalking: () => void;
  onFetchRanking: () => void;
  onFetchHistory: () => void;
  onOpenNickname: () => void;
  onOpenDonggukModal: () => void;
  onEnterDonggukCourse: () => void;
  onOpenDongguk3Modal?: () => void;
  onEnterDongguk3Course?: () => void;
  onOpenDankookModal: () => void;
  onEnterDankookCourse: () => void;
}

// Tailwind 동적 클래스 문제 방지 — 정적 클래스로 정의
const COURSES = [
  {
    id: "word" as const,
    t: "단어 발음 연습", d: "기초 어휘 마스터",
    icon: <Mic size={22} />,
    iconBg: "bg-blue-100", iconText: "text-blue-600",
    hoverBorder: "hover:border-blue-400", hoverBg: "hover:bg-blue-50",
    hoverText: "group-hover:text-blue-700",
  },
  {
    id: "sentence" as const,
    t: "문장 억양 연습", d: "자연스러운 억양 익히기",
    icon: <Star size={22} />,
    iconBg: "bg-indigo-100", iconText: "text-indigo-600",
    hoverBorder: "hover:border-indigo-400", hoverBg: "hover:bg-indigo-50",
    hoverText: "group-hover:text-indigo-700",
  },
  {
    id: "dialogue" as const,
    t: "실전 회화", d: "AI와 역할극 대화",
    icon: <MessageSquare size={22} />,
    iconBg: "bg-purple-100", iconText: "text-purple-600",
    hoverBorder: "hover:border-purple-400", hoverBg: "hover:bg-purple-50",
    hoverText: "group-hover:text-purple-700",
  },
];

export default function HomeView({
  user, onSelectCourse, onEnterFreeTalking,
  onFetchRanking, onFetchHistory, onOpenNickname,
  onOpenDonggukModal, onEnterDonggukCourse,
  onOpenDongguk3Modal, onEnterDongguk3Course,
  onOpenDankookModal, onEnterDankookCourse,
}: Props) {
  const isDongguk1Approved = user.dongguk_status === "approved";
  const isDongguk3Approved = user.dongguk3_status === "approved";
  const isDankookApproved = user.dankook_status === "approved";

  // 학교 인증 완료된 계정인지 여부
  const isUnivApproved = isDongguk1Approved || isDongguk3Approved || isDankookApproved;

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">

      {/* 유저 상태 카드 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-slate-800 text-lg truncate">
              {user.alias || user.name}님
            </h3>
            <button
              onClick={onOpenNickname}
              className="shrink-0 text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded-lg hover:bg-slate-50 transition"
            >
              변경
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-1.5">
            일일 목표{" "}
            <span className="font-bold text-orange-500">
              {Math.min(user.today_count, 5)}/5
            </span>
          </p>
          <div className="w-36 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min((user.today_count / 5) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="text-center bg-orange-50 px-4 py-3 rounded-xl shrink-0">
          <p className="text-2xl font-black text-orange-500 leading-none mb-1">
            {user.streak}
            <span className="text-sm font-bold text-orange-400 ml-0.5">일</span>
          </p>
          <p className="text-[10px] text-orange-700 font-bold">연속 학습중</p>
        </div>
      </div>

      {/* 빠른 메뉴 (내 기록) */}
      <div className="flex gap-2">
        {!isUnivApproved && (
          <button
            onClick={onFetchRanking}
            className="flex items-center gap-1.5 bg-yellow-50 text-yellow-700 px-3 py-2 rounded-full font-bold text-sm hover:bg-yellow-100 transition border border-yellow-100"
          >
            <Trophy size={14} /> 랭킹
          </button>
        )}
        <button
          onClick={onFetchHistory}
          className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-2 rounded-full font-bold text-sm hover:bg-slate-200 transition"
        >
          내 발음 기록
        </button>
      </div>

      {/* ── [A] 학교 인증 완료 계정 전용 화면 ── */}
      {isUnivApproved ? (
        <div className="space-y-4 pt-1">
          {/* 학교 인증 계정 전용 안내 배너 */}
          <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center gap-2">
              <GraduationCap size={20} className="text-amber-400" />
              <h4 className="font-black text-sm text-amber-300">학교 전용 학습 모드 적용 중</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              학교 인증 학생 계정은 커리큘럼 기준에 따라 등록된 <strong>지정 문장 학습</strong>만 이용하도록 제한되어 있습니다.
            </p>
          </div>

          <div className="grid gap-3">
            {/* 1. 동국대 1급 전용 코스 */}
            {isDongguk1Approved && (
              <div className="bg-white p-5 rounded-2xl border-2 border-amber-300 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        동국대 1급 인증 학생
                      </span>
                      {user.dongguk_student_id && (
                        <span className="text-[11px] font-mono text-slate-500 font-bold">
                          학번: {user.dongguk_student_id}
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-lg text-slate-900">동국한국어 1급 전용 문장 코스</h3>
                    <p className="text-xs text-slate-500">
                      수업 맞춤 1급 문장과 원어민 일레븐랩스 발음으로 연습합니다.
                    </p>
                  </div>
                  <span className="text-3xl">🌱</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={onEnterDonggukCourse}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
                  >
                    1급 코스 바로 시작하기 <ArrowRight size={16} />
                  </button>
                  <a
                    href="/dongguk"
                    className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl border border-amber-200 transition"
                    title="동국대 1급 전용 포털 열기"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            )}

            {/* 2. 동국대 3급 전용 코스 */}
            {isDongguk3Approved && (
              <div className="bg-white p-5 rounded-2xl border-2 border-orange-300 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                        동국대 3급 인증 학생
                      </span>
                      {user.dongguk3_student_id && (
                        <span className="text-[11px] font-mono text-slate-500 font-bold">
                          학번: {user.dongguk3_student_id}
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-lg text-slate-900">동국한국어 3급 전용 문장 코스</h3>
                    <p className="text-xs text-slate-500">
                      중급 표현과 심화 발음 규칙이 포함된 3급 전용 커리큘럼입니다.
                    </p>
                  </div>
                  <span className="text-3xl">🌿</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={onEnterDongguk3Course || onEnterDonggukCourse}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
                  >
                    3급 코스 바로 시작하기 <ArrowRight size={16} />
                  </button>
                  <a
                    href="/dongguk3"
                    className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-800 rounded-xl border border-orange-200 transition"
                    title="동국대 3급 전용 포털 열기"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            )}

            {/* 3. 단국대학교 전용 코스 */}
            {isDankookApproved && (
              <div className="bg-white p-5 rounded-2xl border-2 border-blue-300 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        단국대학교 인증 학생
                      </span>
                      {user.dankook_student_id && (
                        <span className="text-[11px] font-mono text-slate-500 font-bold">
                          학번: {user.dankook_student_id}
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-lg text-slate-900">단국대학교 한국어 전용 코스</h3>
                    <p className="text-xs text-slate-500">
                      단국대 맞춤형 커리큘럼 문장으로 정확한 억양을 훈련합니다.
                    </p>
                  </div>
                  <span className="text-3xl">🐻</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={onEnterDankookCourse}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
                  >
                    단국대 코스 바로 시작하기 <ArrowRight size={16} />
                  </button>
                  <a
                    href="/dankook"
                    className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl border border-blue-200 transition"
                    title="단국대 전용 포털 열기"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── [B] 일반 사용자 화면: 기존 코스 선택 및 자유 회화 ── */
        <div className="grid gap-3">
          {COURSES.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectCourse(item.id)}
              className={`w-full p-4 rounded-2xl text-left bg-white shadow-sm border border-slate-100 transition group flex items-center gap-4 ${item.hoverBorder} ${item.hoverBg}`}
            >
              <div className={`w-12 h-12 rounded-2xl ${item.iconBg} ${item.iconText} flex items-center justify-center group-hover:scale-110 transition-transform shrink-0`}>
                {item.icon}
              </div>
              <div>
                <p className={`text-base font-bold text-slate-800 ${item.hoverText}`}>
                  {item.t}
                </p>
                <p className="text-sm text-slate-400">{item.d}</p>
              </div>
            </button>
          ))}

          {/* 자유 회화 */}
          <button
            onClick={onEnterFreeTalking}
            className="w-full p-4 rounded-2xl text-left bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm border border-emerald-100 hover:border-emerald-400 transition group flex items-center gap-4 relative overflow-hidden"
          >
            <div className="absolute top-2.5 right-3 bg-white/90 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <SoriIcon size={12} /> 2 Sori / 턴
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <MessageCircle size={22} />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800 group-hover:text-emerald-700">
                한국어 자유 회화 <span className="text-xs font-normal text-slate-400">(Beta)</span>
              </p>
              <p className="text-sm text-slate-400">AI와 자유 대화</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
