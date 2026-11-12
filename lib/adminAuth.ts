// lib/adminAuth.ts
// API Route에서 관리자/선생님 권한 검증에 사용하는 헬퍼
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";

// 영구 슈퍼관리자 세이프가드 (어떤 경우에도 권한이 차단되지 않음)
const SUPER_ADMINS = ["ot.helper7@gmail.com"];

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

    // 영구 슈퍼관리자 우선 패스
    if (SUPER_ADMINS.includes(email)) {
      return { email };
    }

    // Firestore에서 role 또는 isAdmin 확인
    const userSnap = await adminDb.collection("sori_users").doc(email).get();
    const data = userSnap.data();
    const isAdmin = data?.role === "admin" || data?.isAdmin === true;

    if (!userSnap.exists || !isAdmin) {
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

export async function requireTeacherOrAdmin(req: NextRequest): Promise<
  | { email: string; isSuperAdmin: boolean; role: "admin" | "teacher"; error?: never }
  | { email?: never; isSuperAdmin?: never; role?: never; error: NextResponse }
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

    if (SUPER_ADMINS.includes(email)) {
      return { email, isSuperAdmin: true, role: "admin" };
    }

    const userSnap = await adminDb.collection("sori_users").doc(email).get();
    const data = userSnap.data();
    const isAdmin = data?.role === "admin" || data?.isAdmin === true;
    const isTeacher = data?.role === "teacher" || data?.isTeacher === true;

    if (!userSnap.exists || (!isAdmin && !isTeacher)) {
      return {
        error: NextResponse.json({ error: "선생님 또는 관리자 권한이 필요합니다." }, { status: 403 }),
      };
    }

    return { email, isSuperAdmin: isAdmin, role: isAdmin ? "admin" : "teacher" };
  } catch (e: any) {
    return {
      error: NextResponse.json({ error: "토큰 검증 실패" }, { status: 401 }),
    };
  }
}