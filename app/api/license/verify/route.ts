// app/api/license/verify/route.ts
// Lemon Squeezy 라이선스 키 검증 → purchased_steps 업데이트 및 student 승격

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

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

  if (!licenseKey || !step) {
    return NextResponse.json({ error: "licenseKey 또는 step 누락" }, { status: 400 });
  }

  const cleanKey = String(licenseKey).trim();
  const stepNum = Number(step);

  // 2. 이미 사용된 키 체크
  const existingSnap = await adminDb
    .collection("sori_license_keys")
    .where("key", "==", cleanKey)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0].data();
    if (existing.email !== userEmail) {
      return NextResponse.json({ error: "이미 다른 계정에서 사용된 라이선스 키입니다." }, { status: 400 });
    }
    return NextResponse.json({ success: true, step: stepNum, alreadyOwned: true });
  }

  // 3. Lemon Squeezy 라이선스 검증 API 호출
  try {
    let isValid = false;

    if (process.env.LEMONSQUEEZY_API_KEY) {
      const lsRes = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          license_key: cleanKey,
        }),
      });

      const lsData = await lsRes.json();
      if (lsData.valid) {
        isValid = true;
      } else {
        return NextResponse.json({ error: lsData.error || "유효하지 않거나 만료된 라이선스 키입니다." }, { status: 400 });
      }
    } else {
      // 개발 환경 미등록 키 폴백: 형식 검사
      if (cleanKey.length >= 8) {
        isValid = true;
      } else {
        return NextResponse.json({ error: "라이선스 키 형식이 올바르지 않습니다." }, { status: 400 });
      }
    }

    if (!isValid) {
      return NextResponse.json({ error: "라이선스 검증에 실패했습니다." }, { status: 400 });
    }

    // 4. Firestore 업데이트 (purchased_steps 추가 및 guest -> student 승격)
    const userRef = adminDb.collection("sori_users").doc(userEmail);
    const userSnap = await userRef.get();
    const updatePayload: Record<string, any> = {
      purchased_steps: FieldValue.arrayUnion(stepNum),
    };
    if (userSnap.exists && userSnap.data()?.role === "guest") {
      updatePayload.role = "student";
    }

    await userRef.update(updatePayload);

    // 5. 사용 기록 저장
    await adminDb.collection("sori_license_keys").add({
      key: cleanKey,
      email: userEmail,
      step: stepNum,
      provider: "lemonsqueezy",
      verified_at: FieldValue.serverTimestamp(),
    });

    // 6. 환영 메시지 전송
    await adminDb
      .collection("sori_users")
      .doc(userEmail)
      .collection("inbox")
      .add({
        from: "소리튜터 운영진",
        title: `🎉 STEP Korean Step ${stepNum} 활성화!`,
        content: `Step ${stepNum} 교재 연동이 완료되었습니다.\n앱에서 Step ${stepNum} 전용 심화 커리큘럼을 이용하실 수 있습니다.`,
        date: FieldValue.serverTimestamp(),
        read: false,
      });

    return NextResponse.json({ success: true, step: stepNum });
  } catch (e: any) {
    console.error("License verify error:", e);
    return NextResponse.json({ error: "검증 서버 오류: " + (e.message || "") }, { status: 500 });
  }
}