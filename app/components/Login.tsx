// app/components/Login.tsx
"use client";

import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useState, useEffect } from "react";

export default function Login({ onUserChange }: { onUserChange: (user: any) => void }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // 로그인 상태 변화 감지
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkAndCreateUser(currentUser); // DB에 유저 정보 저장/확인
      }
      onUserChange(currentUser); // 부모 컴포넌트(page.tsx)에 유저 정보 전달
    });
    return () => unsubscribe();
  }, []);

  // 🔥 핵심: 로그인 시 DB에 'sori_users' 컬렉션으로 저장
  const checkAndCreateUser = async (user: any) => {
    const userRef = doc(db, "sori_users", user.email); // 이메일을 ID로 사용
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // 처음 온 사람 -> Guest 등급으로 생성
      await setDoc(userRef, {
        email: user.email,
        name: user.displayName,
        role: "guest",      // 기본 등급
        daily_usage: 0,     // 오늘 사용 횟수
        joined_at: serverTimestamp(),
      });
      console.log("새로운 유저 등록 완료!");
    } else {
        // 이미 있는 사람 -> 정보만 업데이트 (옵션)
        console.log("기존 유저 접속:", userSnap.data().role);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("로그인 실패:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <img src={user.photoURL} alt="프사" className="w-8 h-8 rounded-full" />
        <span className="text-sm font-medium text-gray-700 hidden sm:inline">
          {user.displayName}님
        </span>
        <button 
          onClick={handleLogout}
          className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded-full text-gray-600 transition-colors"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogin}
      className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
    >
      <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt="G" />
      구글로 시작하기
    </button>
  );
}