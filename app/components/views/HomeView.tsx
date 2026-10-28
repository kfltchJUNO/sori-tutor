"use client";
// components/views/HomeView.tsx
import { Mic, Star, MessageSquare, MessageCircle, Trophy, GraduationCap, Clock, CheckCircle2 } from "lucide-react";
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
  onOpenDankookModal, onEnterDankookCourse,
}: Props) {
  const donggukStatus = user.dongguk_status || "none";
  const dankookStatus = user.dankook_status || "none";

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

      {/* 빠른 메뉴 */}
      <div className="flex gap-2">
        <button
          onClick={onFetchRanking}
          className="flex items-center gap-1.5 bg-yellow-50 text-yellow-700 px-3 py-2 rounded-full font-bold text-sm hover:bg-yellow-100 transition border border-yellow-100"
        >
          <Trophy size={14} /> 랭킹
        </button>
        <button
          onClick={onFetchHistory}
          className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-2 rounded-full font-bold text-sm hover:bg-slate-200 transition"
        >
          내 기록
        </button>
      </div>

      {/* 🏫 동국대학교 학생 인증 & 1급 발음 전용 카드 */}
      {donggukStatus === "approved" ? (
        <div
          onClick={onEnterDonggukCourse}
          className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-4 shadow-md cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 border border-amber-400"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-xl shrink-0">
              <GraduationCap size={24} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="bg-white text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 size={10} /> 승인 완료 (전액 무료)
                </span>
                <h4 className="font-black text-white text-base">동국한국어 1급</h4>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">초급 발음 공식 & 무료 번역 이용</p>
            </div>
          </div>
          <span className="bg-white/20 hover:bg-white/30 px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition">
            학습 시작 →
          </span>
        </div>
      ) : donggukStatus === "pending" ? (
        <div className="bg-amber-50/90 border-2 border-amber-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg shrink-0">
              <Clock size={20} className="animate-spin text-amber-600" />
            </div>
            <div>
              <h4 className="font-bold text-amber-900 text-sm">동국대 학생 승인 대기 중 ⏳</h4>
              <p className="text-xs text-amber-700">선생님 확인 후 1급 코스가 바로 열려요!</p>
            </div>
          </div>
          <span className="text-[11px] font-bold bg-white text-amber-700 border border-amber-300 px-3 py-1 rounded-full shrink-0 shadow-sm">
            확인 중
          </span>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
              <GraduationCap size={20} />
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-sm">동국대학교 1급 학생이신가요?</h4>
              <p className="text-xs text-slate-500">선생님 연결 요청 후 1급 발음 코스 & 번역 무료 이용</p>
            </div>
          </div>
          <button
            onClick={onOpenDonggukModal}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow transition"
          >
            학생 인증 →
          </button>
        </div>
      )}

      {/* 🐻 단국대학교 학생 인증 & 전용 발음 카드 */}
      {dankookStatus === "approved" ? (
        <div
          onClick={onEnterDankookCourse}
          className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-2xl p-4 shadow-md cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 border border-blue-400"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-xl shrink-0">
              🐻
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="bg-white text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 size={10} /> 승인 완료 (전액 무료)
                </span>
                <h4 className="font-black text-white text-base">단국한국어 발음 마스터</h4>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">단국대 맞춤 발음 연습 & 무료 번역 이용</p>
            </div>
          </div>
          <span className="bg-white/20 hover:bg-white/30 px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition">
            학습 시작 →
          </span>
        </div>
      ) : dankookStatus === "pending" ? (
        <div className="bg-blue-50/90 border-2 border-blue-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
              <Clock size={20} className="animate-spin text-blue-600" />
            </div>
            <div>
              <h4 className="font-bold text-blue-900 text-sm">단국대 학생 승인 대기 중 ⏳</h4>
              <p className="text-xs text-blue-700">선생님 확인 후 단국대 전용 코스가 열려요!</p>
            </div>
          </div>
          <span className="text-[11px] font-bold bg-white text-blue-700 border border-blue-300 px-3 py-1 rounded-full shrink-0 shadow-sm">
            확인 중
          </span>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
              🐻
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-sm">단국대학교 학생이신가요?</h4>
              <p className="text-xs text-slate-500">선생님 연결 요청 후 전용 발음 코스 & 번역 무료</p>
            </div>
          </div>
          <button
            onClick={onOpenDankookModal}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow transition"
          >
            학생 인증 →
          </button>
        </div>
      )}

      {/* 코스 선택 */}
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
    </div>
  );
}
