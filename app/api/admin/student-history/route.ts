// app/api/admin/student-history/route.ts
// 관리자 전용: 동국대 / 단국대 학생들의 발음 학습 기록(history) 조회 API (Firebase Admin SDK 사용)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface StudentHistoryRecord {
  id: string;
  studentEmail: string;
  studentName: string;
  studentId: string;
  text: string;
  pronunciation?: string;
  chapter?: number | null;
  score: number;
  recognized: string;
  correct: boolean;
  feedback?: string;
  advice?: string;
  type: string;
  dateMs: number | null;
}

export interface StudentLearningSummary {
  email: string;
  name: string;
  studentId: string;
  status: "pending" | "approved";
  totalCount: number;
  univCount: number;
  avgScore: number;
  bestScore: number;
  lastStudyAtMs: number | null;
  records: StudentHistoryRecord[];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const univ = searchParams.get("univ") === "dankook" ? "dankook" : "dongguk";
    const statusField = univ === "dankook" ? "dankook_status" : "dongguk_status";
    const studentIdField = univ === "dankook" ? "dankook_student_id" : "dongguk_student_id";

    // 1. 해당 대학에 신청/승인된 학생 목록 조회
    const usersSnap = await adminDb.collection("sori_users").get();
    const targetStudents: {
      email: string;
      name: string;
      studentId: string;
      status: "pending" | "approved";
    }[] = [];

    usersSnap.forEach(docSnap => {
      const d = docSnap.data();
      const st = d[statusField];
      if (st === "approved" || st === "pending") {
        targetStudents.push({
          email: docSnap.id,
          name: d.name || d.alias || "학생",
          studentId: d[studentIdField] || "",
          status: st,
        });
      }
    });

    // 2. 각 학생의 하위 컬렉션 history 병렬 조회
    const summaries: StudentLearningSummary[] = await Promise.all(
      targetStudents.map(async (stu) => {
        const histSnap = await adminDb
          .collection("sori_users")
          .doc(stu.email)
          .collection("history")
          .orderBy("date", "desc")
          .limit(100)
          .get();

        const records: StudentHistoryRecord[] = histSnap.docs.map(h => {
          const hd = h.data();
          let dateMs: number | null = null;
          if (hd.date?.toMillis) {
            dateMs = hd.date.toMillis();
          } else if (hd.date?._seconds) {
            dateMs = hd.date._seconds * 1000;
          } else if (typeof hd.date === "number") {
            dateMs = hd.date;
          }

          return {
            id: h.id,
            studentEmail: stu.email,
            studentName: stu.name,
            studentId: stu.studentId,
            text: hd.text ?? "",
            pronunciation: hd.pronunciation ?? "",
            chapter: hd.chapter ?? null,
            score: typeof hd.score === "number" ? hd.score : Number(hd.score) || 0,
            recognized: hd.recognized ?? "",
            correct: Boolean(hd.correct),
            feedback: hd.feedback ?? "",
            advice: hd.advice ?? "",
            type: hd.type ?? "sentence",
            dateMs,
          };
        });

        const totalCount = records.length;
        const univCount = records.filter(r => r.type === univ).length;
        const scores = records.map(r => r.score);
        const avgScore =
          totalCount > 0
            ? Math.round(scores.reduce((acc, cur) => acc + cur, 0) / totalCount)
            : 0;
        const bestScore = totalCount > 0 ? Math.max(...scores) : 0;
        const lastStudyAtMs = records.length > 0 ? records[0].dateMs : null;

        return {
          email: stu.email,
          name: stu.name,
          studentId: stu.studentId,
          status: stu.status,
          totalCount,
          univCount,
          avgScore,
          bestScore,
          lastStudyAtMs,
          records,
        };
      })
    );

    // 최근 학습 시각 순 (학습 기록이 있는 학생 우선) 정렬
    summaries.sort((a, b) => {
      if ((b.lastStudyAtMs ?? 0) !== (a.lastStudyAtMs ?? 0)) {
        return (b.lastStudyAtMs ?? 0) - (a.lastStudyAtMs ?? 0);
      }
      return b.totalCount - a.totalCount;
    });

    return NextResponse.json({
      univ,
      students: summaries,
    });
  } catch (e: any) {
    console.error("Failed to load student history:", e);
    return NextResponse.json(
      { error: e.message || "학생 학습 기록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
