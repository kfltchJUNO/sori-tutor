import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ── 고성능 → 효율 → 속도 순 릴레이 (2026.06 기준 유효 모델) ─
const MODEL_CANDIDATES: string[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
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

// ── 특수문자 제거 및 자연스러운 호흡(쉼표·휴지) 보정 (TTS용) ────
function cleanTextForTTS(text: string): string {
  let s = text
    .replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/__/g, "").replace(/`/g, "")
    .replace(/-/g, " ").trim();
  if (!s) return "";

  // 1. 문두 감탄사/인사말 뒤에 쉼표가 없으면 쉼표 추가
  s = s.replace(
    /^(네|아니요|아|음|어|저기요|잠시만요|안녕하세요|반갑습니다|감사합니다|고마워요|고마워|죄송합니다|미안해요|미안해|맞아요|맞아|진짜요|진짜|그래요|그래|안녕)\s+(?=[가-힣])/u,
    "$1, "
  );

  // 2. 문장과 문장 사이에 짧은 호흡 휴지(...) 추가
  s = s.replace(/([.?!])\s+(?=[가-힣A-Za-z0-9])/g, "$1 ... ");

  // 3. 문장 끝 마침표 보정
  if (!/[.?!~]$/.test(s)) {
    s += ".";
  }
  return s;
}

// ── 16-bit 24kHz PCM → WAV 변환 헬퍼 (Gemini TTS 출력용) ─────
function pcm16ToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  const pcmBuf = Buffer.from(pcmBase64, "base64");
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuf.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuf]).toString("base64");
}

// ── TTS 합성 헬퍼 (1순위: ElevenLabs → 2순위: Gemini 무료 TTS → 3순위: Google Cloud TTS) ────
async function synthesizeTTS(text: string, personaId?: string, voiceName?: string): Promise<string | null> {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return null;

  // 1. ElevenLabs API 시도 (1순위)
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey && elevenKey !== "your_elevenlabs_api_key_here") {
    try {
      const PERSONA_ELEVENLABS_VOICES: Record<string, string> = {
        junho: "3lMatKOyHfWflJwj08H6",   // 남성 준호 (높임말)
        minwoo: "DAYXNdDncOaX81nsqMvp",  // 남성 민우 (반말)
        chaewon: "mTVOetWowFUodP946PJM", // 여성 채원 (높임말)
        yujin: "EsM6qKItauOb9XNGEb9g",   // 여성 유진 (반말)
      };
      const targetVoice = (personaId && PERSONA_ELEVENLABS_VOICES[personaId]) || "3lMatKOyHfWflJwj08H6";

      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleaned,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.65, similarity_boost: 0.8, speed: 0.92 },
        }),
      });

      if (elRes.ok) {
        const buf = await elRes.arrayBuffer();
        return Buffer.from(buf).toString("base64");
      } else {
        console.warn(`ElevenLabs TTS 한도 초과 또는 실패 (${elRes.status}), Gemini 무료 TTS로 폴백합니다.`);
      }
    } catch (e) {
      console.warn("ElevenLabs TTS 호출 오류 (Gemini TTS로 폴백):", e);
    }
  }

  // 2. Gemini API 무료 TTS 폴백 (GOOGLE_API_KEY만으로 무료 한도 내에서 작동)
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (geminiKey) {
    const GEMINI_TTS_MODELS = [
      "gemini-3.8-flash-lite-tts",
      "gemini-3.8-flash-tts",
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
    ];
    const GEMINI_PERSONA_VOICES: Record<string, string> = {
      junho: "Charon",  // 남성 차분한 톤
      minwoo: "Puck",   // 남성 밝은 톤
      chaewon: "Kore",  // 여성 단정한 톤
      yujin: "Aoede",   // 여성 친근한 톤
    };
    const geminiVoice = (personaId && GEMINI_PERSONA_VOICES[personaId]) || "Charon";

    for (const ttsModel of GEMINI_TTS_MODELS) {
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: cleaned }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: geminiVoice },
                  },
                },
              },
            }),
          }
        );
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          const inlineData = gemData?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (inlineData?.data) {
            return pcm16ToWavBase64(inlineData.data, 24000);
          }
        }
      } catch (e) {
        console.warn(`Gemini TTS [${ttsModel}] 폴백 오류:`, e);
      }
    }
  }

  // 2. Google Cloud TTS 시도 (올바른 GOOGLE_TTS_API_KEY 사용)
  const googleTtsKey = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY;
  if (googleTtsKey) {
    try {
      const VOICES: Record<string, string> = {
        su: "ko-KR-Chirp3-HD-Zephyr", min: "ko-KR-Chirp3-HD-Rasalgethi",
        jin: "ko-KR-Chirp3-HD-Algenib", seol: "ko-KR-Chirp3-HD-Despina",
        do: "ko-KR-Chirp3-HD-Achird", ju: "ko-KR-Chirp3-HD-Sadachbia",
        hye: "ko-KR-Chirp3-HD-Aoede", woo: "ko-KR-Chirp3-HD-Charon",
        hyun: "ko-KR-Chirp3-HD-Zubenelgenubi", sun: "ko-KR-Chirp3-HD-Vindemiatrix",
      };
      const targetVoice = voiceName || (personaId && VOICES[personaId]) || "ko-KR-Chirp3-HD-Zephyr";

      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleaned },
            voice: { languageCode: "ko-KR", name: targetVoice },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
        }
      );
      const ttsData = await ttsResponse.json();
      if (ttsResponse.ok && ttsData.audioContent) {
        return ttsData.audioContent;
      }
    } catch (e) {
      console.error("Google TTS 호출 오류:", e);
    }
  }

  return null;
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
      const personaId = (formData.get("personaId") as string) || undefined;
      if (!text) return NextResponse.json({ error: "No text provided" });

      const audioContent = await synthesizeTTS(text, personaId, voiceName);
      if (!audioContent) {
        return NextResponse.json({ error: "TTS Failed" }, { status: 500 });
      }
      return NextResponse.json({ audioContent });
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

      // AI 응답 생성 — 페르소나별 맞춤 프롬프트 (준호/채원: 높임말 연습, 민우/유진: 반말 연습)
      const isHonorific = personaId === "junho" || personaId === "chaewon" || !personaId;
      const personaName =
        personaId === "chaewon" ? "채원" :
        personaId === "minwoo" ? "민우" :
        personaId === "yujin" ? "유진" : "준호";

      const systemPrompt = isHonorific
        ? `[Role]: You are '${personaName}', a polite, warm, and professional Korean mentor/interviewer/senior helping a foreign learner practice formal & polite Korean (높임말 연습: 면접, 비즈니스, 윗사람과의 대화).
[Tone]: Polite and formal modern Korean (정중한 현대 높임말: 하십시오체 '-습니다/-습니까' 및 예의 바른 해요체 '-해요/-어요'). NEVER use casual banmal (반말) and NEVER use old-fashioned/awkward endings like '~하네'(알겠네), '~하게'(다녀오게), '~하오'.
[Guidelines]:
1. Respond with warmth, respect, and encouragement suitable for an interview, workplace, or conversation with a senior/professor.
2. Keep responses natural and concise (1-3 sentences).
3. Always use natural commas (,) after greetings or interjections and clear sentence-ending punctuation (., ?, !) so TTS speaks with natural breathing pauses.
4. If the learner accidentally uses casual speech (반말) or awkward honorifics, gently model the natural honorific expression while keeping the conversation flowing.
5. Always ask a polite, engaging follow-up question so the learner can continue practicing honorific Korean.
6. Do NOT use markdown bold(**) or markdown symbols (your text goes directly to TTS).
[User Memory]: ${sharedMemory}`
        : `[Role]: You are '${personaName}', a close, warm, and cheerful same-age Korean friend (20대 동갑내기 절친) helping a foreign learner practice casual Korean (반말 연습: 친구와의 일상 대화).
[Tone]: Friendly, natural modern casual Korean (친근한 현대 20대 반말: '-어/-아', '-야', '-지', '-거든', '-잖아'). NEVER use formal/polite endings ('-요', '-습니다') and NEVER use old-fashioned/middle-aged endings like '~하네'(알겠네, 고맙네), '~하게'(다녀오게, 잘 지내게), '~구먼'.
[Guidelines]:
1. React actively with empathy and excitement like a real 20s best friend (e.g., "아, 진짜? 대박이다!", "그랬구나, 많이 힘들었겠다.").
2. Keep responses natural and concise (1-3 sentences).
3. Always use natural commas (,) after interjections ("아, ", "응, ", "맞아, ") and clear sentence-ending punctuation (., ?, !) so TTS speaks with natural breathing pauses.
4. If the learner speaks too formally ('-요', '-습니다'), playfully remind them that you are close friends and encourage them to speak comfortably in banmal (반말).
5. Always ask a fun, natural follow-up question in banmal so the learner feels comfortable continuing the chat.
6. Do NOT use markdown bold(**) or markdown symbols (your text goes directly to TTS).
[User Memory]: ${sharedMemory}`;

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
      const audioContent = await synthesizeTTS(aiText, personaId);

      return NextResponse.json({
        userText, aiText,
        audioContent,
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