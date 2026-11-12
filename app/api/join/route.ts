// app/api/join/route.ts
// 학생이 초대 코드(?code=XXXXXX)로 반에 가입/배속되는 API
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

// 1. 초대 코드로 반 정보 조회 (미리보기)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "초대 코드를 입력하세요." }, { status: 400 });
    }

    const snap = await adminDb.collection("sori_classes").where("inviteCode", "==", code).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ error: "유효하지 않거나 만료된 초대 코드입니다." }, { status: 404 });
    }

    const doc = snap.docs[0];
    const d = doc.data();

    return NextResponse.json({
      classId: doc.id,
      name: d.name,
      institution: d.institution,
      level: d.level,
      teacherName: d.teacherName,
    });
  } catch (e: any) {
    console.error("초대 코드 조회 실패:", e);
    return NextResponse.json({ error: e.message || "조회 실패" }, { status: 500 });
  }
}

// 2. 학생 가입 확정 (Firebase 토큰 인증 필수)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email;
    if (!email) throw new Error("이메일 정보가 없습니다.");

    const body = await req.json();
    const code = (body.code || "").trim().toUpperCase();
    const studentId = (body.studentId || "").trim();
    const studentName = (body.name || decoded.name || "").trim();

    if (!code) {
      return NextResponse.json({ error: "초대 코드가 필요합니다." }, { status: 400 });
    }

    const snap = await adminDb.collection("sori_classes").where("inviteCode", "==", code).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ error: "유효하지 않은 초대 코드입니다." }, { status: 404 });
    }

    const classDoc = snap.docs[0];
    const classData = classDoc.data();

    // 학생 정보에 반 정보 영구 저장
    await adminDb.collection("sori_users").doc(email).set(
      {
        email,
        name: studentName || email.split("@")[0],
        studentId,
        classId: classDoc.id,
        className: classData.name || "",
        classTeacherEmail: classData.teacherEmail || "",
        classLevel: classData.level || "",
        classJoinedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      classId: classDoc.id,
      className: classData.name,
      level: classData.level,
      redirectPath:
        classData.level === "동국대 3급" || classData.curriculumCollection === "sori_curriculum_dongguk3"
          ? "/dongguk3"
          : classData.level === "단국대" || classData.curriculumCollection === "sori_curriculum_dankook"
          ? "/dankook"
          : "/dongguk",
    });
  } catch (e: any) {
    console.error("반 가입 실패:", e);
    return NextResponse.json({ error: e.message || "반 가입 실패" }, { status: 500 });
  }
}
