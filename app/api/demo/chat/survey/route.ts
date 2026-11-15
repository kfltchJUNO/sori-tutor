// app/api/demo/chat/survey/route.ts
// 보이스봇(실전 회화 & 억양/감정) 5턴 완료 설문조사 제출 (공개) 및 관리자 조회 (관리자 전용) API

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export interface VoiceBotSurveyDoc {
  id?: string;
  deviceId?: string;
  nativeLanguage?: string;
  koreanLevel?: string;
  personaId?: string;
  personaName?: string;
  satisfaction: number; // 1~5
  latencyRating?: string;
  emotionAccuracy?: string;
  goodPoints: string[];
  goodPointComment?: string;
  badPoints: string[];
  badPointComment?: string;
  experiencedError: boolean;
  errorTypes: string[];
  errorDetail?: string;
  contactEmail?: string;
  clientIp?: string;
  createdAt: number;
}

// 1. 관리자 전용: 보이스봇 설문 응답 목록 및 통계 집계 조회
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const snap = await adminDb
      .collection("sori_voicebot_surveys")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    const surveys: VoiceBotSurveyDoc[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const totalCount = surveys.length;
    const avgSatisfaction =
      totalCount > 0
        ? (surveys.reduce((acc, s) => acc + (s.satisfaction || 0), 0) / totalCount).toFixed(1)
        : "0.0";

    const errorCount = surveys.filter((s) => s.experiencedError).length;
    const errorRate = totalCount > 0 ? ((errorCount / totalCount) * 100).toFixed(1) : "0.0";

    // 좋았던 점 빈도 분석
    const goodCounts: Record<string, number> = {};
    surveys.forEach((s) => {
      (s.goodPoints || []).forEach((pt) => {
        goodCounts[pt] = (goodCounts[pt] || 0) + 1;
      });
    });

    // 아쉬웠던 점 빈도 분석
    const badCounts: Record<string, number> = {};
    surveys.forEach((s) => {
      (s.badPoints || []).forEach((pt) => {
        badCounts[pt] = (badCounts[pt] || 0) + 1;
      });
    });

    // 오류 유형 빈도 분석
    const errorTypeCounts: Record<string, number> = {};
    surveys.forEach((s) => {
      (s.errorTypes || []).forEach((et) => {
        errorTypeCounts[et] = (errorTypeCounts[et] || 0) + 1;
      });
    });

    // 반응 속도 분포
    const latencyCounts: Record<string, number> = {};
    surveys.forEach((s) => {
      if (s.latencyRating) {
        latencyCounts[s.latencyRating] = (latencyCounts[s.latencyRating] || 0) + 1;
      }
    });

    return NextResponse.json({
      surveys,
      stats: {
        totalCount,
        avgSatisfaction,
        errorCount,
        errorRate,
        goodCounts,
        badCounts,
        errorTypeCounts,
        latencyCounts,
      },
    });
  } catch (e: any) {
    console.error("보이스봇 설문 조회 오류:", e);
    return NextResponse.json(
      { error: e.message || "설문 데이터 조회 실패" },
      { status: 500 }
    );
  }
}

// 2. 공개: 5턴 완료자 설문 응답 제출
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceId = "unknown",
      nativeLanguage = "한국어",
      koreanLevel = "초급 (1~2급)",
      personaId = "junho",
      personaName = "준호",
      satisfaction = 5,
      latencyRating = "적당함",
      emotionAccuracy = "대략 맞음",
      goodPoints = [],
      goodPointComment = "",
      badPoints = [],
      badPointComment = "",
      experiencedError = false,
      errorTypes = [],
      errorDetail = "",
      contactEmail = "",
    } = body;

    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

    const docData: VoiceBotSurveyDoc = {
      deviceId,
      nativeLanguage,
      koreanLevel,
      personaId,
      personaName,
      satisfaction: Math.min(5, Math.max(1, Number(satisfaction) || 5)),
      latencyRating,
      emotionAccuracy,
      goodPoints: Array.isArray(goodPoints) ? goodPoints : [],
      goodPointComment: String(goodPointComment || "").slice(0, 1000),
      badPoints: Array.isArray(badPoints) ? badPoints : [],
      badPointComment: String(badPointComment || "").slice(0, 1000),
      experiencedError: Boolean(experiencedError),
      errorTypes: Array.isArray(errorTypes) ? errorTypes : [],
      errorDetail: String(errorDetail || "").slice(0, 1000),
      contactEmail: String(contactEmail || "").slice(0, 200),
      clientIp,
      createdAt: Date.now(),
    };

    const docRef = await adminDb.collection("sori_voicebot_surveys").add(docData);

    return NextResponse.json({
      success: true,
      surveyId: docRef.id,
      message: "설문이 성공적으로 접수되었습니다. 소중한 의견 감사합니다!",
    });
  } catch (e: any) {
    console.error("보이스봇 설문 저장 오류:", e);
    return NextResponse.json(
      { error: e.message || "설문 저장 실패" },
      { status: 500 }
    );
  }
}
