// hooks/useFeedbackVoices.ts
import useSWR from "swr";

type ScoreTier = "perfect" | "great" | "good" | "okay" | "fail" | "silence";
type VoiceMap = Partial<Record<ScoreTier, string>>;

const fetcher = async (): Promise<VoiceMap> => {
  const res = await fetch("/api/admin/feedback-audio");
  if (!res.ok) return {};
  return res.json();
};

export function useFeedbackVoices() {
  const { data } = useSWR<VoiceMap>("feedback-voices", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });
  return data ?? {};
}