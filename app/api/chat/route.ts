import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 특수문자 제거 함수 (AI가 마크다운을 뱉을 때 읽지 않도록)
function cleanTextForTTS(text: string) {
  return text
    .replace(/\*\*/g, "")   // 볼드체 제거
    .replace(/\*/g, "")     // 기울임 제거
    .replace(/__/g, "")     // 밑줄 제거
    .replace(/`/g, "")      // 코드블럭 제거
    .replace(/-/g, " ")     // 하이픈 제거
    .trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string;
    
    // 2. API 키 로드 (Gemini용 + TTS용 공용 사용)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const ttsApiKey = process.env.GOOGLE_TTS_API_KEY || apiKey; 

    if (!apiKey) {
      return NextResponse.json({ error: "API Key Error: 환경변수를 확인해주세요." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // ==========================================
    // 1. [단순 TTS] (관리자 페이지 & 단어/문장 학습용)
    // ==========================================
    if (action === "tts_simple") {
      const text = formData.get("text") as string;
      const voiceName = formData.get("voiceName") as string || "ko-KR-Chirp3-HD-Zephyr";

      if (!text) return NextResponse.json({ error: "No text provided" });

      const cleanText = cleanTextForTTS(text);

      // 라이브러리 대신 fetch 사용 (오류 해결 핵심)
      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`,
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
        console.error("TTS API Error:", ttsData.error);
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
      // 최신 모델 사용 (gemini-2.0-flash 권장, 없으면 1.5-flash)
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

      let userText = "";

      // 2-1. STT (오디오 -> 텍스트)
      if (audioFile) {
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        
        const sttResult = await model.generateContent([
          "Transcribe exactly what the user said in Korean.",
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);
        userText = sttResult.response.text();
      }

      // 2-2. 페르소나 정의 (기능 복원)
      const personaSystemPrompts: any = {
        su: "너는 활발한 20대 대학생 '수경'이야. 반말로 친근하게 대화해. 이모티콘을 적절히 사용해.",
        min: "너는 감성적인 30대 카페 사장 '민철'이야. 존댓말로 부드럽게 대화해.",
        jin: "너는 깐깐한 대기업 부장 '진성'이야. 논리적이고 직설적으로 말해.",
        seol: "너는 K-POP과 드라마를 사랑하는 '설아'야. 텐션이 높고 유행어를 써.",
        do: "너는 에너지 넘치는 헬스 트레이너 '도식'이야. 동기부여를 주는 말을 많이 해.",
        ju: "너는 한국 여행 가이드 '주호'야. 한국의 명소와 역사에 대해 친절하게 설명해.",
        hye: "너는 따뜻한 심리 상담사 '혜선'이야. 상대방의 말에 공감하고 위로해줘.",
        woo: "너는 축구와 게임을 좋아하는 중학생 '우주'야. 호기심이 많고 장난기 있어.",
        hyun: "너는 시니컬하지만 지적인 소설가 '현성'이야. 문학적인 표현을 종종 써.",
        sun: "너는 구수한 사투리를 쓰는 국밥집 할머니 '순자'야. 정이 많고 밥 먹었냐고 물어봐.",
        default: "너는 친절한 한국어 튜터야."
      };

      const systemPrompt = `
        ${personaSystemPrompts[personaId] || personaSystemPrompts.default}
        [기억 정보]: ${sharedMemory}
        [규칙]: 답변은 한국어로 2~3문장 이내로 짧게. **절대로 마크다운 볼드체(**)를 쓰지 마.**
      `;

      const chat = model.startChat({
        history: history.map((h: any) => ({
          role: h.role,
          parts: [{ text: h.text }]
        })),
      });

      // 2-3. AI 답변 생성
      const result = await chat.sendMessage(`${systemPrompt}\n\nUser said: ${userText}`);
      const aiText = result.response.text();

      // 2-4. AI 음성 생성 (TTS - fetch 방식)
      const cleanAiText = cleanTextForTTS(aiText);

      // 페르소나별 목소리 매핑 (기능 복원)
      const voices: Record<string, string> = {
        su: "ko-KR-Chirp3-HD-Zephyr",
        min: "ko-KR-Chirp3-HD-Rasalgethi",
        jin: "ko-KR-Chirp3-HD-Algenib",
        seol: "ko-KR-Chirp3-HD-Despina",
        do: "ko-KR-Chirp3-HD-Achird",
        ju: "ko-KR-Chirp3-HD-Sadachbia",
        hye: "ko-KR-Chirp3-HD-Aoede",
        woo: "ko-KR-Chirp3-HD-Charon",
        hyun: "ko-KR-Chirp3-HD-Zubenelgenubi",
        sun: "ko-KR-Chirp3-HD-Vindemiatrix",
      };
      const voiceName = voices[personaId] || "ko-KR-Chirp3-HD-Zephyr";

      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`,
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
        ended: false
      });
    }

    // ==========================================
    // 3. [피드백 생성]
    // ==========================================
    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        다음 대화 내용을 분석해서 한국어 학습자를 위한 피드백을 JSON으로 줘.
        대화 내용: ${historyStr}
        JSON 형식: {"pronunciation": "...", "intonation": "...", "general": "..."}
      `;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      return NextResponse.json(JSON.parse(text));
    }

    // ==========================================
    // 4. [번역]
    // ==========================================
    if (action === "translate") {
      const text = formData.get("text") as string;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`Translate to English:\n${text}`);
      return NextResponse.json({ translatedText: result.response.text() });
    }

    // ==========================================
    // 5. [기억 동기화]
    // ==========================================
    if (action === "memory_sync") {
       const currentMemory = formData.get("currentMemory") as string;
       const newDialog = formData.get("newDialog") as string;
       const mode = formData.get("mode") as string;
       
       const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
       let prompt = "";
       if (mode === 'compress') prompt = `Update summary. Current: ${currentMemory}\nNew: ${newDialog}`;
       else prompt = `Extract facts from: ${newDialog}`;
       
       const result = await model.generateContent(prompt);
       return NextResponse.json({ summary: result.response.text() });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}