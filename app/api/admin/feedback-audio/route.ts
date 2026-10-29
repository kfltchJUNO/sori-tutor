// app/api/admin/feedback-audio/route.ts
// 점수대별 ElevenLabs 멘트 자동 생성(미리듣기/저장) 및 MP3 업로드/삭제/조회

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_MALE_VOICE_ID } from "@/lib/elevenlabsVoices";

// 허용된 tier 목록
const VALID_TIERS = ["perfect", "great", "good", "okay", "fail", "silence"] as const;
type Tier = typeof VALID_TIERS[number];

function getBucket() {
  return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
}

// 자연스러운 호흡 및 클론 보이스 환각(Hallucination) 방지를 위한 전처리
function formatTextForNaturalBreathing(raw: string, isClonedVoice: boolean): string {
  let t = raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!t) return raw;
  // 말줄임표(...)는 클론 보이스에서 외계어/환각 발화를 유발하므로 일반 마침표/쉼표로 정규화
  t = t.replace(/\.{2,}|…/g, ".");
  // 클론 보이스의 경우 느낌표(!)가 연속되면 억양이 튀면서 한국어 발음이 깨지므로 마침표로 완화
  if (isClonedVoice) {
    t = t.replace(/!+/g, ".");
  }
  if (!/[.?!~]$/.test(t)) t += ".";
  return t;
}

// ElevenLabs TTS 호출
async function generateElevenLabsBuffer(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY 환경변수가 설정되지 않았습니다.");

  // 준호(대표 클론 보이스) 여부 확인
  const isClonedVoice = voiceId === DEFAULT_MALE_VOICE_ID;
  const naturalText = formatTextForNaturalBreathing(text, isClonedVoice);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: naturalText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        // 클론 보이스(IVC)는 stability가 낮거나 style > 0이면 대본에 없는 엉뚱한 말(환각)을 뱉으므로
        // stability를 높이고(0.78) style은 반드시 0.0으로 고정
        stability: isClonedVoice ? 0.78 : 0.70,
        similarity_boost: isClonedVoice ? 0.75 : 0.80,
        style: 0.0,
        use_speaker_boost: true,
        speed: 0.94,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs 호출 실패 (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── GET: 현재 등록된 멘트 URL 전체 조회 ──────────────────
export async function GET() {
  try {
    const snap = await adminDb.collection("sori_feedback_voices").get();
    const result: Record<string, string> = {};
    snap.forEach(d => { result[d.id] = d.data().url ?? ""; });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: ElevenLabs 미리듣기 / 저장 또는 MP3 직접 업로드 ───
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // 1. JSON 요청: ElevenLabs API로 생성 & 미리듣기(preview) 또는 저장(save)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action, tier, text, voiceId, audioBase64 } = body as {
        action?: "preview" | "save";
        tier?: string;
        text?: string;
        voiceId?: string;
        audioBase64?: string;
      };

      const usedVoiceId = voiceId || DEFAULT_MALE_VOICE_ID;

      // (A) 미리듣기 전용: Storage에 저장하지 않고 base64 오디오만 즉시 반환
      if (action === "preview") {
        if (!text?.trim()) {
          return NextResponse.json({ error: "생성할 대사를 입력해주세요." }, { status: 400 });
        }
        const buffer = await generateElevenLabsBuffer(text.trim(), usedVoiceId);
        return NextResponse.json({
          success: true,
          audioBase64: buffer.toString("base64"),
        });
      }

      // (B) 저장: 미리듣기한 base64가 있으면 그대로 저장, 없으면 ElevenLabs 생성 후 저장
      if (!tier || !VALID_TIERS.includes(tier as Tier)) {
        return NextResponse.json({ error: "유효하지 않은 tier" }, { status: 400 });
      }

      let buffer: Buffer;
      if (audioBase64) {
        buffer = Buffer.from(audioBase64, "base64");
      } else {
        if (!text?.trim()) {
          return NextResponse.json({ error: "생성할 대사를 입력해주세요." }, { status: 400 });
        }
        buffer = await generateElevenLabsBuffer(text.trim(), usedVoiceId);
      }

      const ts = Date.now();
      const storagePath = `feedback_voices/${tier}_${usedVoiceId}_${ts}.mp3`;
      const bucket = getBucket();
      const fileRef = bucket.file(storagePath);

      await fileRef.save(buffer, {
        metadata: {
          contentType: "audio/mpeg",
          cacheControl: "no-cache, max-age=0",
        },
        resumable: false,
      });
      await fileRef.makePublic();

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}?v=${ts}`;

      await adminDb.collection("sori_feedback_voices").doc(tier).set({
        url: publicUrl,
        tier,
        text: text?.trim() ?? "",
        voice_id: usedVoiceId,
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, url: publicUrl });
    }

    // 2. FormData 요청: 기존 수동 파일 업로드 지원
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

    const ts = Date.now();
    const ext = file.name.split(".").pop() ?? "mp3";
    const storagePath = `feedback_voices/${tier}_manual_${ts}.${ext}`;

    const bucket = getBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: "no-cache, max-age=0",
      },
      resumable: false,
    });
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}?v=${ts}`;

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
