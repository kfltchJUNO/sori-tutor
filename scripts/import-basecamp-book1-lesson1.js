// scripts/import-basecamp-book1-lesson1.js
// 1회성 import — Basecamp Korean Book1 1과 어휘/대화를
// sori_curriculum_word / sori_curriculum_dialogue 에 적재한다.
//
// 실행: node scripts/import-basecamp-book1-lesson1.js
// (.env.local 의 FIREBASE_* Admin SDK 자격증명 사용, lib/firebaseAdmin.ts와 동일한 방식)

require("dotenv").config({ path: ".env.local" });
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { words, dialogues } = require("./data/basecamp-book1-lesson1");

function getAdminApp() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
    throw new Error("Firebase Admin 환경변수가 누락되었습니다 (.env.local 확인).");
  }
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

async function main() {
  const db = getFirestore(getAdminApp());
  const batch = db.batch();

  for (const { id, ...data } of words) {
    batch.set(db.collection("sori_curriculum_word").doc(id), data);
  }
  for (const { id, ...data } of dialogues) {
    batch.set(db.collection("sori_curriculum_dialogue").doc(id), data);
  }

  await batch.commit();
  console.log(`✅ 단어 ${words.length}개, 대화 ${dialogues.length}개 적재 완료 (basecamp-korean / Book1 1과)`);
}

main().catch((e) => {
  console.error("❌ import 실패:", e);
  process.exit(1);
});
