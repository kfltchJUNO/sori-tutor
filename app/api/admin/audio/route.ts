// app/api/admin/audio/route.ts
// 커리큘럼 정답 발음 / 인트로 음성 업로드
// — ElevenLabs MP3 or 직접 녹음 파일 → Firebase Storage → Firestore 참조 업데이트

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";

function getStorageBucket() {
  return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const docId = formData.get("docId") as string;
    const colName = formData.get("colName") as string; // sori_curriculum_word | sentence | dialogue
    const audioType = formData.get("audioType") as string; // "answer" | "intro" | "dialogue_line"
    const lineIndex = formData.get("lineIndex") as string | null; // 담화 라인 인덱스 (optional)

    if (!file || !docId || !colName) {
      return NextResponse.json({ error: "file, docId, colName 필수" }, { status: 400 });
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기 10MB 초과" }, { status: 400 });
    }

    // MIME 타입 검사
    if (!["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"].includes(file.type)) {
      return NextResponse.json({ error: "MP3/WAV/OGG만 허용" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "mp3";
    const storagePath = lineIndex
      ? `curriculum/${colName}/${docId}/line_${lineIndex}.${ext}`
      : `curriculum/${colName}/${docId}/audio.${ext}`;

    // Firebase Storage 업로드
    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: { contentType: file.type },
      resumable: false,
    });

    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Firestore 문서 업데이트
    const docRef = adminDb.collection(colName).doc(docId);

    if (lineIndex !== null && lineIndex !== undefined) {
      // 담화 대본의 특정 라인 오디오 업데이트
      const snap = await docRef.get();
      const existing: string[] = snap.data()?.audio_paths ?? [];
      const idx = parseInt(lineIndex, 10);
      existing[idx] = publicUrl;
      await docRef.update({ audio_paths: existing, has_audio: true });
    } else {
      // 단어/문장 정답 발음 오디오
      await docRef.update({ audio_path: publicUrl, has_audio: true });
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (e: any) {
    console.error("Audio upload error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 오디오 삭제
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { docId, colName, lineIndex } = await req.json();
  if (!docId || !colName) return NextResponse.json({ error: "필수값 누락" }, { status: 400 });

  const docRef = adminDb.collection(colName).doc(docId);

  if (lineIndex !== null && lineIndex !== undefined) {
    const snap = await docRef.get();
    const existing: string[] = snap.data()?.audio_paths ?? [];
    existing[lineIndex] = "";
    await docRef.update({ audio_paths: existing });
  } else {
    await docRef.update({ audio_path: "", has_audio: false });
  }

  return NextResponse.json({ success: true });
}