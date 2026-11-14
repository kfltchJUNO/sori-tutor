// app/api/demo/sentences/route.ts
// 체험/테스트 전용 문장 및 오디오 관리 API
// GET: 공개 열람 (체험 페이지 /demo 에서 실시간 조회)
// POST, PUT, DELETE: 관리자 전용 문장 추가/수정/삭제/기본값 시드

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { DemoSentenceDoc, INITIAL_DEMO_SENTENCES } from "@/lib/demoData";
export type { DemoSentenceDoc };
export { INITIAL_DEMO_SENTENCES };

// 1. 문장 목록 조회 (공개 — /demo 에서 사용)
export async function GET(req: NextRequest) {
  try {
    const snap = await adminDb.collection("sori_demo_sentences").orderBy("order", "asc").get();

    if (snap.empty) {
      // DB에 아직 없으면 기본 배열을 반환 (ID 부여)
      const fallbackList: DemoSentenceDoc[] = INITIAL_DEMO_SENTENCES.map((item, idx) => ({
        id: `default-${idx + 1}`,
        ...item,
      }));
      return NextResponse.json({ sentences: fallbackList, isDefault: true });
    }

    const sentences: DemoSentenceDoc[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        level: d.level || "1급",
        text: d.text || "",
        pronunciation: d.pronunciation || "",
        ruleExplanation: d.ruleExplanation || "",
        audio_path: d.audio_path || "",
        has_audio: !!d.audio_path,
        order: Number(d.order) || 99,
        createdAt: d.createdAt?.toMillis?.() ?? null,
      };
    });

    return NextResponse.json({ sentences, isDefault: false });
  } catch (e: any) {
    console.error("데모 문장 조회 실패:", e);
    // 오류 시 안전하게 기본값 반환
    const fallbackList: DemoSentenceDoc[] = INITIAL_DEMO_SENTENCES.map((item, idx) => ({
      id: `default-${idx + 1}`,
      ...item,
    }));
    return NextResponse.json({ sentences: fallbackList, isDefault: true });
  }
}

// 2. 문장 추가 (관리자 전용)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const isSeed = searchParams.get("action") === "seed";

    // 기본 6문장 일괄 등록(시드)
    if (isSeed) {
      const batch = adminDb.batch();
      const colRef = adminDb.collection("sori_demo_sentences");
      for (const item of INITIAL_DEMO_SENTENCES) {
        const docRef = colRef.doc();
        batch.set(docRef, {
          ...item,
          has_audio: false,
          audio_path: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await batch.commit();
      return NextResponse.json({ success: true, message: "기본 6문장이 등록되었습니다." });
    }

    const body = await req.json();
    const text = (body.text || "").trim();
    const pronunciation = (body.pronunciation || "").trim();
    const ruleExplanation = (body.ruleExplanation || "").trim();
    const level = (body.level || "1급").trim();
    const order = Number(body.order) || 10;
    const audio_path = (body.audio_path || "").trim();

    if (!text) {
      return NextResponse.json({ error: "문장 내용(text)은 필수입니다." }, { status: 400 });
    }

    const docRef = await adminDb.collection("sori_demo_sentences").add({
      text,
      pronunciation,
      ruleExplanation,
      level,
      order,
      audio_path,
      has_audio: !!audio_path,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error("문장 추가 실패:", e);
    return NextResponse.json({ error: e.message || "문장 추가 실패" }, { status: 500 });
  }
}

// 3. 문장 수정 (관리자 전용)
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const id = (body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "문장 ID(id)는 필수입니다." }, { status: 400 });
    }

    const updateData: any = { updatedAt: new Date() };
    if (body.text !== undefined) updateData.text = String(body.text).trim();
    if (body.pronunciation !== undefined) updateData.pronunciation = String(body.pronunciation).trim();
    if (body.ruleExplanation !== undefined) updateData.ruleExplanation = String(body.ruleExplanation).trim();
    if (body.level !== undefined) updateData.level = String(body.level).trim();
    if (body.order !== undefined) updateData.order = Number(body.order);
    if (body.audio_path !== undefined) {
      updateData.audio_path = String(body.audio_path).trim();
      updateData.has_audio = !!updateData.audio_path;
    }

    await adminDb.collection("sori_demo_sentences").doc(id).update(updateData);
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    console.error("문장 수정 실패:", e);
    return NextResponse.json({ error: e.message || "문장 수정 실패" }, { status: 500 });
  }
}

// 4. 문장 삭제 (관리자 전용)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ error: "문장 ID(id)는 필수입니다." }, { status: 400 });
    }

    await adminDb.collection("sori_demo_sentences").doc(id).delete();
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    console.error("문장 삭제 실패:", e);
    return NextResponse.json({ error: e.message || "문장 삭제 실패" }, { status: 500 });
  }
}
