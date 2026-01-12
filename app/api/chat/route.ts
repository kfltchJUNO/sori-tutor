import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// 🔥 [핵심] 특수문자/마크다운 제거 함수 (별표별표 소리 방지)
function cleanTextForTTS(text: string) {
  return text
    .replace(/\*\*/g, "")   // 굵게(**) 제거
    .replace(/\*/g, "")     // 기울임(*) 제거
    .replace(/__/g, "")     // 밑줄(__) 제거
    .replace(/`/g, "")      // 코드 블록(`) 제거
    .replace(/-/g, " ")     // 하이픈(-) 제거 (필요 시)
    .trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string;
    
    // 환경 변수 확인
    const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON; // Vercel용 JSON 환경변수

    if (!apiKey) return NextResponse.json({ error: "API Key Error" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 구글 TTS 클라이언트 설정
    // (로컬에서는 keyFile 경로, 배포 환경에서는 credentials JSON 파싱)
    const ttsClient = new TextToSpeechClient(
        googleCreds ? { credentials: JSON.parse(googleCreds) } : {}
    );

    // ==========================================
    // 1. [TTS 단순 변환] (tts_simple)
    // ==========================================
    if (action === "tts_simple") {
      const text = formData.get("text") as string;
      const voiceName = formData.get("voiceName") as string || "ko-KR-Chirp3-HD-Zephyr";

      if (!text) return NextResponse.json({ error: "No text" });

      // 🔥 TTS 변환 전 텍스트 세탁
      const cleanText = cleanTextForTTS(text);

      const request = {
        input: { text: cleanText },
        voice: { languageCode: "ko-KR", name: voiceName },
        audioConfig: { audioEncoding: "MP3" as const, speakingRate: 1.0 },
      };

      const [response] = await ttsClient.synthesizeSpeech(request);
      const audioContent = response.audioContent?.toString("base64");

      return NextResponse.json({ audioContent });
    }

    // ==========================================
    // 2. [자유 회화] (chat)
    // ==========================================
    if (action === "chat") {
      const historyStr = formData.get("history") as string;
      const personaId = formData.get("persona") as string;
      const sharedMemory = formData.get("sharedMemory") as string || "";
      const audioFile = formData.get("audio") as Blob;

      const history = JSON.parse(historyStr || "[]");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // 최신 모델 사용 권장

      let userText = "";

      // 2-1. 사용자 오디오 STT (Speech-to-Text)
      // (오디오가 있으면 Gemini 멀티모달로 텍스트 변환, 없으면 텍스트 입력 가정)
      if (audioFile) {
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        
        // STT 전용 프롬프트
        const sttResult = await model.generateContent([
          "Transcribe exactly what the user said in Korean.",
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);
        userText = sttResult.response.text();
      }

      // 2-2. AI 응답 생성
      // 페르소나 설정 (간략 예시)
      const personaSystemPrompts: any = {
        su: "너는 활발한 20대 대학생 '수경'이야. 반말로 친근하게 대화해. 이모티콘을 적절히 사용해.",
        min: "너는 감성적인 30대 카페 사장 '민철'이야. 존댓말로 부드럽게 대화해.",
        jin: "너는 깐깐한 대기업 부장 '진성'이야. 논리적이고 직설적으로 말해.",
        // ... (나머지 페르소나도 필요 시 추가)
        default: "너는 친절한 한국어 튜터야."
      };
      
      const systemPrompt = `
        ${personaSystemPrompts[personaId] || personaSystemPrompts.default}
        
        [기억 정보]
        ${sharedMemory}

        [대화 규칙]
        1. 답변은 한국어로 2~3문장 이내로 간결하게 해줘.
        2. **절대로 마크다운 볼드체(**)를 사용하지 마.** (중요)
        3. 상대방의 말을 잘 듣고 자연스럽게 이어가줘.
      `;

      const chat = model.startChat({
        history: history.map((h: any) => ({
          role: h.role,
          parts: [{ text: h.text }]
        })),
        generationConfig: { maxOutputTokens: 300 },
      });

      // 시스템 프롬프트 주입 (꼼수: 첫 턴에 instruction으로 넣거나 systemInstruction 옵션 사용 가능)
      // 여기서는 메시지에 포함해서 보냄
      const finalPrompt = `${systemPrompt}\n\n사용자 메시지: ${userText}`;
      const result = await chat.sendMessage(finalPrompt);
      const aiText = result.response.text();

      // 2-3. AI 응답 TTS 변환
      // 🔥 여기서도 한 번 더 텍스트 세탁 (AI가 혹시라도 **를 썼을까봐)
      const cleanAiText = cleanTextForTTS(aiText);

      // 페르소나별 목소리 매핑
      const voices: any = {
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

      const ttsRequest = {
        input: { text: cleanAiText }, // 세탁된 텍스트 사용
        voice: { languageCode: "ko-KR", name: voiceName },
        audioConfig: { audioEncoding: "MP3" as const, speakingRate: 1.0 },
      };

      const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
      const audioContent = ttsResponse.audioContent?.toString("base64");

      return NextResponse.json({
        userText,
        aiText, // 화면에는 원래 텍스트(이모티콘 등 포함) 보여줌
        audioContent, // 소리는 세탁된 텍스트로 나옴
      });
    }

    // ==========================================
    // 3. [피드백 생성] (feedback)
    // ==========================================
    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const prompt = `
        다음 대화 내용을 분석해서 한국어 학습자를 위한 피드백을 JSON으로 줘.
        대화 내용: ${historyStr}
        
        형식:
        {
          "pronunciation": "발음/어휘 피드백",
          "intonation": "억양/감정 피드백",
          "general": "총평 및 조언"
        }
      `;
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      return NextResponse.json(JSON.parse(text));
    }

    // ==========================================
    // 4. [번역] (translate)
    // ==========================================
    if (action === "translate") {
      const text = formData.get("text") as string;
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const result = await model.generateContent(`Translate this Korean text to English naturally:\n\n${text}`);
      return NextResponse.json({ translatedText: result.response.text() });
    }

    // ==========================================
    // 5. [기억 동기화] (memory_sync)
    // ==========================================
    if (action === "memory_sync") {
       const currentMemory = formData.get("currentMemory") as string;
       const newDialog = formData.get("newDialog") as string;
       const mode = formData.get("mode") as string;
       
       const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
       let prompt = "";
       
       if (mode === 'compress') {
           prompt = `Update the user summary based on the new dialog. Keep it concise.\nCurrent: ${currentMemory}\nNew Dialog: ${newDialog}`;
       } else {
           prompt = `Extract key facts about the user from this dialog to append to memory. If none, say "정보 없음".\nDialog: ${newDialog}`;
       }
       
       const result = await model.generateContent(prompt);
       return NextResponse.json({ summary: result.response.text() });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}