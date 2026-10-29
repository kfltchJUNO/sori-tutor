import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // 🔥 이 줄이 빠졌을 수 있음

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 앱 초기화 (중복 방지)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // 🔥 이 부분 확인
const googleProvider = new GoogleAuthProvider();

/**
 * 관리자 API 요청 시 항상 최신 Firebase ID 토큰을 사용하고,
 * 만료(401) 발생 시 강제 갱신(getIdToken(true)) 후 1회 자동 재시도하는 래퍼
 */
export async function adminFetch(
  url: string,
  init: RequestInit = {},
  fallbackToken?: string
): Promise<Response> {
  const token = (await auth.currentUser?.getIdToken()) || fallbackToken || "";
  const buildHeaders = (t: string) => {
    const h = new Headers(init.headers);
    if (t) h.set("Authorization", `Bearer ${t}`);
    return h;
  };

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  if (res.status === 401 && auth.currentUser) {
    try {
      const refreshedToken = await auth.currentUser.getIdToken(true);
      res = await fetch(url, { ...init, headers: buildHeaders(refreshedToken) });
    } catch (e) {
      console.error("[adminFetch] Token force-refresh failed:", e);
    }
  }
  return res;
}

export { auth, db, googleProvider, storage }; // 🔥 export에 storage가 있는지 확인
