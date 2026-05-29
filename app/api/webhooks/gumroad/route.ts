// app/api/webhooks/gumroad/route.ts
// Gumroad 구매 완료 웹훅 — 토큰 자동 충전
// Gumroad Dashboard → Settings → Advanced → Ping URL 에 등록:
//   https://sori-tutor.vercel.app/api/webhooks/gumroad

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// ── Gumroad 상품 ID → 토큰 수량 매핑 ────────────────────────
// Gumroad 상품 등록 후 실제 permalink로 교체
const PRODUCT_TOKEN_MAP: Record<string, number> = {
  "sori-starter-200":  200,   // $4  → 200 Sori
  "sori-standard-550": 550,   // $8  → 550 Sori
  "sori-premium-1400": 1400,  // $15 → 1,400 Sori
  "sori-ultra-3500":   3500,  // $30 → 3,500 Sori
};

// ── 교재 상품 ID → Step 번호 매핑 ───────────────────────────
const PRODUCT_STEP_MAP: Record<string, number> = {
  "step_korean_1": 1,
  "step_korean_2": 2,
  "step_korean_3": 3,
  "step_korean_4": 4,
  "step_korean_5": 5,
  "step_korean_6": 6,
  "step_korean_7": 7,
  "step_korean_8": 8,
};

export async function POST(req: NextRequest) {
  try {
    // Gumroad는 application/x-www-form-urlencoded로 전송
    const body = await req.text();
    const params = new URLSearchParams(body);

    const sellerEmail   = params.get("seller_id");
    const buyerEmail    = params.get("email");
    const productId     = params.get("product_permalink");
    const licenseKey    = params.get("license_key");
    const refunded      = params.get("refunded") === "true";
    const chargebacked  = params.get("chargebacked") === "true";

    console.log(`📦 Gumroad webhook: product=${productId}, buyer=${buyerEmail}, refunded=${refunded}`);

    // 환불/차지백이면 토큰 회수
    if ((refunded || chargebacked) && buyerEmail) {
      const tokenAmount = productId ? PRODUCT_TOKEN_MAP[productId] : 0;
      if (tokenAmount > 0) {
        await adminDb.collection("sori_users").doc(buyerEmail).update({
          tokens: FieldValue.increment(-tokenAmount),
        });
        await adminDb.collection("sori_users").doc(buyerEmail).collection("token_logs").add({
          type: "spend",
          amount: tokenAmount,
          reason: `환불 처리 (${productId})`,
          date: FieldValue.serverTimestamp(),
        });
        console.log(`↩️ 환불로 ${tokenAmount}토큰 회수: ${buyerEmail}`);
      }
      return NextResponse.json({ success: true, action: "refund_processed" });
    }

    if (!buyerEmail || !productId) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    // ── 토큰 충전 상품 처리 ──────────────────────────────────
    const tokenAmount = PRODUCT_TOKEN_MAP[productId];
    if (tokenAmount) {
      const userRef = adminDb.collection("sori_users").doc(buyerEmail);
      const snap    = await userRef.get();

      if (!snap.exists) {
        // 앱 미가입 구매자 — 대기 상태로 저장 (로그인 시 처리)
        await adminDb.collection("sori_pending_charges").add({
          email: buyerEmail,
          tokenAmount,
          productId,
          licenseKey,
          created_at: FieldValue.serverTimestamp(),
          processed: false,
        });
        console.log(`⏳ 미가입 구매자 대기 등록: ${buyerEmail}`);
        return NextResponse.json({ success: true, action: "pending_registered" });
      }

      await userRef.update({
        tokens: FieldValue.increment(tokenAmount),
      });

      await userRef.collection("token_logs").add({
        type: "earn",
        amount: tokenAmount,
        reason: `토큰 구매 (${productId})`,
        date: FieldValue.serverTimestamp(),
      });

      // 메일함 알림
      await userRef.collection("inbox").add({
        from: "소리튜터 운영진",
        title: `✅ ${tokenAmount}토큰 충전 완료!`,
        content: `Gumroad 결제가 확인되어 ${tokenAmount} Sori가 자동 충전되었습니다.`,
        date: FieldValue.serverTimestamp(),
        read: false,
      });

      console.log(`✅ ${tokenAmount}토큰 충전 완료: ${buyerEmail}`);
      return NextResponse.json({ success: true, action: "tokens_granted", amount: tokenAmount });
    }

    // ── 교재 상품 처리 (라이선스 키 자동 활성화) ────────────
    const stepNumber = PRODUCT_STEP_MAP[productId];
    if (stepNumber) {
      const userRef = adminDb.collection("sori_users").doc(buyerEmail);
      const snap    = await userRef.get();

      if (!snap.exists) {
        // 미가입자 라이선스 대기
        await adminDb.collection("sori_pending_licenses").add({
          email: buyerEmail,
          step: stepNumber,
          licenseKey,
          productId,
          created_at: FieldValue.serverTimestamp(),
          processed: false,
        });
        return NextResponse.json({ success: true, action: "license_pending" });
      }

      await userRef.update({
        purchased_steps: FieldValue.arrayUnion(stepNumber),
      });

      // 라이선스 기록
      if (licenseKey) {
        await adminDb.collection("sori_license_keys").add({
          key: licenseKey,
          email: buyerEmail,
          step: stepNumber,
          productId,
          verified_at: FieldValue.serverTimestamp(),
        });
      }

      await userRef.collection("inbox").add({
        from: "소리튜터 운영진",
        title: `🎉 STEP Korean Step ${stepNumber} 활성화!`,
        content: `Step ${stepNumber} 교재 연동이 완료되었습니다. 심화 커리큘럼을 이용하실 수 있습니다.`,
        date: FieldValue.serverTimestamp(),
        read: false,
      });

      console.log(`✅ Step ${stepNumber} 활성화: ${buyerEmail}`);
      return NextResponse.json({ success: true, action: "step_unlocked", step: stepNumber });
    }

    console.warn(`⚠️ 알 수 없는 상품: ${productId}`);
    return NextResponse.json({ success: true, action: "unknown_product" });

  } catch (error: unknown) {
    console.error("Gumroad webhook error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}