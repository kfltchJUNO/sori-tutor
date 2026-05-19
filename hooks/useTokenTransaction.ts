// hooks/useTokenTransaction.ts
// 이 훅을 통해서만 토큰/하트를 소비합니다. 클라이언트에서 직접 updateDoc 금지.
import { auth } from "@/lib/firebase";

type SpendReason =
  | "발음 분석 (word)"
  | "발음 분석 (sentence)"
  | "발음 분석 (dialogue)"
  | "실전 회화 (1턴)"
  | "회화 피드백 분석"
  | "피드백 번역"
  | "기록 번역"
  | "단어 뜻 검색";

type Currency = "token" | "heart";

export function useTokenTransaction() {
  const getIdToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("로그인 필요");
    return user.getIdToken();
  };

  // 토큰/하트 소비 — 서버에서 잔액 확인 후 차감
  const spendToken = async (
    reason: SpendReason,
    currency: Currency = "token"
  ): Promise<{ success: boolean; remaining?: number; error?: string }> => {
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "spend", reason, currency }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true, remaining: data.remaining };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // 출석 체크 보상 (하루 1회)
  const claimCheckin = async (): Promise<{ success: boolean; earned?: number; error?: string }> => {
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "earn", reason: "출석 체크 보상" }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true, earned: data.earned };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  return { spendToken, claimCheckin };
}