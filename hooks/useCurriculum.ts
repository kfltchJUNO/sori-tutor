// hooks/useCurriculum.ts
// SWR로 커리큘럼 캐싱 — 세션 내 Firestore 중복 호출 제거
import useSWR from "swr";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import type { WordItem, SentenceItem, DialogueItem, CourseType } from "@/types";

// Firestore fetcher (컬렉션 전체)
const fetchAll = async (colName: string) => {
  const snap = await getDocs(
    query(collection(db, colName), orderBy("category", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// 카테고리별 fetcher
const fetchByCategory = async (colName: string, category: string) => {
  const snap = await getDocs(
    query(collection(db, colName), where("category", "==", category))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// 카테고리 목록만 fetcher
const fetchCategories = async (colName: string): Promise<string[]> => {
  const snap = await getDocs(collection(db, colName));
  const set = new Set<string>();
  snap.forEach((d) => set.add(d.data().category));
  return Array.from(set).sort();
};

// ── 단어 전체 ──────────────────────────────
export function useWords() {
  return useSWR<WordItem[]>(
    "sori_curriculum_word",
    () => fetchAll("sori_curriculum_word") as Promise<WordItem[]>,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 } // 5분 캐시
  );
}

// ── 문장 카테고리 목록 ──────────────────────
export function useSentenceCategories() {
  return useSWR<string[]>(
    "sori_curriculum_sentence/categories",
    () => fetchCategories("sori_curriculum_sentence"),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
}

// ── 문장 (카테고리별) ───────────────────────
export function useSentencesByCategory(category: string | null) {
  return useSWR<SentenceItem[]>(
    category ? `sori_curriculum_sentence/${category}` : null,
    () =>
      fetchByCategory("sori_curriculum_sentence", category!) as Promise<SentenceItem[]>,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
}

// ── 담화 전체 ──────────────────────────────
export function useDialogues() {
  return useSWR<DialogueItem[]>(
    "sori_curriculum_dialogue",
    () => fetchAll("sori_curriculum_dialogue") as Promise<DialogueItem[]>,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
}

// ── 통합 훅 (courseType 기반) ───────────────
export function useCurriculum(
  courseType: CourseType | null,
  category: string | null = null
) {
  const words = useWords();
  const sentenceCategories = useSentenceCategories();
  const sentences = useSentencesByCategory(
    courseType === "sentence" ? category : null
  );
  const dialogues = useDialogues();

  if (courseType === "word") {
    return { data: words.data ?? [], isLoading: words.isLoading, error: words.error };
  }
  if (courseType === "sentence" && !category) {
    return {
      data: [],
      categories: sentenceCategories.data ?? [],
      isLoading: sentenceCategories.isLoading,
      error: sentenceCategories.error,
    };
  }
  if (courseType === "sentence" && category) {
    return {
      data: sentences.data ?? [],
      isLoading: sentences.isLoading,
      error: sentences.error,
    };
  }
  if (courseType === "dialogue") {
    return {
      data: dialogues.data ?? [],
      isLoading: dialogues.isLoading,
      error: dialogues.error,
    };
  }
  return { data: [], isLoading: false };
}