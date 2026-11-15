// app/api/demo/logs/route.ts
// 관리자 전용: 테스트/체험 참여자들의 발음 평가 기록 및 누적 지표 조회 API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import type { DemoEvaluationLog } from "@/lib/demoData";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb
      .collection("sori_demo_evaluations")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    const logs: DemoEvaluationLog[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        deviceId: d.deviceId || "unknown",
        clientIp: d.clientIp || "",
        targetText: d.targetText || "",
        level: d.level || "1급",
        score: Number(d.score) || 0,
        phonemeScore: Number(d.phonemeScore) || 0,
        recognizedText: d.recognizedText || "",
        feedback: d.feedback || "",
        isSilence: Boolean(d.isSilence),
        date: d.date || "",
        createdAtMs:
          d.createdAt?.toMillis?.() ??
          (d.createdAt?._seconds ? d.createdAt._seconds * 1000 : d.createdAtMs || Date.now()),
      };
    });

    const totalCount = snap.size;
    const deviceSet = new Set<string>();
    let scoreSum = 0;
    let nonZeroScoreCount = 0;

    logs.forEach((item) => {
      if (item.deviceId) deviceSet.add(item.deviceId);
      if (item.score > 0) {
        scoreSum += item.score;
        nonZeroScoreCount++;
      }
    });

    const avgScore =
      nonZeroScoreCount > 0 ? (scoreSum / nonZeroScoreCount).toFixed(1) : "0.0";

    return NextResponse.json({
      totalCount,
      uniqueDeviceCount: deviceSet.size,
      avgScore,
      logs,
    });
  } catch (e: any) {
    console.error("체험 평가 로그 조회 실패:", e);
    return NextResponse.json({ error: e.message || "평가 로그 조회 실패" }, { status: 500 });
  }
}
