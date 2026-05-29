// app/api/token/route.ts
// 토큰/하트 차감·지급을 서버에서 처리 (클라이언트 직접 조작 차단)
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// 허용된 reason 목록 (화이트리스트)
const ALLOWED_SPEND_REASONS = [
  "발음 분석 (word)",
  "발음 분석 (sentence)",
  "발음 분석 (dialogue)",
  "실전 회화 (1턴)",
  "회화 피드백 분석",
  "피드백 번역",
  "기록 번역",
  "단어 뜻 검색",
] as const;

const ALLOWED_EARN_REASONS = [
  "7일 연속 학습 보상",
  "출석 체크 보상",
  "관리자 지급",
] as const;

// 액션별 고정 비용 (서버에서 결정, 클라이언트 값 무시)
const COSTS: Record<string, number> = {
  "발음 분석 (word)":     1,  // 단어 발음 — 1 Sori
  "발음 분석 (sentence)": 1,  // 문장 발음 — 1 Sori
  "발음 분석 (dialogue)": 1,  // 담화 발음 — 1 Sori
  "실전 회화 (1턴)":      2,  // 자유회화 1턴 — 2 Sori
  "회화 피드백 분석":     3,  // 피드백 리포트 — 3 Sori
  "피드백 번역":          1,  // 번역 — 1 Sori
  "기록 번역":            1,  // 번역 — 1 Sori
  "단어 뜻 검색":         0,  // 무료
};

// Firebase ID Token 검증 헬퍼
async function verifyToken(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // 1. 인증 검증
  const decoded = await verifyToken(req);
  if (!decoded?.email) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  const email = decoded.email;

  const { action, reason, currency } = await req.json();
  // currency: 'token' | 'heart'

  if (action === "spend") {
    // 2. reason 화이트리스트 검사
    if (!ALLOWED_SPEND_REASONS.includes(reason as any)) {
      return NextResponse.json({ error: "허용되지 않는 reason" }, { status: 400 });
    }

    const cost = COSTS[reason];
    if (cost === undefined) return NextResponse.json({ error: "비용 정보 없음" }, { status: 400 });

    const userRef = adminDb.collection("sori_users").doc(email);

    // 3. Firestore Transaction으로 잔액 확인 후 차감 (원자적 처리)
    try {
      const result = await adminDb.runTransaction(async (t) => {
        const snap = await t.get(userRef);
        if (!snap.exists) throw new Error("사용자 없음");
        const data = snap.data()!;

        if (currency === "heart") {
          if ((data.free_hearts ?? 0) < 1) throw new Error("하트 부족");
          t.update(userRef, { free_hearts: FieldValue.increment(-1) });
          return { remaining: (data.free_hearts ?? 0) - 1 };
        } else {
          // 무료 기능 (cost === 0)
        if (cost === 0) return { remaining: data.tokens ?? 0 };
        if ((data.tokens ?? 0) < cost) throw new Error("소리가 부족합니다.");
          t.update(userRef, {
            tokens: FieldValue.increment(-cost),
            points: FieldValue.increment(currency === "heart" ? 0 : 2),
          });
          // 토큰 로그 기록
          const logRef = adminDb
            .collection("sori_users")
            .doc(email)
            .collection("token_logs")
            .doc();
          t.set(logRef, {
            type: "spend",
            amount: cost,
            reason,
            date: FieldValue.serverTimestamp(),
          });
          return { remaining: (data.tokens ?? 0) - cost };
        }
      });

      return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  if (action === "earn") {
    if (!ALLOWED_EARN_REASONS.includes(reason as any)) {
      return NextResponse.json({ error: "허용되지 않는 earn reason" }, { status: 400 });
    }

    // 출석 체크: 하루 1회 제한
    if (reason === "출석 체크 보상") {
      const userRef = adminDb.collection("sori_users").doc(email);
      const snap = await userRef.get();
      const data = snap.data();
      const today = new Date().toDateString();

      if (data?.last_checkin_date === today) {
        return NextResponse.json({ error: "오늘 이미 출석 체크했습니다." }, { status: 400 });
      }

      await userRef.update({
        tokens: FieldValue.increment(1),
        last_checkin_date: today,
      });

      // 토큰 로그
      await adminDb
        .collection("sori_users")
        .doc(email)
        .collection("token_logs")
        .doc()
        .set({
          type: "earn",
          amount: 1,
          reason: "출석 체크 보상",
          date: FieldValue.serverTimestamp(),
        });

      return NextResponse.json({ success: true, earned: 1 });
    }

    return NextResponse.json({ error: "처리 불가" }, { status: 400 });
  }

  return NextResponse.json({ error: "잘못된 action" }, { status: 400 });
}