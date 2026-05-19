// app/api/admin/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { draftId, editedContent } = await req.json();
    if (!draftId) return NextResponse.json({ error: "draftId 필요" }, { status: 400 });

    const draftRef = adminDb.collection("sori_drafts").doc(draftId);
    const draft = await draftRef.get();
    if (!draft.exists) return NextResponse.json({ error: "초안 없음" }, { status: 404 });

    const data = draft.data()!;
    const finalContent = editedContent ?? data.content;

    // 커리큘럼 컬렉션에 저장
    const colName = `sori_curriculum_${data.type}`;
    await adminDb.collection(colName).add({
      ...finalContent,
      category: data.category,
      step: data.step ?? null,
      unit: data.unit ?? null,
      source: "ai_generated",
      has_audio: false,
      created_at: FieldValue.serverTimestamp(),
    });

    // 초안 상태 업데이트
    await draftRef.update({
      status: "approved",
      approved_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 초안 삭제(반려)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { draftId } = await req.json();
  if (!draftId) return NextResponse.json({ error: "draftId 필요" }, { status: 400 });

  await adminDb.collection("sori_drafts").doc(draftId).update({
    status: "rejected",
  });

  return NextResponse.json({ success: true });
}