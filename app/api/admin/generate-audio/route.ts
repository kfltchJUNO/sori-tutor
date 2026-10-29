// app/api/admin/generate-audio/route.ts
// ElevenLabs API를 호출하여 컨텐츠(단어/문장/대화) 음성을 생성하고 Firebase Storage 및 Firestore에 저장

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_MALE_VOICE_ID, resolveEmotionForV4 } from "@/lib/elevenlabsVoices";

function getStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET 환경변수가 설정되지 않았습니다.");
  }
  return getStorage().bucket(bucketName);
}

// 한국어 TTS 자연스러운 호흡(쉼표·문장 간 휴지) 보정 헬퍼
function formatKoreanTextForBreathing(raw: string, isClonedVoice = false): string {
  let s = raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!s) return s;

  // 1. 문두 감탄사/인사말 뒤에 쉼표가 없으면 쉼표 추가하여 첫 호흡 확보
  s = s.replace(
    /^(네|아니요|아|음|어|저기요|잠시만요|안녕하세요|반갑습니다|감사합니다|고마워요|고마워|죄송합니다|미안해요|미안해|맞아요|맞아|진짜요|진짜|그래요|그래|글쎄요|안녕)\s+(?=[가-힣])/u,
    "$1, "
  );

  // 2. 말줄임표(...)는 클론 보이스에서 환각 발화를 유발할 수 있으므로 일반 마침표로 정리
  s = s.replace(/\.{2,}|…/g, ".");
  if (isClonedVoice) {
    s = s.replace(/!+/g, ".");
  }

  // 3. 문장 끝에 마침표/물음표/느낌표가 없으면 마침표 추가
  if (!/[.?!~]$/.test(s)) {
    s += ".";
  }

  return s;
}

// ElevenLabs TTS 생성 함수 (1순위: eleven_v4 + 인라인 감정 오디오 태그 → 폴백: eleven_multilingual_v2)
async function synthesizeWithElevenLabs(
  text: string,
  voiceId: string,
  emotion: string = "auto"
): Promise<{ buffer: Buffer; detectedEmotion: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your_elevenlabs_api_key_here") {
    throw new Error("ElevenLabs API 키가 설정되지 않았습니다. .env.local에 ELEVENLABS_API_KEY를 입력해주세요.");
  }

  const targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_JUNHO || DEFAULT_MALE_VOICE_ID;
  const isClonedVoice = targetVoiceId === DEFAULT_MALE_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`;
  const formattedText = formatKoreanTextForBreathing(text, isClonedVoice);
  const { tag, stability, detectedLabel } = resolveEmotionForV4(formattedText, emotion, undefined, isClonedVoice);
  const v4Text = tag ? `${tag} ${formattedText}` : formattedText;

  // 1순위: eleven_v4 호출 (자연스러운 감정 표현 및 인라인 오디오 태그 지원)
  const v4Response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: v4Text,
      model_id: "eleven_v4",
      voice_settings: {
        stability,
        similarity_boost: isClonedVoice ? 0.75 : 0.8,
        use_speaker_boost: true,
      },
    }),
  });

  if (v4Response.ok) {
    const arrayBuffer = await v4Response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), detectedEmotion: detectedLabel };
  }

  console.warn(`eleven_v4 호출 실패 (${v4Response.status}), eleven_multilingual_v2로 자동 폴백합니다.`);

  // 2순위 폴백: eleven_multilingual_v2 ([tag]를 소리내어 읽지 않도록 formattedText만 전달)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: formattedText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: isClonedVoice ? 0.75 : 0.65,
        similarity_boost: isClonedVoice ? 0.75 : 0.8,
        style: 0.0,
        use_speaker_boost: true,
        speed: 0.92,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs API Error:", errorText);
    throw new Error(`ElevenLabs API 호출 실패 (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), detectedEmotion: detectedLabel };
}

// ── 1) 음성 생성 (미리듣기 / 단일 저장 / 담화 라인 / 전체 담화) ──────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { action, docId, colName, text, voiceId, emotion, lineIndex, isBatch, lines, audioBase64 } = body;

    // ── 0: 미리듣기 전용 (Storage/Firestore에 저장하지 않고 base64만 즉시 반환) ──
    if (action === "preview") {
      if (!text || !String(text).trim()) {
        return NextResponse.json({ error: "생성할 텍스트(text)가 없습니다." }, { status: 400 });
      }
      const usedVoiceId = voiceId || DEFAULT_MALE_VOICE_ID;
      const { buffer: audioBuffer, detectedEmotion } = await synthesizeWithElevenLabs(
        String(text).trim(),
        usedVoiceId,
        emotion || "auto"
      );
      return NextResponse.json({
        success: true,
        audioBase64: audioBuffer.toString("base64"),
        voiceId: usedVoiceId,
        detectedEmotion,
      });
    }

    if (!docId || !colName) {
      return NextResponse.json({ error: "docId, colName 필수" }, { status: 400 });
    }

    const bucket = getStorageBucket();
    const docRef = adminDb.collection(colName).doc(docId);

    // ── A: 담화 전체 라인 일괄 생성 ──
    if (isBatch && Array.isArray(lines)) {
      const snap = await docRef.get();
      const existing: string[] = snap.data()?.audio_paths ?? [];
      const ts = Date.now();

      for (let i = 0; i < lines.length; i++) {
        const item = lines[i];
        if (!item.text) continue;
        const usedVoiceId = item.voiceId || voiceId || DEFAULT_MALE_VOICE_ID;
        const usedEmotion = item.emotion || emotion || "auto";
        const { buffer: audioBuffer } = await synthesizeWithElevenLabs(item.text, usedVoiceId, usedEmotion);
        const storagePath = `curriculum/${colName}/${docId}/line_${i}_${usedVoiceId}_${ts}.mp3`;
        const fileRef = bucket.file(storagePath);

        await fileRef.save(audioBuffer, {
          metadata: { contentType: "audio/mpeg", cacheControl: "no-cache, max-age=0" },
          resumable: false,
        });
        await fileRef.makePublic();
        existing[i] = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      }

      await docRef.update({
        audio_paths: existing,
        has_audio: true,
        voice_id: voiceId || DEFAULT_MALE_VOICE_ID,
        audio_updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, audio_paths: existing });
    }

    // ── B: 단일 음성 저장 (미리듣기한 audioBase64가 있으면 그대로 저장, 없으면 생성 후 저장) ──
    if (!audioBase64 && !text) {
      return NextResponse.json({ error: "생성할 텍스트(text) 또는 미리듣기 데이터(audioBase64)가 없습니다." }, { status: 400 });
    }

    const usedVoiceId = voiceId || DEFAULT_MALE_VOICE_ID;
    const audioBuffer = audioBase64
      ? Buffer.from(audioBase64, "base64")
      : (await synthesizeWithElevenLabs(text, usedVoiceId, emotion || "auto")).buffer;
    const ts = Date.now();

    const isDialogueLine = lineIndex !== null && lineIndex !== undefined;
    const storagePath = isDialogueLine
      ? `curriculum/${colName}/${docId}/line_${lineIndex}_${usedVoiceId}_${ts}.mp3`
      : `curriculum/${colName}/${docId}/audio_${usedVoiceId}_${ts}.mp3`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(audioBuffer, {
      metadata: { contentType: "audio/mpeg", cacheControl: "no-cache, max-age=0" },
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
        voice_id: usedVoiceId,
        audio_updated_at: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true, url: publicUrl, audio_path: publicUrl, voiceId: usedVoiceId });
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
