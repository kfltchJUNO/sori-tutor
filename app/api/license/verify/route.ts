// app/api/license/verify/route.ts
// Gumroad 라이선스 키 검증 → purchased_steps 업데이트

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Gumroad 상품 ID 목록 (준호님 Gumroad 등록 후 실제 값으로 교체)
const GUMROAD_PRODUCTS: Record<number, string> = {
  1: "GUMROAD_PRODUCT_ID_STEP1",
  2: "GUMROAD_PRODUCT_ID_STEP2",
  3: "GUMROAD_PRODUCT_ID_STEP3",
  4: "GUMROAD_PRODUCT_ID_STEP4",
  5: "GUMROAD_PRODUCT_ID_STEP5",
  6: "GUMROAD_PRODUCT_ID_STEP6",
  7: "GUMROAD_PRODUCT_ID_STEP7",
  8: "GUMROAD_PRODUCT_ID_STEP8",
};

export async function POST(req: NextRequest) {
  // 1. 사용자 인증
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }
  let userEmail: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
    userEmail = decoded.email!;
  } catch {
    return NextResponse.json({ error: "토큰 검증 실패" }, { status: 401 });
  }

  const { licenseKey, step } = await req.json();

  if (!licenseKey || !step || !GUMROAD_PRODUCTS[step]) {
    return NextResponse.json({ error: "licenseKey 또는 step 누락" }, { status: 400 });
  }

  const productId = GUMROAD_PRODUCTS[step];

  // 2. 이미 사용된 키 체크
  const existingSnap = await adminDb
    .collection("sori_license_keys")
    .where("key", "==", licenseKey)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0].data();
    // 동일 사용자가 재입력하는 경우는 허용
    if (existing.email !== userEmail) {
      return NextResponse.json({ error: "이미 사용된 라이선스 키입니다." }, { status: 400 });
    }
    // 이미 본인이 이 키를 사용했으면 그냥 성공 처리
    return NextResponse.json({ success: true, step, alreadyOwned: true });
  }

  // 3. Gumroad API 검증
  try {
    const gumRes = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        product_id: productId,
        license_key: licenseKey,
        increment_uses_count: "true",
      }),
    });

    const gumData = await gumRes.json();

    if (!gumData.success) {
      return NextResponse.json({ error: "유효하지 않은 라이선스 키입니다." }, { status: 400 });
    }

    // 4. 검증 성공 → Firestore 업데이트
    const userRef = adminDb.collection("sori_users").doc(userEmail);
    await userRef.update({
      purchased_steps: FieldValue.arrayUnion(step),
    });

    // 5. 사용 기록 저장
    await adminDb.collection("sori_license_keys").add({
      key: licenseKey,
      email: userEmail,
      step,
      productId,
      verified_at: FieldValue.serverTimestamp(),
    });

    // 6. 환영 메시지 전송
    await adminDb
      .collection("sori_users")
      .doc(userEmail)
      .collection("inbox")
      .add({
        from: "소리튜터 운영진",
        title: `🎉 STEP Korean Step ${step} 활성화!`,
        content: `Step ${step} 교재 연동이 완료되었습니다.\n앱에서 Step ${step} 전용 심화 커리큘럼을 이용하실 수 있습니다.`,
        date: FieldValue.serverTimestamp(),
        read: false,
      });

    return NextResponse.json({ success: true, step });
  } catch (e: any) {
    console.error("Gumroad verify error:", e);
    return NextResponse.json({ error: "검증 서버 오류" }, { status: 500 });
  }
}