// app/api/admin/send-notification/route.ts
// 관리자 전용: 인증 완료 학생 대상 학습 독려 알림 발송 (즉시 발송 및 예약 발송 지원)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export interface ScheduledNotification {
  id: string;
  targetType: "all_approved" | "dongguk" | "dongguk3" | "dankook" | "individual";
  targetEmail?: string;
  title: string;
  content: string;
  link?: string;
  scheduledAtMs: number;
  scheduledAtFormatted: string;
  status: "pending" | "sent" | "cancelled";
  created_at: any;
  sent_count?: number;
}

// ── 대상 학생 이메일 목록 추출 헬퍼 ──
async function getTargetStudentEmails(
  targetType: "all_approved" | "dongguk" | "dongguk3" | "dankook" | "individual",
  targetEmail?: string
): Promise<{ email: string; name: string }[]> {
  if (targetType === "individual" && targetEmail) {
    const userDoc = await adminDb.collection("sori_users").doc(targetEmail).get();
    const data = userDoc.data() || {};
    return [{ email: targetEmail, name: data.name || data.alias || "학생" }];
  }

  const usersSnap = await adminDb.collection("sori_users").get();
  const list: { email: string; name: string }[] = [];

  usersSnap.forEach((doc) => {
    const data = doc.data();
    const email = doc.id;
    const name = data.name || data.alias || "학생";

    const isDongguk1 = data.dongguk_status === "approved";
    const isDongguk3 = data.dongguk3_status === "approved";
    const isDankook = data.dankook_status === "approved";

    if (targetType === "all_approved" && (isDongguk1 || isDongguk3 || isDankook)) {
      list.push({ email, name });
    } else if (targetType === "dongguk" && isDongguk1) {
      list.push({ email, name });
    } else if (targetType === "dongguk3" && isDongguk3) {
      list.push({ email, name });
    } else if (targetType === "dankook" && isDankook) {
      list.push({ email, name });
    }
  });

  return list;
}

// ── 학생들의 inbox에 알림 일괄 저장 헬퍼 ──
async function dispatchNotificationToInbox(
  students: { email: string; name: string }[],
  notification: { title: string; content: string; link?: string }
): Promise<number> {
  if (students.length === 0) return 0;

  // 500개씩 청크 분할하여 batch commit
  const chunkSize = 400;
  let sentCount = 0;

  for (let i = 0; i < students.length; i += chunkSize) {
    const chunk = students.slice(i, i + chunkSize);
    const batch = adminDb.batch();

    for (const student of chunk) {
      const inboxRef = adminDb
        .collection("sori_users")
        .doc(student.email)
        .collection("inbox")
        .doc();

      batch.set(inboxRef, {
        from: "소리튜터 선생님",
        title: notification.title,
        content: notification.content,
        link: notification.link || "",
        date: FieldValue.serverTimestamp(),
        read: false,
      });
      sentCount++;
    }

    await batch.commit();
  }

  return sentCount;
}

// ── GET: 예약 목록 조회 & 도래한 예약 알림 자동 디스패치 ──
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const nowMs = Date.now();
    const scheduledSnap = await adminDb
      .collection("sori_scheduled_notifications")
      .orderBy("scheduledAtMs", "asc")
      .get();

    const notifications: ScheduledNotification[] = [];

    for (const doc of scheduledSnap.docs) {
      const data = doc.data();
      const notiId = doc.id;
      const status = data.status || "pending";
      const scheduledAtMs = data.scheduledAtMs || 0;

      // 만약 예약 시간이 지났는데 아직 pending 상태라면 자동 발송 처리
      if (status === "pending" && scheduledAtMs <= nowMs) {
        const students = await getTargetStudentEmails(data.targetType, data.targetEmail);
        const sentCount = await dispatchNotificationToInbox(students, {
          title: data.title,
          content: data.content,
          link: data.link,
        });

        await doc.ref.update({
          status: "sent",
          sent_at: FieldValue.serverTimestamp(),
          sent_count: sentCount,
        });

        notifications.push({
          id: notiId,
          targetType: data.targetType,
          targetEmail: data.targetEmail,
          title: data.title,
          content: data.content,
          link: data.link,
          scheduledAtMs,
          scheduledAtFormatted: data.scheduledAtFormatted || new Date(scheduledAtMs).toLocaleString("ko-KR"),
          status: "sent",
          created_at: data.created_at,
          sent_count: sentCount,
        });
      } else {
        notifications.push({
          id: notiId,
          targetType: data.targetType,
          targetEmail: data.targetEmail,
          title: data.title,
          content: data.content,
          link: data.link,
          scheduledAtMs,
          scheduledAtFormatted: data.scheduledAtFormatted || new Date(scheduledAtMs).toLocaleString("ko-KR"),
          status,
          created_at: data.created_at,
          sent_count: data.sent_count,
        });
      }
    }

    return NextResponse.json({ success: true, notifications });
  } catch (error: any) {
    console.error("Fetch scheduled notifications error:", error);
    return NextResponse.json(
      { error: error.message || "예약 알림 조회 실패" },
      { status: 500 }
    );
  }
}

// ── POST: 알림 발송 (즉시 또는 예약) ──
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const {
      targetType = "all_approved",
      targetEmail,
      title,
      content,
      link,
      sendMode = "now", // "now" | "scheduled"
      scheduledAt, // ISO string or datetime string (e.g. "2026-11-05T09:00")
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "알림 제목을 입력해주세요." }, { status: 400 });
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: "알림 본문 내용을 입력해주세요." }, { status: 400 });
    }

    // 1. 즉시 발송
    if (sendMode === "now") {
      const students = await getTargetStudentEmails(targetType, targetEmail);
      if (students.length === 0) {
        return NextResponse.json(
          { error: "해당 조건에 일치하는 인증 학생이 없습니다." },
          { status: 400 }
        );
      }

      const sentCount = await dispatchNotificationToInbox(students, {
        title: title.trim(),
        content: content.trim(),
        link: link?.trim() || "",
      });

      // 발송 이력 기록
      await adminDb.collection("sori_scheduled_notifications").add({
        targetType,
        targetEmail: targetEmail || null,
        title: title.trim(),
        content: content.trim(),
        link: link?.trim() || "",
        scheduledAtMs: Date.now(),
        scheduledAtFormatted: "즉시 발송",
        status: "sent",
        sent_at: FieldValue.serverTimestamp(),
        sent_count: sentCount,
        created_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        mode: "now",
        sentCount,
        message: `${sentCount}명의 학생에게 학습 독려 알림이 발송되었습니다! 🎉`,
      });
    }

    // 2. 예약 발송
    if (sendMode === "scheduled") {
      if (!scheduledAt) {
        return NextResponse.json(
          { error: "예약 발송 일시를 설정해주세요." },
          { status: 400 }
        );
      }

      const scheduledDate = new Date(scheduledAt);
      const scheduledAtMs = scheduledDate.getTime();
      const nowMs = Date.now();

      if (isNaN(scheduledAtMs) || scheduledAtMs <= nowMs) {
        return NextResponse.json(
          { error: "예약 시간은 현재 시간 이후로 설정해주세요." },
          { status: 400 }
        );
      }

      // 예약 포맷
      const yyyy = scheduledDate.getFullYear();
      const mm = String(scheduledDate.getMonth() + 1).padStart(2, "0");
      const dd = String(scheduledDate.getDate()).padStart(2, "0");
      const hh = String(scheduledDate.getHours()).padStart(2, "0");
      const min = String(scheduledDate.getMinutes()).padStart(2, "0");
      const scheduledAtFormatted = `${yyyy}.${mm}.${dd} ${hh}:${min}`;

      const docRef = await adminDb.collection("sori_scheduled_notifications").add({
        targetType,
        targetEmail: targetEmail || null,
        title: title.trim(),
        content: content.trim(),
        link: link?.trim() || "",
        scheduledAtMs,
        scheduledAtFormatted,
        status: "pending",
        created_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        mode: "scheduled",
        id: docRef.id,
        scheduledAtFormatted,
        message: `${scheduledAtFormatted}에 발송되도록 알람 예약이 완료되었습니다! ⏰`,
      });
    }

    return NextResponse.json({ error: "유효하지 않은 발송 모드입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Send notification error:", error);
    return NextResponse.json(
      { error: error.message || "알림 발송 처리 실패" },
      { status: 500 }
    );
  }
}

// ── DELETE: 예약 알림 취소/삭제 ──
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "삭제할 알림 ID가 필요합니다." }, { status: 400 });
    }

    await adminDb.collection("sori_scheduled_notifications").doc(id).delete();
    return NextResponse.json({ success: true, message: "예약 알림이 취소되었습니다." });
  } catch (error: any) {
    console.error("Cancel scheduled notification error:", error);
    return NextResponse.json(
      { error: error.message || "예약 알림 취소 실패" },
      { status: 500 }
    );
  }
}
