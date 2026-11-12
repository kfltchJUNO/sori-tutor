// app/api/admin/teachers/route.ts
// 관리자 전용: 선생님(Teacher) 등록, 조회, 삭제 API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface TeacherData {
  email: string;
  name: string;
  institution: string;
  phone?: string;
  memo?: string;
  assignedClassIds?: string[];
  createdAtMs: number;
}

// 1. 선생님 목록 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb.collection("sori_teachers").orderBy("createdAt", "desc").get();
    const teachers: TeacherData[] = snap.docs.map(doc => {
      const d = doc.data();
      return {
        email: doc.id,
        name: d.name || "",
        institution: d.institution || "",
        phone: d.phone || "",
        memo: d.memo || "",
        assignedClassIds: Array.isArray(d.assignedClassIds) ? d.assignedClassIds : [],
        createdAtMs: d.createdAt?.toMillis?.() ?? (d.createdAt?._seconds ? d.createdAt._seconds * 1000 : Date.now()),
      };
    });

    return NextResponse.json({ teachers });
  } catch (e: any) {
    console.error("선생님 목록 조회 실패:", e);
    return NextResponse.json({ error: e.message || "선생님 조회 실패" }, { status: 500 });
  }
}

// 2. 신규 선생님 등록
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const name = (body.name || "").trim();
    const institution = (body.institution || "").trim();
    const phone = (body.phone || "").trim();
    const memo = (body.memo || "").trim();

    if (!email || !name) {
      return NextResponse.json({ error: "선생님 이메일과 이름을 입력하세요." }, { status: 400 });
    }

    // 1) sori_teachers 컬렉션에 등록
    await adminDb.collection("sori_teachers").doc(email).set(
      {
        email,
        name,
        institution,
        phone,
        memo,
        role: "teacher",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // 2) sori_users 에도 role: "teacher" 동기화 (기존 유저 정보 보존)
    await adminDb.collection("sori_users").doc(email).set(
      {
        email,
        name,
        institution,
        role: "teacher",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, email });
  } catch (e: any) {
    console.error("선생님 등록 실패:", e);
    return NextResponse.json({ error: e.message || "선생님 등록 실패" }, { status: 500 });
  }
}

// 3. 선생님 삭제 (권한 해제)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "삭제할 선생님 이메일이 필요합니다." }, { status: 400 });
    }

    // sori_teachers에서 삭제
    await adminDb.collection("sori_teachers").doc(email).delete();

    // sori_users에서 role을 teacher -> user 로 강등
    const userRef = adminDb.collection("sori_users").doc(email);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.role === "teacher") {
      await userRef.update({ role: "user", updatedAt: new Date() });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("선생님 삭제 실패:", e);
    return NextResponse.json({ error: e.message || "선생님 삭제 실패" }, { status: 500 });
  }
}
