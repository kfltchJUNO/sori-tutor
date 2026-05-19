// lib/adminAuth.ts
// API Route에서 관리자 검증에 사용하는 헬퍼
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";

export async function requireAdmin(req: NextRequest): Promise<
  | { email: string; error?: never }
  | { email?: never; error: NextResponse }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "인증 헤더 없음" }, { status: 401 }),
    };
  }

  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email;
    if (!email) throw new Error("이메일 없음");

    // Firestore에서 role 확인 (하드코딩 이메일 비교 X)
    const userSnap = await adminDb.collection("sori_users").doc(email).get();
    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      return {
        error: NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 }),
      };
    }

    return { email };
  } catch (e: any) {
    return {
      error: NextResponse.json({ error: "토큰 검증 실패" }, { status: 401 }),
    };
  }
}