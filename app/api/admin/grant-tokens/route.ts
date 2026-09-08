// app/api/admin/grant-tokens/route.ts
// 관리자가 사용자에게 안전하게 토큰을 지급하는 서버 API

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { targetEmail, amount, reason = "관리자 지급" } = await req.json();

    if (!targetEmail || typeof amount !== "number" || amount === 0) {
      return NextResponse.json({ error: "targetEmail 및 유효한 amount 필수" }, { status: 400 });
    }

    const email = String(targetEmail).toLowerCase().trim();
    const userRef = adminDb.collection("sori_users").doc(email);

    const result = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) throw new Error("대상 사용자를 찾을 수 없습니다.");
      const data = snap.data()!;

      const updateData: Record<string, any> = {
        tokens: FieldValue.increment(amount),
      };
      if (data.role === "guest") updateData.role = "student";

      t.update(userRef, updateData);

      const logRef = adminDb
        .collection("sori_users")
        .doc(email)
        .collection("token_logs")
        .doc();

      t.set(logRef, {
        type: amount > 0 ? "earn" : "spend",
        amount: Math.abs(amount),
        reason,
        grantedBy: auth.email,
        date: FieldValue.serverTimestamp(),
      });

      const inboxRef = adminDb
        .collection("sori_users")
        .doc(email)
        .collection("inbox")
        .doc();

      t.set(inboxRef, {
        from: "소리튜터 운영진",
        title: `🎁 ${amount}토큰이 지급되었습니다!`,
        content: `관리자에 의해 ${amount} Sori가 지급되었습니다. (사유: ${reason})`,
        date: FieldValue.serverTimestamp(),
        read: false,
      });

      return { newBalance: (data.tokens ?? 0) + amount };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error("Admin grant tokens error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
