import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 모델 후보군 (Fallback 로직용)
const MODEL_CANDIDATES = [
  "gemini-2.0-flash",
  "gemini-2.5-flash", 
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash"
];

// 특수문자 제거 함수
function cleanTextForTTS(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/-/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string;
    
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY; 
    if (!apiKey) return NextResponse.json({ error: "API Key Error" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);

    // ==========================================
    // 🆕 [기능 추가] 단어 정의 (Dictionary)
    // ==========================================
    if (action === "define") {
        const word = formData.get("word") as string;
        const context = formData.get("context") as string; // 문맥 정보

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        // 문맥을 고려하여 단어의 뜻을 한국어와 영어로 설명
        const prompt = `
          Define the word "${word}" based on this context: "${context}".
          Output JSON only:
          {
            "word": "${word}",
            "meaning_kr": "Definition in Korean (easy to understand)",
            "meaning_en": "Definition in English",
            "example": "A short example sentence using the word"
          }
        `;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        return NextResponse.json(JSON.parse(text));
    }

    // ==========================================
    // 1. [TTS 단순 변환]
    // ==========================================
    if (action === "tts_simple") {
      const text = formData.get("text") as string;
      const voiceName = formData.get("voiceName") as string || "ko-KR-Chirp3-HD-Zephyr";

      if (!text) return NextResponse.json({ error: "No text provided" });
      const cleanText = cleanTextForTTS(text);

      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanText },
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

    // ==========================================
    // 2. [자유 회화] (Chat + STT + TTS)
    // ==========================================
    if (action === "chat") {
      const historyStr = formData.get("history") as string;
      const personaId = formData.get("persona") as string;
      const sharedMemory = formData.get("sharedMemory") as string || "";
      const audioFile = formData.get("audio") as Blob;

      const history = JSON.parse(historyStr || "[]");
      let userText = "";

      // 2-1. STT (오디오 -> 텍스트)
      if (audioFile) {
        // STT 모델은 1.5-flash가 가장 빠르고 안정적
        const sttModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        
        const sttResult = await sttModel.generateContent([
          "Transcribe exactly what the user said in Korean.",
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);
        userText = sttResult.response.text();
      }

      // 2-2. AI 응답 생성 (Fallback 로직 적용)
      let aiText = "";
      let usedModel = "";
      
      const systemPrompt = `
        [Role]: You are a Korean conversation partner.
        [Persona]: ${personaId}
        [Memory]: ${sharedMemory}
        [Rule]: Respond naturally in Korean (1-3 sentences). Do NOT use markdown bold(**).
      `;

      for (const modelName of MODEL_CANDIDATES) {
          try {
              const model = genAI.getGenerativeModel({ model: modelName });
              const chat = model.startChat({
                  history: history.map((h: any) => ({
                      role: h.role,
                      parts: [{ text: h.text }]
                  })),
              });
              const result = await chat.sendMessage(`${systemPrompt}\n\nUser said: ${userText}`);
              aiText = result.response.text();
              usedModel = modelName;
              break; // 성공 시 탈출
          } catch (e) {
              console.warn(`Model ${modelName} failed, trying next...`);
              continue;
          }
      }

      if (!aiText) throw new Error("All models failed to generate response.");

      // 2-3. TTS 생성
      const cleanAiText = cleanTextForTTS(aiText);
      const voices: Record<string, string> = {
        su: "ko-KR-Chirp3-HD-Zephyr", min: "ko-KR-Chirp3-HD-Rasalgethi",
        jin: "ko-KR-Chirp3-HD-Algenib", seol: "ko-KR-Chirp3-HD-Despina",
        do: "ko-KR-Chirp3-HD-Achird", ju: "ko-KR-Chirp3-HD-Sadachbia",
        hye: "ko-KR-Chirp3-HD-Aoede", woo: "ko-KR-Chirp3-HD-Charon",
        hyun: "ko-KR-Chirp3-HD-Zubenelgenubi", sun: "ko-KR-Chirp3-HD-Vindemiatrix",
      };
      const voiceName = voices[personaId] || "ko-KR-Chirp3-HD-Zephyr";

      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanAiText },
            voice: { languageCode: "ko-KR", name: voiceName },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
        }
      );

      const ttsData = await ttsResponse.json();

      return NextResponse.json({
        userText,
        aiText,
        audioContent: ttsData.audioContent,
        usedModel,
        ended: false
      });
    }

    // ==========================================
    // 3. [피드백/번역/메모리]
    // ==========================================
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const result = await model.generateContent(`Analyze Korean conversation (JSON: pronunciation, intonation, general):\n${historyStr}`);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      return NextResponse.json(JSON.parse(text));
    }

    if (action === "translate") {
      const text = formData.get("text") as string;
      const result = await model.generateContent(`Translate to English:\n${text}`);
      return NextResponse.json({ translatedText: result.response.text() });
    }

    if (action === "memory_sync") {
       const newDialog = formData.get("newDialog") as string;
       const result = await model.generateContent(`Summarize for memory:\n${newDialog}`);
       return NextResponse.json({ summary: result.response.text() });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}