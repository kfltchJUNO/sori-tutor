// app/api/webhooks/lemonsqueezy/route.ts
// Lemon Squeezy 결제 웹훅 — HMAC 서명 검증 후 토큰 자동 충전 및 권한 승격

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Lemon Squeezy 상품 ID / Variant ID / 명칭 매핑
const TOKEN_PACKAGES: Record<string, number> = {
  "sori-starter-200": 200,
  "sori-standard-550": 550,
  "sori-premium-1400": 1400,
  "sori-ultra-3500": 3500,
};

const STEP_PACKAGES: Record<string, number> = {
  "step_korean_1": 1,
  "step_korean_2": 2,
  "step_korean_3": 3,
  "step_korean_4": 4,
  "step_korean_5": 5,
  "step_korean_6": 6,
  "step_korean_7": 7,
  "step_korean_8": 8,
};

function resolveTokenAmount(identifier: string, productName?: string): number {
  if (TOKEN_PACKAGES[identifier]) return TOKEN_PACKAGES[identifier];
  const combined = `${identifier} ${productName ?? ""}`.toLowerCase();
  if (combined.includes("3500") || combined.includes("ultra")) return 3500;
  if (combined.includes("1400") || combined.includes("premium")) return 1400;
  if (combined.includes("550") || combined.includes("standard")) return 550;
  if (combined.includes("200") || combined.includes("starter")) return 200;
  return 0;
}

function resolveStepNumber(identifier: string, productName?: string): number {
  if (STEP_PACKAGES[identifier]) return STEP_PACKAGES[identifier];
  const combined = `${identifier} ${productName ?? ""}`.toLowerCase();
  const match = combined.match(/step[_\s-]?([1-8])/i);
  if (match) return parseInt(match[1], 10);
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    // 1. 서명 검증
    if (secret) {
      if (!signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      const hmac = crypto.createHmac("sha256", secret);
      const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
      const signatureBuffer = Buffer.from(signature, "utf8");

      if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
        console.error("🚨 Lemon Squeezy webhook signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("⚠️ LEMONSQUEEZY_WEBHOOK_SECRET is not configured. Skipping signature verification in dev.");
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta?.event_name;
    const customData = payload.meta?.custom_data ?? {};
    const attributes = payload.data?.attributes ?? {};

    const buyerEmail: string = (
      customData.user_id ||
      customData.email ||
      attributes.user_email ||
      ""
    ).toLowerCase().trim();

    const orderId = payload.data?.id ?? "";
    const firstItem = attributes.first_order_item;
    const variantId = String(firstItem?.variant_id ?? attributes.variant_id ?? "");
    const productName = firstItem?.product_name ?? attributes.product_name ?? "";
    const licenseKey = attributes.license_key ?? "";

    console.log(`📦 Lemon Squeezy Webhook: event=${eventName}, email=${buyerEmail}, orderId=${orderId}, product=${productName}`);

    if (!buyerEmail) {
      return NextResponse.json({ error: "No buyer email found" }, { status: 400 });
    }

    const userRef = adminDb.collection("sori_users").doc(buyerEmail);

    // 2. 환불 이벤트 처리
    if (eventName === "order_refunded") {
      const refundTokenAmount = resolveTokenAmount(variantId, productName);
      if (refundTokenAmount > 0) {
        const snap = await userRef.get();
        if (snap.exists) {
          await userRef.update({
            tokens: FieldValue.increment(-refundTokenAmount),
          });
          await userRef.collection("token_logs").add({
            type: "spend",
            amount: refundTokenAmount,
            reason: `환불 처리 (${productName || orderId})`,
            date: FieldValue.serverTimestamp(),
          });
          console.log(`↩️ 환불 처리 완료: ${refundTokenAmount}토큰 회수 -> ${buyerEmail}`);
        }
      }
      return NextResponse.json({ success: true, action: "refund_processed" });
    }

    // 3. 결제 완료 이벤트 (order_created)
    if (eventName === "order_created" || eventName === "subscription_created") {
      const tokenAmount = resolveTokenAmount(variantId, productName);
      const stepNumber = resolveStepNumber(variantId, productName);

      const snap = await userRef.get();
      const userExists = snap.exists;

      // (1) 토큰 패키지 구매
      if (tokenAmount > 0) {
        if (!userExists) {
          // 미가입 유저 -> 대기 컬렉션 저장
          await adminDb.collection("sori_pending_charges").add({
            email: buyerEmail,
            tokenAmount,
            productId: variantId || productName,
            licenseKey,
            created_at: FieldValue.serverTimestamp(),
            processed: false,
          });
          console.log(`⏳ 미가입 구매자 대기 등록: ${buyerEmail} (${tokenAmount}토큰)`);
          return NextResponse.json({ success: true, action: "pending_registered" });
        }

        const currentData = snap.data();
        const updateData: Record<string, any> = {
          tokens: FieldValue.increment(tokenAmount),
        };
        // 게스트인 경우 student로 자동 승격
        if (currentData?.role === "guest") {
          updateData.role = "student";
        }

        await userRef.update(updateData);

        await userRef.collection("token_logs").add({
          type: "earn",
          amount: tokenAmount,
          reason: `토큰 구매 (${productName || variantId})`,
          date: FieldValue.serverTimestamp(),
        });

        await userRef.collection("inbox").add({
          from: "소리튜터 운영진",
          title: `✅ ${tokenAmount}토큰 충전 완료!`,
          content: `결제가 확인되어 ${tokenAmount} Sori가 충전되었습니다. 정규 학습자(Student) 혜택을 이용하실 수 있습니다!`,
          date: FieldValue.serverTimestamp(),
          read: false,
        });

        console.log(`✅ ${tokenAmount}토큰 충전 및 role 업데이트 완료: ${buyerEmail}`);
        return NextResponse.json({ success: true, action: "tokens_granted", amount: tokenAmount });
      }

      // (2) STEP 교재 구매
      if (stepNumber > 0) {
        if (!userExists) {
          await adminDb.collection("sori_pending_licenses").add({
            email: buyerEmail,
            step: stepNumber,
            licenseKey,
            productId: variantId || productName,
            created_at: FieldValue.serverTimestamp(),
            processed: false,
          });
          return NextResponse.json({ success: true, action: "license_pending" });
        }

        const currentData = snap.data();
        const updateData: Record<string, any> = {
          purchased_steps: FieldValue.arrayUnion(stepNumber),
        };
        if (currentData?.role === "guest") {
          updateData.role = "student";
        }

        await userRef.update(updateData);

        if (licenseKey) {
          await adminDb.collection("sori_license_keys").add({
            key: licenseKey,
            email: buyerEmail,
            step: stepNumber,
            productId: variantId || productName,
            verified_at: FieldValue.serverTimestamp(),
          });
        }

        await userRef.collection("inbox").add({
          from: "소리튜터 운영진",
          title: `🎉 STEP Korean Step ${stepNumber} 활성화!`,
          content: `Step ${stepNumber} 교재 연동이 완료되었습니다. 앱에서 전용 심화 커리큘럼을 이용하실 수 있습니다.`,
          date: FieldValue.serverTimestamp(),
          read: false,
        });

        console.log(`✅ Step ${stepNumber} 활성화 완료: ${buyerEmail}`);
        return NextResponse.json({ success: true, action: "step_unlocked", step: stepNumber });
      }
    }

    return NextResponse.json({ success: true, action: "ignored_event" });
  } catch (error: any) {
    console.error("Lemon Squeezy Webhook Error:", error);
    return NextResponse.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }
}
