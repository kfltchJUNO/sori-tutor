import useSWR from "swr";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

const fetchAll = async (colName: string) => {
  const snap = await getDocs(query(collection(db, colName), orderBy("category", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const fetchByCategory = async (colName: string, category: string) => {
  const snap = await getDocs(query(collection(db, colName), where("category", "==", category)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const fetchCategories = async (colName: string): Promise<string[]> => {
  const snap = await getDocs(collection(db, colName));
  const set = new Set<string>();
  snap.forEach((d) => set.add(d.data().category));
  return Array.from(set).sort();
};

export function useWords() {
  return useSWR("sori_curriculum_word", () => fetchAll("sori_curriculum_word"), { revalidateOnFocus: false, dedupingInterval: 300000 });
}

export function useSentenceCategories() {
  return useSWR("sori_curriculum_sentence/categories", () => fetchCategories("sori_curriculum_sentence"), { revalidateOnFocus: false, dedupingInterval: 300000 });
}

export function useSentencesByCategory(category: string | null) {
  return useSWR(category ? `sori_curriculum_sentence/${category}` : null, () => fetchByCategory("sori_curriculum_sentence", category!), { revalidateOnFocus: false, dedupingInterval: 300000 });
}

export function useDialogues() {
  return useSWR("sori_curriculum_dialogue", () => fetchAll("sori_curriculum_dialogue"), { revalidateOnFocus: false, dedupingInterval: 300000 });
}

export function useCurriculum(courseType: string | null, category: string | null = null) {
  const words = useWords();
  const sentenceCategories = useSentenceCategories();
  const sentences = useSentencesByCategory(courseType === "sentence" ? category : null);
  const dialogues = useDialogues();

  if (courseType === "word") return { data: words.data ?? [], isLoading: words.isLoading, error: words.error };
  if (courseType === "sentence" && !category) return { data: [], categories: sentenceCategories.data ?? [], isLoading: sentenceCategories.isLoading, error: sentenceCategories.error };
  if (courseType === "sentence" && category) return { data: sentences.data ?? [], isLoading: sentences.isLoading, error: sentences.error };
  if (courseType === "dialogue") return { data: dialogues.data ?? [], isLoading: dialogues.isLoading, error: dialogues.error };
  return { data: [], isLoading: false };
}