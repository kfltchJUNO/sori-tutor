import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { resolveEmotionForV4 } from "@/lib/elevenlabsVoices";
import { getNextGeminiApiKey, getGeminiKeyList } from "@/lib/geminiKeyPool";

// ── 고성능 → 효율 → 속도 순 릴레이 (2026.06 기준 유효 모델) ─
const MODEL_CANDIDATES: string[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.8-flash",
];

const SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ── ElevenLabs 서킷 브레이커 & 정적 오디오 캐시 ───────────────
let elevenLabsTrippedUntil = 0;
const ELEVENLABS_COOLDOWN_MS = 30 * 60 * 1000; // 30분 쿨다운

function tripElevenLabs(reason: string) {
  elevenLabsTrippedUntil = Date.now() + ELEVENLABS_COOLDOWN_MS;
  console.warn(`🚨 [ElevenLabs 서킷 브레이커 작동] ${reason} -> 30분 동안 Gemini 무료 TTS로 즉시 우회합니다.`);
}

function canUseElevenLabs(): boolean {
  return Date.now() >= elevenLabsTrippedUntil;
}

// 인사말 등 동일 텍스트 오디오 인메모리 캐시 (API 호출 0회 재사용)
const GREETING_AUDIO_CACHE = new Map<string, string>();

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

// ── Gemini startChat history 규격 정규화 헬퍼 ─────────────────
// 1) 첫 번째 메시지는 반드시 role: "user"여야 함 (model 인사말로 시작 시 user 시작 턴 삽입)
// 2) 연속된 같은 role 메시지는 하나로 병합
// 3) 마지막 메시지가 user일 경우 startChat 에러 방지를 위해 model 응답 보정
function sanitizeGeminiHistory(
  rawHistory: Array<{ role: string; text?: string; parts?: Array<{ text: string }> }>
): Array<{ role: "user" | "model"; parts: [{ text: string }] }> {
  const contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];

  for (const item of rawHistory) {
    const role: "user" | "model" = item.role === "model" ? "model" : "user";
    const text = (item.text || item.parts?.[0]?.text || "").trim();
    if (!text) continue;

    if (contents.length === 0) {
      if (role === "model") {
        contents.push({ role: "user", parts: [{ text: "대화를 시작합니다." }] });
      }
      contents.push({ role, parts: [{ text }] });
    } else {
      const last = contents[contents.length - 1];
      if (last.role === role) {
        last.parts[0].text += "\n" + text;
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }
  }

  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    contents.push({ role: "model", parts: [{ text: "네, 말씀하세요." }] });
  }

  return contents;
}

// ── 특수문자 제거 및 자연스러운 호흡(쉼표·휴지) 보정 (TTS용) ────
function cleanTextForTTS(text: string, isClonedVoice = false): string {
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

  // 2. 말줄임표(...)는 클론 보이스에서 환각 발화를 유발할 수 있으므로 일반 마침표로 정리
  s = s.replace(/\.{2,}|…/g, ".");
  if (isClonedVoice) {
    s = s.replace(/!+/g, ".");
  }

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

  // 0. 정적/동적 캐시 확인 (인사말 등 반복 문장 0ms 즉시 반환, API 호출 0회)
  const cacheKey = `${personaId || "default"}_${cleaned}`;
  if (GREETING_AUDIO_CACHE.has(cacheKey)) {
    return GREETING_AUDIO_CACHE.get(cacheKey)!;
  }

  let synthesizedBase64: string | null = null;

  // 1. ElevenLabs API 시도 (서킷 브레이커가 정상일 때만 호출)
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey && elevenKey !== "your_elevenlabs_api_key_here" && canUseElevenLabs()) {
    try {
      const PERSONA_ELEVENLABS_VOICES: Record<string, string> = {
        junho: "3lMatKOyHfWflJwj08H6",   // 남성 준호 (높임말)
        minwoo: "DAYXNdDncOaX81nsqMvp",  // 남성 민우 (반말)
        chaewon: "mTVOetWowFUodP946PJM", // 여성 채원 (높임말)
        yujin: "EsM6qKItauOb9XNGEb9g",   // 여성 유진 (반말)
      };
      const targetVoice = (personaId && PERSONA_ELEVENLABS_VOICES[personaId]) || "3lMatKOyHfWflJwj08H6";
      const isClonedVoice = targetVoice === "3lMatKOyHfWflJwj08H6";
      const textForEl = cleanTextForTTS(text, isClonedVoice);
      const { tag, stability } = resolveEmotionForV4(textForEl, "auto", undefined, isClonedVoice);
      const v4Text = tag ? `${tag} ${textForEl}` : textForEl;

      // 1-A. ElevenLabs v4 시도 (mp3_22050_32 포맷으로 속도 40% 향상 및 3.5초 타임아웃)
      const v4Abort = new AbortController();
      const v4Timer = setTimeout(() => v4Abort.abort(), 3500);
      let v4Res: Response | null = null;
      try {
        v4Res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_22050_32`, {
          method: "POST",
          signal: v4Abort.signal,
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: v4Text,
            model_id: "eleven_v4",
            voice_settings: {
              stability,
              similarity_boost: isClonedVoice ? 0.75 : 0.8,
              use_speaker_boost: true,
            },
          }),
        });
      } finally {
        clearTimeout(v4Timer);
      }

      if (v4Res && v4Res.ok) {
        const buf = await v4Res.arrayBuffer();
        synthesizedBase64 = Buffer.from(buf).toString("base64");
      } else if (v4Res && (v4Res.status === 401 || v4Res.status === 429)) {
        tripElevenLabs(`HTTP ${v4Res.status}`);
      } else {
        // 1-B. eleven_v4 실패 시 eleven_multilingual_v2 폴백 ([tag] 제거본 사용)
        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: textForEl,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: isClonedVoice ? 0.75 : 0.65,
              similarity_boost: isClonedVoice ? 0.75 : 0.8,
              style: 0.0,
              speed: 0.92,
            },
          }),
        });

        if (elRes.ok) {
          const buf = await elRes.arrayBuffer();
          synthesizedBase64 = Buffer.from(buf).toString("base64");
        } else if (elRes.status === 401 || elRes.status === 429) {
          tripElevenLabs(`HTTP ${elRes.status}`);
        } else {
          console.warn(`ElevenLabs TTS 실패 (${elRes.status}), Gemini 무료 TTS로 폴백합니다.`);
        }
      }
    } catch (e: any) {
      console.warn("ElevenLabs TTS 호출 오류 (서킷 브레이커 발동):", e?.message || e);
      tripElevenLabs("Network Error");
    }
  }

  // 2. Gemini API 무료 TTS 폴백 (멀티 키 로테이션 지원)
  if (!synthesizedBase64) {
    const geminiKey = getNextGeminiApiKey();
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
              const buf = Buffer.from(inlineData.data, "base64");
              if (buf.slice(0, 4).toString("utf-8") === "RIFF") {
                synthesizedBase64 = inlineData.data;
              } else {
                synthesizedBase64 = pcm16ToWavBase64(inlineData.data, 24000);
              }
              break;
            }
          }
        } catch (e) {
          console.warn(`Gemini TTS [${ttsModel}] 폴백 오류:`, e);
        }
      }
    }
  }

  // 3. Google Cloud TTS 시도 (올바른 GOOGLE_TTS_API_KEY 사용)
  if (!synthesizedBase64) {
    const googleTtsKey = process.env.GOOGLE_TTS_API_KEY || getNextGeminiApiKey();
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
          synthesizedBase64 = ttsData.audioContent;
        }
      } catch (e) {
        console.error("Google TTS 호출 오류:", e);
      }
    }
  }

  // 성공 시 140자 이하의 짧은 문장/인사말은 캐시에 보관하여 무제한 재사용
  if (synthesizedBase64 && cleaned.length < 140) {
    GREETING_AUDIO_CACHE.set(cacheKey, synthesizedBase64);
  }

  return synthesizedBase64;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string;

    const apiKey = getNextGeminiApiKey();
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
      let userText = (formData.get("userText") as string) || (formData.get("text") as string) || "";

      // STT — 릴레이 모델 및 멀티 키 로테이션으로 음성 인식
      if (audioFile && audioFile.size > 0) {
        const base64Audio = Buffer.from(await audioFile.arrayBuffer()).toString("base64");
        // application/octet-stream 등 비표준 MIME 방지 (Gemini 400 에러 원천 차단)
        const mimeType = audioFile.type && audioFile.type.startsWith("audio/")
          ? audioFile.type
          : "audio/webm";

        const keys = getGeminiKeyList();
        let sttDone = false;
        for (let attempt = 0; attempt < Math.max(1, keys.length) && !sttDone; attempt++) {
          const currentKey = keys[attempt] || apiKey;
          const currentGenAI = new GoogleGenerativeAI(currentKey);
          for (const modelName of MODEL_CANDIDATES) {
            try {
              const sttModel = currentGenAI.getGenerativeModel({ model: modelName, safetySettings: SAFETY });
              const sttResult = await sttModel.generateContent([
                "Transcribe exactly what the user said in Korean. Output only the transcribed text without quotes or explanations. If inaudible or silence, output '(침묵)'.",
                { inlineData: { mimeType, data: base64Audio } },
              ]);
              const recognized = sttResult.response.text().trim();
              if (recognized) {
                userText = recognized;
                console.log(`✅ STT [${modelName}]: "${userText}"`);
                sttDone = true;
                break;
              }
            } catch (e: any) {
              const errMsg = e?.message || String(e);
              console.warn(`⚠️ STT [${modelName}] 실패:`, errMsg.substring(0, 80));
              if (errMsg.includes("429") || errMsg.includes("quota")) break;
            }
          }
        }
      }

      const isSilentOrInaudible = !userText || userText === "(침묵)" || userText === "(잡음)";
      const promptUserText = isSilentOrInaudible
        ? "(사용자의 음성이 작거나 인식되지 않았습니다. 자연스럽게 목소리가 잘 안 들렸으니 다시 말씀해달라고 답하세요.)"
        : userText;

      // AI 응답 생성 — 페르소나별 맞춤 프롬프트 (준호/채원: 높임말 연습, 민우/유진: 반말 연습)
      const isHonorific = personaId === "junho" || personaId === "chaewon" || !personaId;
      const personaName =
        personaId === "chaewon" ? "채원" :
        personaId === "minwoo" ? "민우" :
        personaId === "yujin" ? "유진" : "준호";

      const systemPrompt = isHonorific
        ? `[Role]: You are '${personaName}', a polite, warm, and professional Korean mentor/interviewer/senior helping a foreign learner practice formal & polite Korean (높임말 연습: 면접, 비즈니스, 윗사람과의 대화).
[Tone]: Polite and formal modern Korean (정중한 현대 높임말: 하십시오체 '-습니다/-습니까' 및 예의 바른 해요체 '-해요/-어요'). NEVER use casual banmal (반말) and NEVER use old-fashioned/awkward endings like '~하네'(알겠네), '~하게'(다녀오게), '~하오'.
[Guidelines & Brevity Constraint]:
1. [Length Constraint - CRITICAL]: Respond strictly in 1~2 short, natural sentences (under 40-50 Korean characters total). NEVER write long explanations, multiple paragraphs, or lecture-style text. Keep it punchy and quick for real-time voice chat.
2. Respond with warmth, respect, and encouragement suitable for an interview, workplace, or conversation with a senior/professor.
3. Always use natural commas (,) after greetings or interjections and clear sentence-ending punctuation (., ?, !) so TTS speaks with natural breathing pauses.
4. If the learner accidentally uses casual speech (반말) or awkward honorifics, gently model the natural honorific expression while keeping the conversation flowing.
5. If the user speech is inaudible or silent, gently ask them in polite Korean to repeat once more.
6. Always ask exactly ONE polite, engaging follow-up question so the learner can continue practicing honorific Korean.
7. Do NOT use markdown bold(**) or markdown symbols (your text goes directly to TTS).
[User Memory]: ${sharedMemory}`
        : `[Role]: You are '${personaName}', a close, warm, and cheerful same-age Korean friend (20대 동갑내기 절친) helping a foreign learner practice casual Korean (반말 연습: 친구와의 일상 대화).
[Tone]: Friendly, natural modern casual Korean (친근한 현대 20대 반말: '-어/-아', '-야', '-지', '-거든', '-잖아'). NEVER use formal/polite endings ('-요', '-습니다') and NEVER use old-fashioned/middle-aged endings like '~하네'(알겠네, 고맙네), '~하게'(다녀오게, 잘 지내게), '~구먼'.
[Guidelines & Brevity Constraint]:
1. [Length Constraint - CRITICAL]: Respond strictly in 1~2 short, natural sentences (under 40-50 Korean characters total). NEVER write long explanations, multiple paragraphs, or lecture-style text. Keep it punchy and quick for real-time voice chat.
2. React actively with empathy and excitement like a real 20s best friend (e.g., "아, 진짜? 대박이다!", "그랬구나, 많이 힘들었겠다.").
3. Always use natural commas (,) after interjections ("아, ", "응, ", "맞아, ") and clear sentence-ending punctuation (., ?, !) so TTS speaks with natural breathing pauses.
4. If the learner speaks too formally ('-요', '-습니다'), playfully remind them that you are close friends and encourage them to speak comfortably in banmal (반말).
5. If the user speech is inaudible or silent, playfully ask them in casual banmal to repeat once more.
6. Always ask exactly ONE fun, natural follow-up question in banmal so the learner feels comfortable continuing the chat.
7. Do NOT use markdown bold(**) or markdown symbols (your text goes directly to TTS).
[User Memory]: ${sharedMemory}`;

      let aiText = "";
      let usedModel = "";
      const sanitizedHistory = sanitizeGeminiHistory(history);
      const keys = getGeminiKeyList();

      for (let attempt = 0; attempt < Math.max(1, keys.length) && !aiText; attempt++) {
        const currentKey = keys[attempt] || apiKey;
        const currentGenAI = new GoogleGenerativeAI(currentKey);

        for (const modelName of MODEL_CANDIDATES) {
          try {
            const model = currentGenAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemPrompt,
              safetySettings: SAFETY,
              generationConfig: {
                maxOutputTokens: 120, // 40~50자 단답형으로 생성 시간 60% 단축
                temperature: 0.7,
              },
            });
            const chat = model.startChat({ history: sanitizedHistory });
            const result = await chat.sendMessage(promptUserText);
            aiText     = result.response.text().trim();
            usedModel  = modelName;
            break;
          } catch (e: any) {
            const errMsg = e?.message || String(e);
            console.warn(`⚠️ Chat [${modelName}] 실패:`, errMsg.substring(0, 80));
            if (errMsg.includes("429") || errMsg.includes("quota")) break;
          }
        }
      }
      if (!aiText) throw new Error("All models failed to generate response.");

      // TTS
      const audioContent = await synthesizeTTS(aiText, personaId);

      return NextResponse.json({
        userText: isSilentOrInaudible ? "(음성 인식 안 됨)" : userText,
        aiText,
        audioContent,
        usedModel,
        ended: false,
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