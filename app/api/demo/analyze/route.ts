// app/api/demo/analyze/route.ts
// 체험용 하루 5회 기기 제한 및 발음 분석 프록시 API
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";

const DAILY_LIMIT = 5;

// 한국 시간 기준 YYYY-MM-DD 생성
function getTodayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getDeviceHashKey(deviceId: string, clientIp: string, dateStr: string): string {
  const raw = `${deviceId || "unknown"}_${clientIp || "unknown"}_${dateStr}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

// 1. 잔여 횟수 조회 (GET)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = (searchParams.get("deviceId") || "").trim();
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const dateStr = getTodayKST();

    const hashKey = getDeviceHashKey(deviceId, clientIp, dateStr);
    const docRef = adminDb.collection("sori_demo_limits").doc(hashKey);
    const snap = await docRef.get();

    const used = snap.exists ? (snap.data()?.count || 0) : 0;
    const remaining = Math.max(0, DAILY_LIMIT - used);

    return NextResponse.json({
      date: dateStr,
      limit: DAILY_LIMIT,
      used,
      remaining,
      isAllowed: remaining > 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "조회 실패" }, { status: 500 });
  }
}

// 2. 발음 분석 및 횟수 1회 차감 (POST)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const deviceId = (formData.get("deviceId") as string | null) || "unknown";
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const dateStr = getTodayKST();

    const hashKey = getDeviceHashKey(deviceId, clientIp, dateStr);
    const docRef = adminDb.collection("sori_demo_limits").doc(hashKey);
    const snap = await docRef.get();

    const currentUsed = snap.exists ? (snap.data()?.count || 0) : 0;

    // 하루 5회 초과 시 차단
    if (currentUsed >= DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: "LIMIT_EXCEEDED",
          message: "오늘의 무료 체험 5회를 모두 사용하셨습니다. 내일 다시 이용해주세요!",
          remaining: 0,
          used: currentUsed,
        },
        { status: 429 }
      );
    }

    // 분석 요청을 /api/analyze 로 위임 (멀티 키 로테이션 및 음운/억양 채점 적용)
    const analyzeUrl = new URL("/api/analyze", req.url);
    const forwardFormData = new FormData();

    formData.forEach((value, key) => {
      forwardFormData.append(key, value);
    });

    const analyzeRes = await fetch(analyzeUrl.toString(), {
      method: "POST",
      body: forwardFormData,
    });

    const analyzeData = await analyzeRes.json();
    if (!analyzeRes.ok) {
      return NextResponse.json(analyzeData, { status: analyzeRes.status });
    }

    // 성공 시 횟수 1회 증가
    const newCount = currentUsed + 1;
    await docRef.set(
      {
        count: newCount,
        deviceId,
        clientIp,
        date: dateStr,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const remaining = Math.max(0, DAILY_LIMIT - newCount);

    return NextResponse.json({
      ...analyzeData,
      demoRateLimit: {
        used: newCount,
        limit: DAILY_LIMIT,
        remaining,
      },
    });
  } catch (e: any) {
    console.error("체험 분석 실패:", e);
    return NextResponse.json({ error: e.message || "체험 발음 분석에 실패했습니다." }, { status: 500 });
  }
}
