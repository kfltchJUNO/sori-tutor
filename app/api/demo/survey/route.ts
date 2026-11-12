// app/api/demo/survey/route.ts
// 체험자 5개 국어 설문조사 제출 (공개) 및 관리자 조회 (관리자 전용) API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface DemoSurveyData {
  id: string;
  deviceId: string;
  language: string;
  satisfaction: number;
  feedbackClarity: number;
  ttsQuality: number;
  revisitIntent: number;
  comment: string;
  targetLevel?: string;
  createdAtMs: number;
}

// 1. 관리자 전용: 설문 응답 목록 및 통계 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb.collection("sori_demo_surveys").orderBy("createdAt", "desc").limit(200).get();
    
    const surveys: DemoSurveyData[] = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        deviceId: d.deviceId || "",
        language: d.language || "ko",
        satisfaction: Number(d.satisfaction) || 5,
        feedbackClarity: Number(d.feedbackClarity) || 5,
        ttsQuality: Number(d.ttsQuality) || 5,
        revisitIntent: Number(d.revisitIntent) || 5,
        comment: d.comment || "",
        targetLevel: d.targetLevel || "미지정",
        createdAtMs: d.createdAt?.toMillis?.() ?? (d.createdAt?._seconds ? d.createdAt._seconds * 1000 : Date.now()),
      };
    });

    const totalCount = surveys.length;
    const avgSatisfaction = totalCount > 0 ? (surveys.reduce((a, s) => a + s.satisfaction, 0) / totalCount).toFixed(1) : "0.0";
    const avgClarity = totalCount > 0 ? (surveys.reduce((a, s) => a + s.feedbackClarity, 0) / totalCount).toFixed(1) : "0.0";
    const avgTts = totalCount > 0 ? (surveys.reduce((a, s) => a + s.ttsQuality, 0) / totalCount).toFixed(1) : "0.0";
    const avgRevisit = totalCount > 0 ? (surveys.reduce((a, s) => a + s.revisitIntent, 0) / totalCount).toFixed(1) : "0.0";

    return NextResponse.json({
      surveys,
      stats: {
        totalCount,
        avgSatisfaction,
        avgClarity,
        avgTts,
        avgRevisit,
      },
    });
  } catch (e: any) {
    console.error("설문 목록 조회 실패:", e);
    return NextResponse.json({ error: e.message || "설문 조회 실패" }, { status: 500 });
  }
}

// 2. 체험 학생용: 설문조사 제출 (로그인 없이 가능)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = (body.deviceId || "unknown").trim();
    const language = (body.language || "ko").trim();
    const satisfaction = Math.min(5, Math.max(1, Number(body.satisfaction) || 5));
    const feedbackClarity = Math.min(5, Math.max(1, Number(body.feedbackClarity) || 5));
    const ttsQuality = Math.min(5, Math.max(1, Number(body.ttsQuality) || 5));
    const revisitIntent = Math.min(5, Math.max(1, Number(body.revisitIntent) || 5));
    const comment = (body.comment || "").trim();
    const targetLevel = (body.targetLevel || "").trim();

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const docRef = await adminDb.collection("sori_demo_surveys").add({
      deviceId,
      clientIp,
      language,
      satisfaction,
      feedbackClarity,
      ttsQuality,
      revisitIntent,
      comment,
      targetLevel,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error("설문 제출 실패:", e);
    return NextResponse.json({ error: e.message || "설문 제출 실패" }, { status: 500 });
  }
}
