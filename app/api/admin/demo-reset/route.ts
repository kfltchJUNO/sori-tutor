// app/api/admin/demo-reset/route.ts
// 관리자 전용: 체험용 5회 기기 제한 초기화(리셋) API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = (body.deviceId || "").trim();

    if (deviceId) {
      // 특정 기기 초기화
      const snap = await adminDb.collection("sori_demo_limits").where("deviceId", "==", deviceId).get();
      const batch = adminDb.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return NextResponse.json({ success: true, message: `기기(${deviceId}) 횟수 초기화 완료` });
    } else {
      // 모든 체험 제한 기록 일괄 초기화
      const snap = await adminDb.collection("sori_demo_limits").limit(500).get();
      const batch = adminDb.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return NextResponse.json({ success: true, message: `전체 체험 제한(${snap.size}건) 초기화 완료` });
    }
  } catch (e: any) {
    console.error("체험 횟수 초기화 실패:", e);
    return NextResponse.json({ error: e.message || "초기화 실패" }, { status: 500 });
  }
}
