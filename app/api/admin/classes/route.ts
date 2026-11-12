// app/api/admin/classes/route.ts
// 관리자 전용: 반(Class) 생성, 조회, 수정, 삭제 API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface ClassData {
  id: string;
  name: string;
  institution: string;
  level: string;
  curriculumCollection: string;
  teacherEmail: string;
  teacherName: string;
  inviteCode: string;
  memo?: string;
  studentCount: number;
  createdAtMs: number;
}

// 6자리 난수 영문+숫자 코드 생성기
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 1. 모든 반 목록 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb.collection("sori_classes").orderBy("createdAt", "desc").get();
    
    // 학생 수 실시간 집계를 위해 sori_users 중 classId가 있는 학생들 집계
    const usersSnap = await adminDb.collection("sori_users").where("classId", "!=", "").get();
    const studentCountMap: Record<string, number> = {};
    usersSnap.forEach(d => {
      const cId = d.data()?.classId;
      if (cId) {
        studentCountMap[cId] = (studentCountMap[cId] || 0) + 1;
      }
    });

    const classes: ClassData[] = snap.docs.map(doc => {
      const d = doc.data();
      const count = studentCountMap[doc.id] ?? (d.studentCount || 0);
      return {
        id: doc.id,
        name: d.name || "미지정 반",
        institution: d.institution || "",
        level: d.level || "1급",
        curriculumCollection: d.curriculumCollection || "sori_curriculum_dongguk",
        teacherEmail: d.teacherEmail || "",
        teacherName: d.teacherName || "선생님 미지정",
        inviteCode: d.inviteCode || "",
        memo: d.memo || "",
        studentCount: count,
        createdAtMs: d.createdAt?.toMillis?.() ?? (d.createdAt?._seconds ? d.createdAt._seconds * 1000 : Date.now()),
      };
    });

    return NextResponse.json({ classes });
  } catch (e: any) {
    console.error("반 목록 조회 실패:", e);
    return NextResponse.json({ error: e.message || "반 목록 조회 실패" }, { status: 500 });
  }
}

// 2. 신규 반 생성
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    const institution = (body.institution || "").trim();
    const level = (body.level || "1급").trim();
    const curriculumCollection = (body.curriculumCollection || "sori_curriculum_dongguk").trim();
    const teacherEmail = (body.teacherEmail || "").trim().toLowerCase();
    const teacherName = (body.teacherName || "").trim();
    const memo = (body.memo || "").trim();

    if (!name) {
      return NextResponse.json({ error: "반 이름을 입력하세요." }, { status: 400 });
    }

    // 초대 코드 생성 (중복 방지 확인)
    let inviteCode = generateInviteCode();
    const existing = await adminDb.collection("sori_classes").where("inviteCode", "==", inviteCode).limit(1).get();
    if (!existing.empty) {
      inviteCode = generateInviteCode();
    }

    const docRef = await adminDb.collection("sori_classes").add({
      name,
      institution,
      level,
      curriculumCollection,
      teacherEmail,
      teacherName,
      inviteCode,
      memo,
      studentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 선생님 담당 반 목록에 추가
    if (teacherEmail) {
      const teacherRef = adminDb.collection("sori_teachers").doc(teacherEmail);
      const tSnap = await teacherRef.get();
      if (tSnap.exists) {
        const assigned = Array.isArray(tSnap.data()?.assignedClassIds) ? tSnap.data()?.assignedClassIds : [];
        if (!assigned.includes(docRef.id)) {
          await teacherRef.update({
            assignedClassIds: [...assigned, docRef.id],
            updatedAt: new Date(),
          });
        }
      }
    }

    return NextResponse.json({ success: true, id: docRef.id, inviteCode });
  } catch (e: any) {
    console.error("반 생성 실패:", e);
    return NextResponse.json({ error: e.message || "반 생성 실패" }, { status: 500 });
  }
}

// 3. 반 정보 수정
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const classId = (body.classId || "").trim();
    if (!classId) {
      return NextResponse.json({ error: "반 ID가 필요합니다." }, { status: 400 });
    }

    const updateData: any = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.institution !== undefined) updateData.institution = body.institution.trim();
    if (body.level !== undefined) updateData.level = body.level.trim();
    if (body.curriculumCollection !== undefined) updateData.curriculumCollection = body.curriculumCollection.trim();
    if (body.teacherEmail !== undefined) updateData.teacherEmail = body.teacherEmail.trim().toLowerCase();
    if (body.teacherName !== undefined) updateData.teacherName = body.teacherName.trim();
    if (body.memo !== undefined) updateData.memo = body.memo.trim();

    await adminDb.collection("sori_classes").doc(classId).update(updateData);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("반 수정 실패:", e);
    return NextResponse.json({ error: e.message || "반 수정 실패" }, { status: 500 });
  }
}

// 4. 반 삭제
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const classId = (searchParams.get("classId") || "").trim();

    if (!classId) {
      return NextResponse.json({ error: "삭제할 반 ID가 필요합니다." }, { status: 400 });
    }

    // 소속된 학생들의 classId 초기화
    const studentsSnap = await adminDb.collection("sori_users").where("classId", "==", classId).get();
    const batch = adminDb.batch();
    studentsSnap.forEach(s => {
      batch.update(s.ref, { classId: "", className: "", updatedAt: new Date() });
    });
    await batch.commit();

    // 반 문서 삭제
    await adminDb.collection("sori_classes").doc(classId).delete();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("반 삭제 실패:", e);
    return NextResponse.json({ error: e.message || "반 삭제 실패" }, { status: 500 });
  }
}
