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
  "문법 설명 요청",
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
  "문법 설명 요청":       1,  // 히스토리 문법 분석 — 1 Sori
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
  const email = decoded.email.toLowerCase();

  const body = await req.json();
  const { action, reason, currency } = body;
  // currency: 'token' | 'heart'

  // ── 1) 토큰/하트 차감 ──
  if (action === "spend") {
    if (!ALLOWED_SPEND_REASONS.includes(reason as any)) {
      return NextResponse.json({ error: "허용되지 않는 reason" }, { status: 400 });
    }

    const cost = COSTS[reason];
    if (cost === undefined) return NextResponse.json({ error: "비용 정보 없음" }, { status: 400 });

    const userRef = adminDb.collection("sori_users").doc(email);

    try {
      const result = await adminDb.runTransaction(async (t) => {
        const snap = await t.get(userRef);
        if (!snap.exists) throw new Error("사용자 없음");
        const data = snap.data()!;

        if (currency === "heart") {
          if ((data.free_hearts ?? 0) < 1) throw new Error("하트 부족");
          t.update(userRef, { free_hearts: FieldValue.increment(-1) });
          return { remaining: (data.free_hearts ?? 0) - 1, currency: "heart" };
        } else {
          // 무료 기능 (cost === 0)
          if (cost === 0) return { remaining: data.tokens ?? 0, currency: "token" };
          if ((data.tokens ?? 0) < cost) throw new Error("소리가 부족합니다.");

          const updateFields: Record<string, any> = {
            tokens: FieldValue.increment(-cost),
            points: FieldValue.increment(2),
          };
          // 게스트가 토큰을 보유하고 쓰는 경우 student로 승격
          if (data.role === "guest") {
            updateFields.role = "student";
          }

          t.update(userRef, updateFields);

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

          return { remaining: (data.tokens ?? 0) - cost, currency: "token" };
        }
      });

      return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  // ── 2) 토큰 적립 ──
  if (action === "earn") {
    if (!ALLOWED_EARN_REASONS.includes(reason as any)) {
      return NextResponse.json({ error: "허용되지 않는 earn reason" }, { status: 400 });
    }

    const userRef = adminDb.collection("sori_users").doc(email);

    // 출석 체크: 하루 1회 원자적 검증 (runTransaction)
    if (reason === "출석 체크 보상") {
      const today = new Date().toDateString();

      try {
        const result = await adminDb.runTransaction(async (t) => {
          const snap = await t.get(userRef);
          if (!snap.exists) throw new Error("사용자 없음");
          const data = snap.data()!;

          if (data.last_checkin_date === today) {
            throw new Error("오늘 이미 출석 체크했습니다.");
          }

          t.update(userRef, {
            tokens: FieldValue.increment(1),
            last_checkin_date: today,
          });

          const logRef = adminDb
            .collection("sori_users")
            .doc(email)
            .collection("token_logs")
            .doc();

          t.set(logRef, {
            type: "earn",
            amount: 1,
            reason: "출석 체크 보상",
            date: FieldValue.serverTimestamp(),
          });

          return { earned: 1, remaining: (data.tokens ?? 0) + 1 };
        });

        return NextResponse.json({ success: true, ...result });
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    // 7일 연속 학습 보상 (15토큰)
    if (reason === "7일 연속 학습 보상") {
      try {
        const result = await adminDb.runTransaction(async (t) => {
          const snap = await t.get(userRef);
          if (!snap.exists) throw new Error("사용자 없음");
          const data = snap.data()!;

          t.update(userRef, {
            tokens: FieldValue.increment(15),
          });

          const logRef = adminDb
            .collection("sori_users")
            .doc(email)
            .collection("token_logs")
            .doc();

          t.set(logRef, {
            type: "earn",
            amount: 15,
            reason: "7일 연속 학습 보상",
            date: FieldValue.serverTimestamp(),
          });

          const inboxRef = adminDb
            .collection("sori_users")
            .doc(email)
            .collection("inbox")
            .doc();

          t.set(inboxRef, {
            from: "소리튜터 운영진",
            title: "🏆 7일 연속 학습 달성 보상!",
            content: "축하합니다! 👏 7일 연속 학습을 완수하여 15토큰이 지급되었습니다.",
            date: FieldValue.serverTimestamp(),
            read: false,
          });

          return { earned: 15, remaining: (data.tokens ?? 0) + 15 };
        });

        return NextResponse.json({ success: true, ...result });
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "처리 불가" }, { status: 400 });
  }

  // ── 3) 미가입 시 결제된 대기 내역 서버 처리 (클라이언트 직접 조작 제거) ──
  if (action === "process_pending") {
    const userRef = adminDb.collection("sori_users").doc(email);
    let totalTokens = 0;
    const unlockedSteps: number[] = [];

    try {
      // (1) 대기 토큰 확인
      const tokenSnap = await adminDb
        .collection("sori_pending_charges")
        .where("email", "==", email)
        .where("processed", "==", false)
        .get();

      if (!tokenSnap.empty) {
        for (const d of tokenSnap.docs) {
          const amt = d.data().tokenAmount ?? 0;
          totalTokens += amt;
          await d.ref.update({ processed: true });
        }
      }

      // (2) 대기 라이선스 확인
      const licenseSnap = await adminDb
        .collection("sori_pending_licenses")
        .where("email", "==", email)
        .where("processed", "==", false)
        .get();

      if (!licenseSnap.empty) {
        for (const d of licenseSnap.docs) {
          const step = d.data().step;
          if (step) unlockedSteps.push(step);
          await d.ref.update({ processed: true });
        }
      }

      if (totalTokens > 0 || unlockedSteps.length > 0) {
        const updatePayload: Record<string, any> = { role: "student" };
        if (totalTokens > 0) updatePayload.tokens = FieldValue.increment(totalTokens);
        if (unlockedSteps.length > 0) updatePayload.purchased_steps = FieldValue.arrayUnion(...unlockedSteps);

        await userRef.update(updatePayload);

        if (totalTokens > 0) {
          await userRef.collection("token_logs").add({
            type: "earn",
            amount: totalTokens,
            reason: "결제 대기 토큰 충전",
            date: FieldValue.serverTimestamp(),
          });
        }
      }

      return NextResponse.json({
        success: true,
        chargedTokens: totalTokens,
        unlockedSteps,
      });
    } catch (e: any) {
      console.error("Process pending error:", e);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "잘못된 action" }, { status: 400 });
}