"use client";
// components/views/HomeView.tsx
import { Mic, Star, MessageSquare, MessageCircle, Trophy } from "lucide-react";
import type { SoriUser, CourseType } from "@/types";

interface Props {
  user: SoriUser;
  onSelectCourse: (type: CourseType) => void;
  onEnterFreeTalking: () => void;
  onFetchRanking: () => void;
  onFetchHistory: () => void;
  onOpenNickname: () => void;
}

// Tailwind 동적 클래스 문제 방지 — 정적 클래스로 정의
const COURSES = [
  {
    id: "word" as CourseType,
    t: "단어 발음 연습", d: "기초 어휘 마스터",
    icon: <Mic size={22} />,
    iconBg: "bg-blue-100", iconText: "text-blue-600",
    hoverBorder: "hover:border-blue-400", hoverBg: "hover:bg-blue-50",
    hoverText: "group-hover:text-blue-700",
  },
  {
    id: "sentence" as CourseType,
    t: "문장 억양 연습", d: "자연스러운 억양 익히기",
    icon: <Star size={22} />,
    iconBg: "bg-indigo-100", iconText: "text-indigo-600",
    hoverBorder: "hover:border-indigo-400", hoverBg: "hover:bg-indigo-50",
    hoverText: "group-hover:text-indigo-700",
  },
  {
    id: "dialogue" as CourseType,
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
}: Props) {
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
          <div className="absolute top-2.5 right-3 bg-white/90 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 border border-emerald-200">
            🪙 2토큰 / 턴
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