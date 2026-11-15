// app/api/demo/survey/route.ts
// 체험자 5개 국어 설문조사 제출 (공개) 및 관리자 조회 (관리자 전용) API
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { DemoSurveyData } from "@/lib/demoData";
export type { DemoSurveyData };

// 1. 관리자 전용: 설문 응답 목록 및 통계 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb.collection("sori_demo_surveys").orderBy("createdAt", "desc").limit(200).get();
    
    const surveys: DemoSurveyData[] = snap.docs.map(doc => {
      const d = doc.data();
      const isKorean = Boolean(
        d.isKorean ||
        d.nationality?.includes("한국") ||
        d.nationality?.includes("KR") ||
        d.nationality?.includes("Korea")
      );
      return {
        id: doc.id,
        deviceId: d.deviceId || "",
        language: d.language || "ko",
        satisfaction: Number(d.satisfaction) || 5,
        feedbackClarity: Number(d.feedbackClarity) || 5,
        ttsQuality: Number(d.ttsQuality) || 5,
        revisitIntent: Number(d.revisitIntent) || 5,
        translationQuality: Number(d.translationQuality) || 0,
        comment: d.comment || "",
        isKorean,
        targetLevel: d.targetLevel || "미지정",
        nationality: d.nationality || "",
        studyPeriod: d.studyPeriod || "",
        weaknesses: Array.isArray(d.weaknesses) ? d.weaknesses : [],
        experiencedError: Boolean(d.experiencedError),
        errorTypes: Array.isArray(d.errorTypes) ? d.errorTypes : [],
        errorDetail: d.errorDetail || "",
        createdAtMs: d.createdAt?.toMillis?.() ?? (d.createdAt?._seconds ? d.createdAt._seconds * 1000 : Date.now()),
      };
    });

    const totalCount = surveys.length;
    const avgSatisfaction = totalCount > 0 ? (surveys.reduce((a, s) => a + s.satisfaction, 0) / totalCount).toFixed(1) : "0.0";
    const avgClarity = totalCount > 0 ? (surveys.reduce((a, s) => a + s.feedbackClarity, 0) / totalCount).toFixed(1) : "0.0";
    const avgTts = totalCount > 0 ? (surveys.reduce((a, s) => a + s.ttsQuality, 0) / totalCount).toFixed(1) : "0.0";
    const avgRevisit = totalCount > 0 ? (surveys.reduce((a, s) => a + s.revisitIntent, 0) / totalCount).toFixed(1) : "0.0";
    const scoredTranslations = surveys.filter(s => s.translationQuality && s.translationQuality > 0);
    const avgTranslationQuality = scoredTranslations.length > 0
      ? (scoredTranslations.reduce((a, s) => a + (s.translationQuality || 0), 0) / scoredTranslations.length).toFixed(1)
      : "0.0";

    const koreanTesterCount = surveys.filter(s => s.isKorean).length;

    const errorReports = surveys.filter(s => s.experiencedError);
    const errorTypeCounts: Record<string, number> = {};
    surveys.forEach(s => {
      (s.errorTypes || []).forEach(t => {
        errorTypeCounts[t] = (errorTypeCounts[t] || 0) + 1;
      });
    });

    return NextResponse.json({
      surveys,
      stats: {
        totalCount,
        koreanTesterCount,
        avgSatisfaction,
        avgClarity,
        avgTts,
        avgRevisit,
        avgTranslationQuality,
        errorReportCount: errorReports.length,
        errorTypeCounts,
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
    const translationQuality = Math.min(5, Math.max(0, Number(body.translationQuality) || 0));
    const comment = (body.comment || "").trim();
    const isKorean = Boolean(
      body.isKorean ||
      body.nationality === "KR" ||
      body.nationality?.includes("한국") ||
      body.nationality?.includes("Korea")
    );
    const targetLevel = (body.targetLevel || "").trim();
    const nationality = (body.nationality || "").trim();
    const studyPeriod = (body.studyPeriod || "").trim();
    const weaknesses = Array.isArray(body.weaknesses) ? body.weaknesses.map((w: any) => String(w).trim()).filter(Boolean) : [];
    const experiencedError = Boolean(body.experiencedError);
    const errorTypes = Array.isArray(body.errorTypes) ? body.errorTypes.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const errorDetail = (body.errorDetail || "").trim();

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // 동일 기기 중복 설문 방지: 이미 제출한 기기인 경우 신규 생성 대신 업데이트하여 데이터 오염 방지
    if (deviceId && deviceId !== "unknown") {
      const existingSnap = await adminDb
        .collection("sori_demo_surveys")
        .where("deviceId", "==", deviceId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        await existingDoc.ref.update({
          clientIp,
          language,
          satisfaction,
          feedbackClarity,
          ttsQuality,
          revisitIntent,
          translationQuality,
          comment,
          isKorean,
          targetLevel,
          nationality,
          studyPeriod,
          weaknesses,
          experiencedError,
          errorTypes,
          errorDetail,
          updatedAt: new Date(),
        });
        return NextResponse.json({ success: true, id: existingDoc.id, updated: true });
      }
    }

    const docRef = await adminDb.collection("sori_demo_surveys").add({
      deviceId,
      clientIp,
      language,
      satisfaction,
      feedbackClarity,
      ttsQuality,
      revisitIntent,
      translationQuality,
      comment,
      isKorean,
      targetLevel,
      nationality,
      studyPeriod,
      weaknesses,
      experiencedError,
      errorTypes,
      errorDetail,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error("설문 제출 실패:", e);
    return NextResponse.json({ error: e.message || "설문 제출 실패" }, { status: 500 });
  }
}
