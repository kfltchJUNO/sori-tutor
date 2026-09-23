// app/api/admin/generate-audio/route.ts
// ElevenLabs API를 호출하여 컨텐츠(단어/문장/대화) 음성을 생성하고 Firebase Storage 및 Firestore에 저장

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_MALE_VOICE_ID } from "@/lib/elevenlabsVoices";

function getStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET 환경변수가 설정되지 않았습니다.");
  }
  return getStorage().bucket(bucketName);
}

// ElevenLabs TTS 생성 함수
async function synthesizeWithElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your_elevenlabs_api_key_here") {
    throw new Error("ElevenLabs API 키가 설정되지 않았습니다. .env.local에 ELEVENLABS_API_KEY를 입력해주세요.");
  }

  const targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_JUNHO || DEFAULT_MALE_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs API Error:", errorText);
    throw new Error(`ElevenLabs API 호출 실패 (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── 1) 음성 생성 (단일 / 담화 라인 / 전체 담화) ──────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { docId, colName, text, voiceId, lineIndex, isBatch, lines } = body;

    if (!docId || !colName) {
      return NextResponse.json({ error: "docId, colName 필수" }, { status: 400 });
    }

    const bucket = getStorageBucket();
    const docRef = adminDb.collection(colName).doc(docId);

    // ── A: 담화 전체 라인 일괄 생성 ──
    if (isBatch && Array.isArray(lines)) {
      const snap = await docRef.get();
      const existing: string[] = snap.data()?.audio_paths ?? [];

      for (let i = 0; i < lines.length; i++) {
        const item = lines[i];
        if (!item.text) continue;
        const audioBuffer = await synthesizeWithElevenLabs(item.text, item.voiceId || voiceId);
        const storagePath = `curriculum/${colName}/${docId}/line_${i}.mp3`;
        const fileRef = bucket.file(storagePath);

        await fileRef.save(audioBuffer, {
          metadata: { contentType: "audio/mpeg" },
          resumable: false,
        });
        await fileRef.makePublic();
        existing[i] = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      }

      await docRef.update({
        audio_paths: existing,
        has_audio: true,
        voice_id: voiceId,
        audio_updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, audio_paths: existing });
    }

    // ── B: 단일 음성 생성 (단어, 문장, 또는 담화 1개 라인) ──
    if (!text) {
      return NextResponse.json({ error: "생성할 텍스트(text)가 없습니다." }, { status: 400 });
    }

    const audioBuffer = await synthesizeWithElevenLabs(text, voiceId);

    const isDialogueLine = lineIndex !== null && lineIndex !== undefined;
    const storagePath = isDialogueLine
      ? `curriculum/${colName}/${docId}/line_${lineIndex}.mp3`
      : `curriculum/${colName}/${docId}/audio.mp3`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(audioBuffer, {
      metadata: { contentType: "audio/mpeg" },
      resumable: false,
    });
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    if (isDialogueLine) {
      const snap = await docRef.get();
      const existing: string[] = snap.data()?.audio_paths ?? [];
      const idx = parseInt(String(lineIndex), 10);
      existing[idx] = publicUrl;
      await docRef.update({
        audio_paths: existing,
        has_audio: true,
        audio_updated_at: FieldValue.serverTimestamp(),
      });
    } else {
      await docRef.update({
        audio_path: publicUrl,
        has_audio: true,
        voice_id: voiceId,
        audio_updated_at: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true, url: publicUrl, voiceId });
  } catch (e: any) {
    console.error("ElevenLabs Audio Generation Error:", e);
    return NextResponse.json({ error: e.message || "음성 생성 실패" }, { status: 500 });
  }
}

// ── 2) 음성 삭제 ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { docId, colName, lineIndex } = await req.json();
    if (!docId || !colName) {
      return NextResponse.json({ error: "docId, colName 필수" }, { status: 400 });
    }

    const bucket = getStorageBucket();
    const docRef = adminDb.collection(colName).doc(docId);
    const isDialogueLine = lineIndex !== null && lineIndex !== undefined;

    const storagePath = isDialogueLine
      ? `curriculum/${colName}/${docId}/line_${lineIndex}.mp3`
      : `curriculum/${colName}/${docId}/audio.mp3`;

    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch (storageErr) {
      console.warn("Storage delete warning:", storageErr);
    }

    if (isDialogueLine) {
      const snap = await docRef.get();
      const existing: string[] = snap.data()?.audio_paths ?? [];
      const idx = parseInt(String(lineIndex), 10);
      existing[idx] = "";
      const stillHasAudio = existing.some(p => Boolean(p));
      await docRef.update({
        audio_paths: existing,
        has_audio: stillHasAudio,
      });
    } else {
      await docRef.update({
        audio_path: "",
        has_audio: false,
        voice_id: FieldValue.delete(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Audio Delete Error:", e);
    return NextResponse.json({ error: e.message || "음성 삭제 실패" }, { status: 500 });
  }
}
