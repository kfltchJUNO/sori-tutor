import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ── 고성능 → 효율 → 속도 순 릴레이 (2026.06 기준 유효 모델) ─
const MODEL_CANDIDATES: string[] = [
  "gemini-2.5-flash",       // 1순위: 가성비 최고, 오디오 지원
  "gemini-3.5-flash",       // 2순위: 준 Pro급 성능
  "gemini-3.1-flash-lite",  // 3순위: 빠름·저비용
  "gemini-2.5-flash-lite",  // 4순위: 최고속 폴백
];

const SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ── 릴레이 텍스트 생성 헬퍼 ─────────────────────────────────
async function generateWithFallback(
  genAI: GoogleGenerativeAI,
  prompt: string
): Promise<{ text: string; model: string }> {
  let lastError: unknown;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY });
      const result = await model.generateContent(prompt);
      return { text: result.response.text(), model: modelName };
    } catch (e) {
      console.warn(`⚠️ [${modelName}] 실패, 다음 모델로...`);
      lastError = e;
    }
  }
  throw lastError ?? new Error("All models failed");
}

// ── 특수문자 제거 (TTS용) ────────────────────────────────────
function cleanTextForTTS(text: string): string {
  return text
    .replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/__/g, "").replace(/`/g, "")
    .replace(/-/g, " ").trim();
}

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string;

    const apiKey = process.env.GOOGLE_API_KEY
      ?? process.env.GOOGLE_TTS_API_KEY
      ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key Error" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);

    // ── 단어 정의 ─────────────────────────────────────────────
    if (action === "define") {
      const word    = formData.get("word")    as string;
      const context = formData.get("context") as string;
      const prompt  = `Define the word "${word}" based on this context: "${context}".
Output JSON only (no markdown):
{"word":"${word}","meaning_kr":"뜻 (한국어)","meaning_en":"Definition in English","example":"Short example sentence"}`;
      const { text } = await generateWithFallback(genAI, prompt);
      return NextResponse.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
    }

    // ── TTS 단순 변환 ─────────────────────────────────────────
    if (action === "tts_simple") {
      const text      = formData.get("text")      as string;
      const voiceName = (formData.get("voiceName") as string) || "ko-KR-Chirp3-HD-Zephyr";
      if (!text) return NextResponse.json({ error: "No text provided" });

      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanTextForTTS(text) },
            voice: { languageCode: "ko-KR", name: voiceName },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
        }
      );
      const ttsData = await ttsResponse.json();
      if (!ttsResponse.ok || ttsData.error) {
        return NextResponse.json({ error: ttsData.error?.message || "TTS Failed" }, { status: 500 });
      }
      return NextResponse.json({ audioContent: ttsData.audioContent });
    }

    // ── 자유 회화 (Chat + STT + TTS) ──────────────────────────
    if (action === "chat") {
      const historyStr  = formData.get("history")     as string;
      const personaId   = formData.get("persona")     as string;
      const sharedMemory = (formData.get("sharedMemory") as string) || "";
      const audioFile   = formData.get("audio")       as Blob | null;

      const history = JSON.parse(historyStr || "[]");
      let userText = "";

      // STT — 릴레이 모델로 음성 인식
      if (audioFile) {
        const base64Audio = Buffer.from(await audioFile.arrayBuffer()).toString("base64");
        let lastErr: unknown;
        for (const modelName of MODEL_CANDIDATES) {
          try {
            const sttModel = genAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY });
            const sttResult = await sttModel.generateContent([
              "Transcribe exactly what the user said in Korean. Output only the transcribed text.",
              { inlineData: { mimeType: "audio/webm", data: base64Audio } },
            ]);
            userText = sttResult.response.text().trim();
            console.log(`✅ STT [${modelName}]: "${userText}"`);
            break;
          } catch (e) {
            console.warn(`⚠️ STT [${modelName}] 실패`);
            lastErr = e;
          }
        }
        if (!userText) throw lastErr ?? new Error("STT all models failed");
      }

      // AI 응답 생성 — 릴레이
      const systemPrompt = `[Role]: You are a Korean conversation partner.
[Persona]: ${personaId}
[Memory]: ${sharedMemory}
[Rule]: Respond naturally in Korean (1-3 sentences). Do NOT use markdown bold(**).`;

      let aiText = "";
      let usedModel = "";

      for (const modelName of MODEL_CANDIDATES) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY });
          const chat  = model.startChat({
            history: history.map((h: { role: string; text: string }) => ({
              role: h.role, parts: [{ text: h.text }],
            })),
          });
          const result = await chat.sendMessage(`${systemPrompt}\n\nUser said: ${userText}`);
          aiText     = result.response.text();
          usedModel  = modelName;
          break;
        } catch (e) {
          console.warn(`⚠️ Chat [${modelName}] 실패`);
        }
      }
      if (!aiText) throw new Error("All models failed to generate response.");

      // TTS
      const VOICES: Record<string, string> = {
        su: "ko-KR-Chirp3-HD-Zephyr", min: "ko-KR-Chirp3-HD-Rasalgethi",
        jin: "ko-KR-Chirp3-HD-Algenib", seol: "ko-KR-Chirp3-HD-Despina",
        do: "ko-KR-Chirp3-HD-Achird", ju: "ko-KR-Chirp3-HD-Sadachbia",
        hye: "ko-KR-Chirp3-HD-Aoede", woo: "ko-KR-Chirp3-HD-Charon",
        hyun: "ko-KR-Chirp3-HD-Zubenelgenubi", sun: "ko-KR-Chirp3-HD-Vindemiatrix",
      };
      const ttsRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanTextForTTS(aiText) },
            voice: { languageCode: "ko-KR", name: VOICES[personaId] ?? "ko-KR-Chirp3-HD-Zephyr" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
        }
      );
      const ttsData = await ttsRes.json();

      return NextResponse.json({
        userText, aiText,
        audioContent: ttsData.audioContent,
        usedModel, ended: false,
      });
    }

    // ── 피드백 / 번역 / 메모리 — 공통 릴레이 ─────────────────
    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const { text } = await generateWithFallback(genAI,
        `Analyze this Korean conversation and return JSON only (no markdown):\n{"pronunciation":"...","intonation":"...","general":"..."}\n\n${historyStr}`
      );
      return NextResponse.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
    }

    if (action === "translate") {
      const text = formData.get("text") as string;
      const { text: translated } = await generateWithFallback(genAI,
        `Translate the following to English naturally:\n${text}`
      );
      return NextResponse.json({ translatedText: translated });
    }

    if (action === "memory_sync") {
      const newDialog = formData.get("newDialog") as string;
      const { text: summary } = await generateWithFallback(genAI,
        `Summarize the key information from this conversation for memory in 2-3 sentences:\n${newDialog}`
      );
      return NextResponse.json({ summary });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: unknown) {
    console.error("API Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}