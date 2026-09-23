"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase"; 
import { ChevronDown, ChevronUp, Mic, BookOpen, Loader2 } from "lucide-react";
import { useTokenTransaction } from "@/hooks/useTokenTransaction";
import SoriIcon from "@/app/components/SoriIcon";

interface HistoryItemProps {
  item: any;
  userEmail: string;
  userRole: string;
}

export default function HistoryItem({ item, userEmail, userRole }: HistoryItemProps) {
  const { spendToken } = useTokenTransaction();
  // DB에 저장된 설명이 있으면 초기값으로 사용 (캐싱 효과)
  // item.grammarExplanation 혹은 item.explanation 등 DB 필드명에 맞춰 유연하게 처리
  const [explanation, setExplanation] = useState<string | null>(item.explanation || item.grammarExplanation || null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- 1. 시각적 비교 로직 (Diff View) ---
  const renderDiff = () => {
    // 인식된 텍스트가 없으면(옛날 데이터 등) 기본 표시
    if (!item.recognizedText) {
      return <p className="text-xl font-black text-gray-900 mb-2">"{item.text}"</p>;
    }

    const targetWords = item.text.split(" ");
    const recognizedWords = item.recognizedText.split(" ");

    return (
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
        <div className="mb-2">
          <span className="text-xs text-slate-500 font-bold block mb-1">목표 문장</span>
          <div className="flex flex-wrap gap-1.5">
            {targetWords.map((word: string, i: number) => {
              const recWord = recognizedWords[i] || "";
              // 간단한 비교 로직 (특수문자 제거 후 비교)
              const isMatch = word.replace(/[.,?!]/g, "") === recWord.replace(/[.,?!]/g, "");
              
              return (
                <span key={i} className={isMatch ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                  {word}
                </span>
              );
            })}
          </div>
        </div>
        
        <div className="border-t border-slate-200 pt-2 mt-2">
          <span className="text-xs text-slate-500 font-bold block mb-1">AI가 들은 말</span>
          <div className="text-md text-slate-700">
            {recognizedWords.map((word: string, i: number) => {
               const targetWord = targetWords[i] || "";
               const isMatch = targetWord.replace(/[.,?!]/g, "") === word.replace(/[.,?!]/g, "");
               return (
                 <span key={i} className={`mr-1.5 ${isMatch ? 'text-green-600' : 'text-red-500 decoration-wavy underline'}`}>
                   {word}
                 </span>
               )
            })}
             {/* 문장이 너무 짧게 인식된 경우 표시 */}
             {recognizedWords.length < targetWords.length && (
               <span className="text-xs text-gray-400 ml-1">(...중단됨)</span>
             )}
          </div>
        </div>
      </div>
    );
  };

  // --- 2. 문법 설명 요청 (Lazy Loading + DB Save) ---
  const handleExplain = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // 이미 데이터가 있으면 API 호출 안 함 (비용 절약)
    if (explanation) {
      setIsOpen(true);
      return;
    }

    // 권한/재화 체크
    if (userRole === 'guest' || userRole === 'student') {
        const costMsg = userRole === 'guest' ? "하트 1개" : "1 소리";
        if (!confirm(`문법 설명을 보시겠습니까? (${costMsg} 차감)`)) return;
    }

    setIsOpen(true);
    setIsLoading(true);

    try {
      // 1. API 호출
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text, type: item.type }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "분석 실패");

      // 2. 서버 트랜잭션을 통한 재화 차감
      const currency = userRole === "guest" ? "heart" : "token";
      const spendRes = await spendToken("문법 설명 요청", currency);
      if (!spendRes.success) {
        throw new Error(spendRes.error || "재화 차감에 실패했습니다.");
      }

      // 3. 상태 업데이트 및 히스토리에 설명 저장
      setExplanation(data.explanation);

      const historyRef = doc(db, "sori_users", userEmail, "history", item.id);
      await updateDoc(historyRef, {
        explanation: data.explanation
      });

    } catch (error: any) {
      console.error(error);
      setExplanation("설명을 불러오는 중 오류가 발생했습니다: " + (error.message || ""));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-4 hover:shadow-md transition-shadow">
      {/* 상단 정보 */}
      <div className="flex justify-between items-center mb-3">
        <span className={`text-xs font-bold px-2 py-1 rounded border ${
          item.type === 'word' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
          : item.type === 'sentence' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
          : 'bg-purple-50 text-purple-700 border-purple-200'
        }`}>
          {item.type === 'word' ? '단어' : item.type === 'sentence' ? '문장' : '담화'} 
          {item.category && ` / ${item.category}`}
        </span>
        <span className="text-xs text-gray-400">
          {item.date?.toDate ? item.date.toDate().toLocaleDateString() : "날짜 없음"}
        </span>
      </div>

      {/* 비교 뷰 렌더링 */}
      {renderDiff()}

      {/* 발음 점수 및 피드백 */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center gap-2">
            <span className={`text-2xl font-black ${Number(item.score) >= 80 ? 'text-green-600' : 'text-orange-500'}`}>
                {item.score}점
            </span>
            <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${Number(item.score) >= 80 ? 'bg-green-500' : 'bg-orange-400'}`} 
                    style={{ width: `${item.score}%` }}
                ></div>
            </div>
        </div>
        <div className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg">
            <Mic className="text-gray-400 mt-0.5 flex-shrink-0" size={16} />
            <p className="text-sm text-gray-800 font-medium leading-relaxed">{item.feedback}</p>
        </div>
      </div>

      {/* 문법 설명 버튼 (단어 학습 제외) */}
      {item.type !== 'word' && (
        <div className="border-t border-gray-100 pt-3 mt-2">
          <button 
            onClick={handleExplain} 
            className="w-full flex justify-between items-center text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors py-2 group"
          >
            <div className="flex items-center gap-1.5">
              <BookOpen size={14} className="group-hover:scale-110 transition-transform"/>
              <span className="flex items-center gap-1">
                {explanation ? (
                  "문법 설명 및 문장 분석 보기"
                ) : (
                  <>
                    문장 분석 요청하기 (
                    {userRole === 'guest' ? (
                      "❤️ -1"
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        <SoriIcon size={12} /> -1
                      </span>
                    )}
                    )
                  </>
                )}
              </span>
            </div>
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {isOpen && (
            <div className="mt-3 bg-blue-50 p-4 rounded-xl text-sm text-blue-900 border border-blue-100 animate-in fade-in slide-in-from-top-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-2 text-blue-600">
                    <Loader2 className="animate-spin" size={18} />
                    <span>AI 튜터가 문장을 분석 중입니다...</span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed font-medium">
                  {explanation}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}