"use client";
// components/views/HomeView.tsx
import { Mic, Star, MessageSquare, MessageCircle, Trophy, ChevronLeft } from "lucide-react";
import type { SoriUser, CourseType } from "@/types";

interface Props {
  user: SoriUser;
  onSelectCourse: (type: CourseType) => void;
  onEnterFreeTalking: () => void;
  onFetchRanking: () => void;
  onFetchHistory: () => void;
  onOpenNickname: () => void;
}

export default function HomeView({
  user,
  onSelectCourse,
  onEnterFreeTalking,
  onFetchRanking,
  onFetchHistory,
  onOpenNickname,
}: Props) {
  const COURSES = [
    { id: "word" as CourseType, t: "단어 발음 연습", d: "기초 어휘 마스터", icon: <Mic />, color: "blue" },
    { id: "sentence" as CourseType, t: "문장 억양 연습", d: "자연스러운 억양 익히기", icon: <Star />, color: "indigo" },
    { id: "dialogue" as CourseType, t: "실전 회화", d: "AI와 역할극 대화", icon: <MessageSquare />, color: "purple" },
  ];

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
      {/* 유저 상태 카드 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-800 text-lg">{user.alias || user.name}님</h3>
            <button
              onClick={onOpenNickname}
              className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50"
            >
              변경
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-1">
            일일 목표{" "}
            <span className="font-bold text-orange-500">{Math.min(user.today_count, 5)}/5</span>
          </p>
          <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${Math.min((user.today_count / 5) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="text-center bg-orange-50 px-4 py-3 rounded-xl min-w-[80px]">
          <p className="text-2xl font-black text-orange-500 mb-1">
            {user.streak}{" "}
            <span className="text-sm font-bold text-orange-400">일</span>
          </p>
          <p className="text-[10px] text-orange-700 font-bold">연속 학습중</p>
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="flex gap-2">
        <button
          onClick={onFetchRanking}
          className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-2 rounded-full font-bold text-sm hover:bg-yellow-100 transition"
        >
          <Trophy size={14} /> 랭킹
        </button>
        <button
          onClick={onFetchHistory}
          className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-2 rounded-full font-bold text-sm hover:bg-slate-200 transition"
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
            className={`w-full p-5 rounded-2xl text-left bg-white shadow-sm border border-slate-100 
              hover:border-${item.color}-500 hover:bg-${item.color}-50 transition group flex items-center gap-4`}
          >
            <div
              className={`w-12 h-12 rounded-full bg-${item.color}-100 text-${item.color}-600 
                flex items-center justify-center group-hover:scale-110 transition-transform`}
            >
              {item.icon}
            </div>
            <div>
              <div className={`text-lg font-bold text-slate-800 group-hover:text-${item.color}-700`}>
                {item.t}
              </div>
              <div className="text-sm text-slate-500">{item.d}</div>
            </div>
          </button>
        ))}

        <button
          onClick={onEnterFreeTalking}
          className="w-full p-5 rounded-2xl text-left bg-gradient-to-r from-green-50 to-emerald-50 
            shadow-sm border border-green-100 hover:border-green-500 transition group flex items-center gap-4 relative overflow-hidden"
        >
          <div className="absolute top-3 right-3 bg-white/80 backdrop-blur px-2 py-1 rounded-full text-[10px] font-bold text-green-700 border border-green-200">
            🪙 토큰 2개 / 턴
          </div>
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <MessageCircle />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800">한국어 자유 회화 (Beta)</div>
            <div className="text-sm text-slate-500">AI와 자유 대화</div>
          </div>
        </button>
      </div>
    </div>
  );
}