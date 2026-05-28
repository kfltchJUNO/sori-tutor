// app/api/admin/feedback-audio/route.ts
// 점수대별 ElevenLabs 멘트 MP3 업로드/삭제/조회

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";

// 허용된 tier 목록
const VALID_TIERS = ["perfect", "great", "good", "okay", "fail", "silence"] as const;
type Tier = typeof VALID_TIERS[number];

function getBucket() {
  return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
}

// ── GET: 현재 등록된 멘트 URL 전체 조회 ──────────────────
export async function GET(req: NextRequest) {
  // 공개 엔드포인트 (앱에서 호출)
  try {
    const snap = await adminDb.collection("sori_feedback_voices").get();
    const result: Record<string, string> = {};
    snap.forEach(d => { result[d.id] = d.data().url ?? ""; });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: 멘트 MP3 업로드 ────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const tier = formData.get("tier") as string;

    if (!file || !tier) {
      return NextResponse.json({ error: "file, tier 필수" }, { status: 400 });
    }
    if (!VALID_TIERS.includes(tier as Tier)) {
      return NextResponse.json({ error: "유효하지 않은 tier" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "5MB 초과" }, { status: 400 });
    }
    if (!["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"].includes(file.type)) {
      return NextResponse.json({ error: "MP3/WAV/OGG만 허용" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "mp3";
    const storagePath = `feedback_voices/${tier}.${ext}`;

    const bucket = getBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: { contentType: file.type },
      resumable: false,
    });
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Firestore에 URL 저장 (tier를 문서 ID로 사용)
    await adminDb.collection("sori_feedback_voices").doc(tier).set({
      url: publicUrl,
      tier,
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DELETE: 멘트 삭제 ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { tier } = await req.json();
  if (!VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "유효하지 않은 tier" }, { status: 400 });
  }

  await adminDb.collection("sori_feedback_voices").doc(tier).update({ url: "" });
  return NextResponse.json({ success: true });
}