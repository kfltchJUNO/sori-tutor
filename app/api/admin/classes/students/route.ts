// app/api/admin/classes/students/route.ts
// 특정 반(Class) 소속 학생 목록 조회, 학생 수동 배정 및 해제 API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface ClassStudentInfo {
  email: string;
  name: string;
  studentId: string;
  totalCount: number;
  avgScore: number;
  lastStudyAtMs: number | null;
  joinedAtMs: number | null;
}

// 1. 특정 반의 학생 목록 및 최근 학습 통계 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    if (!classId) {
      return NextResponse.json({ error: "반 ID(classId)가 필요합니다." }, { status: 400 });
    }

    const studentsSnap = await adminDb.collection("sori_users").where("classId", "==", classId).get();
    
    const students: ClassStudentInfo[] = await Promise.all(
      studentsSnap.docs.map(async (docSnap) => {
        const d = docSnap.data();
        const email = docSnap.id;

        // 각 학생의 history 컬렉션에서 최근 학습 정보 집계
        const histSnap = await adminDb
          .collection("sori_users")
          .doc(email)
          .collection("history")
          .orderBy("date", "desc")
          .limit(50)
          .get();

        const records = histSnap.docs.map(h => h.data());
        const totalCount = records.length;
        const avgScore =
          totalCount > 0
            ? Math.round(
                records.reduce((acc, r) => acc + (typeof r.score === "number" ? r.score : 0), 0) /
                  totalCount
              )
            : 0;

        let lastStudyAtMs: number | null = null;
        if (records.length > 0) {
          const first = records[0].date;
          if (first?.toMillis) lastStudyAtMs = first.toMillis();
          else if (first?._seconds) lastStudyAtMs = first._seconds * 1000;
          else if (typeof first === "number") lastStudyAtMs = first;
        }

        let joinedAtMs: number | null = null;
        if (d.classJoinedAt?.toMillis) joinedAtMs = d.classJoinedAt.toMillis();
        else if (d.classJoinedAt?._seconds) joinedAtMs = d.classJoinedAt._seconds * 1000;

        return {
          email,
          name: d.name || d.alias || "학생",
          studentId: d.studentId || d.dongguk_student_id || d.dankook_student_id || "",
          totalCount,
          avgScore,
          lastStudyAtMs,
          joinedAtMs,
        };
      })
    );

    return NextResponse.json({ students });
  } catch (e: any) {
    console.error("반 학생 목록 조회 실패:", e);
    return NextResponse.json({ error: e.message || "반 학생 목록 조회 실패" }, { status: 500 });
  }
}

// 2. 학생을 반에 수동 배정
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const classId = (body.classId || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const name = (body.name || "").trim();
    const studentId = (body.studentId || "").trim();

    if (!classId || !email) {
      return NextResponse.json({ error: "반 ID와 학생 이메일이 필요합니다." }, { status: 400 });
    }

    // 반 정보 조회
    const classDoc = await adminDb.collection("sori_classes").doc(classId).get();
    if (!classDoc.exists) {
      return NextResponse.json({ error: "존재하지 않는 반입니다." }, { status: 404 });
    }
    const classData = classDoc.data();

    // 학생 정보 업데이트/생성
    await adminDb.collection("sori_users").doc(email).set(
      {
        email,
        name: name || email.split("@")[0],
        studentId,
        classId,
        className: classData?.name || "",
        classTeacherEmail: classData?.teacherEmail || "",
        classLevel: classData?.level || "",
        classJoinedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, email, classId });
  } catch (e: any) {
    console.error("학생 반 배정 실패:", e);
    return NextResponse.json({ error: e.message || "학생 반 배정 실패" }, { status: 500 });
  }
}

// 3. 학생을 반에서 배정 해제
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "학생 이메일이 필요합니다." }, { status: 400 });
    }

    await adminDb.collection("sori_users").doc(email).update({
      classId: "",
      className: "",
      classTeacherEmail: "",
      classLevel: "",
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("학생 반 배정 해제 실패:", e);
    return NextResponse.json({ error: e.message || "학생 반 배정 해제 실패" }, { status: 500 });
  }
}
