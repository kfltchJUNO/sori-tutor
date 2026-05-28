// hooks/useFeedbackVoices.ts
// 점수대별 멘트 MP3 URL을 Firestore에서 가져와 캐싱
import useSWR from "swr";
import type { ScoreTier } from "@/lib/scoreSound";

type VoiceMap = Partial<Record<ScoreTier, string>>;

const fetcher = async (): Promise<VoiceMap> => {
  const res = await fetch("/api/admin/feedback-audio");
  if (!res.ok) return {};
  return res.json();
};

export function useFeedbackVoices() {
  const { data } = useSWR<VoiceMap>("feedback-voices", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000, // 10분 캐시
  });
  return data ?? {};
}