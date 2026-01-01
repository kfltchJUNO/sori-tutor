"use client";

import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useState, useEffect } from "react";

export default function Login({ onUserChange }: { onUserChange: (user: any) => void }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      onUserChange(u);
    });
    return () => unsubscribe();
  }, [onUserChange]);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // 사용자 DB 저장 로직 (기존과 동일)
      const userRef = doc(db, "sori_users", user.email!);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          name: user.displayName,
          role: 'guest',
          free_hearts: 3,
          tokens: 0,
          joined_at: serverTimestamp(),
          error_count: 0, 
          analysis_count: 0,
          streak: 0,
          today_count: 0
        });
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (user) {
    return (
      <button onClick={handleLogout} className="text-xs text-gray-500 underline ml-2">
        로그아웃
      </button>
    );
  }

  return (
    // 🔥 [수정됨] w-full과 flex, justify-center를 줘서 무조건 중앙에 오게 함
    <div className="w-full flex justify-center mt-4">
      <button
        onClick={handleLogin}
        className="flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-full font-bold shadow-sm hover:bg-gray-50 transition w-full max-w-xs"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
        <span>구글로 시작하기</span>
      </button>
    </div>
  );
}