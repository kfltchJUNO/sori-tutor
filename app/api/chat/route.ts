import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; 
    
    // 🔥 [중요] API 키 분리 및 우선순위 설정
    // 1. Gemini용 키 (AI 응답 생성)
    const geminiApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    // 2. TTS용 키 (음성 생성 - 별도 키가 없으면 Gemini 키 시도)
    const ttsApiKey = process.env.GOOGLE_TTS_API_KEY || geminiApiKey;

    if (!geminiApiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    // 🔥 사용자 검증 완료된 2.5 Flash 모델 사용
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // --- [기능 1] 프리토킹 대화 (STT + Chat + TTS) ---
    if (action === "chat") {
      const audioFile = formData.get("audio") as Blob;
      const historyStr = formData.get("history") as string;
      const persona = formData.get("persona") as string;
      const history = JSON.parse(historyStr || "[]");

      if (!audioFile) return NextResponse.json({ error: "Audio missing" }, { status: 400 });

      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      const personaConfig = persona === 'min' 
        ? { name: '민철', style: '활기차고 에너지 넘치는' }
        : { name: '수경', style: '차분하고 상냥한' };

      const systemPrompt = `
        당신은 한국어 학습자의 친구 '${personaConfig.name}'입니다. (${personaConfig.style} 성격)
        
        [수행 역할]
        1. **STT**: 사용자의 오디오를 듣고 한국어 텍스트로 적으세요. 오타나 발음 실수는 **문맥에 맞게 표준어로 보정**하세요.
        2. **대화**: 보정된 내용을 바탕으로 자연스럽게 대답하세요. (반말 사용)
        
        [종료 규칙]
        - 상대방이 '응', '아니' 등 단답을 2회 이상 하거나 의미 없는 소리를 내면 대화를 정중히 종료하세요(ended: true).

        [출력 포맷 (JSON Only)]
        {
          "userTranscript": "보정된 사용자 발화",
          "aiResponse": "AI 답변",
          "ended": true/false
        }
      `;

      let chatContext = history.map((msg: any) => `${msg.role === 'user' ? '사용자' : personaConfig.name}: ${msg.text}`).join("\n");
      
      let aiData;
      try {
        const result = await model.generateContent([
            systemPrompt,
            `[이전 대화]\n${chatContext}\n\n[현재 사용자 오디오]`,
            { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ]);
        
        const responseText = result.response.text().replace(/```json|```/g, "").trim();
        aiData = JSON.parse(responseText);
      } catch (e) {
        console.error("Gemini Error:", e);
        return NextResponse.json({ error: "AI가 소리를 인식하지 못했어요." }, { status: 500 });
      }

      // TTS 생성 (Google Cloud TTS) - ttsApiKey 사용
      let audioContent = null;
      const targetVoice = persona === 'min' ? "ko-KR-Neural2-C" : "ko-KR-Neural2-A";
      
      try {
          const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: { text: aiData.aiResponse },
                voice: { languageCode: "ko-KR", name: targetVoice },
                audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
            })
          });
          
          const ttsData = await ttsRes.json();
          if (ttsData.error) {
             console.error("TTS API Error:", ttsData.error);
          } else {
             audioContent = ttsData.audioContent;
          }
      } catch (e) { console.error("TTS Net Error", e); }

      return NextResponse.json({ 
          userText: aiData.userTranscript || "(소리를 인식하지 못했습니다)", 
          aiText: aiData.aiResponse,       
          ended: aiData.ended,
          audioContent: audioContent       
      });
    }

    // --- [기능 2] 종합 피드백 ---
    if (action === "feedback") {
        const historyStr = formData.get("history") as string;
        const history = JSON.parse(historyStr || "[]");
        
        try {
            const feedbackPrompt = `
                당신은 한국어 교육 전문가입니다. 아래 대화를 분석해 JSON으로 답하세요.
                [대화] ${history.map((m:any)=>m.text).join("\n")}
                [출력] {"pronunciation":"발음 평가...", "intonation":"억양/감정 평가...", "general":"총평..."}
            `;
            const result = await model.generateContent(feedbackPrompt);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            return NextResponse.json(JSON.parse(text));
        } catch (e: any) {
            return NextResponse.json({ error: "피드백 생성 실패" }, { status: 500 });
        }
    }

    // --- [기능 3] 🔥 번역 (Translate) ---
    if (action === "translate") {
        const text = formData.get("text") as string;
        if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

        try {
            const result = await model.generateContent(`
                Translate the following Korean text to English.
                Keep the tone helpful and educational.
                Text: "${text}"
            `);
            const translatedText = result.response.text();
            return NextResponse.json({ translatedText });
        } catch (e) {
            return NextResponse.json({ error: "Translation failed" }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Final Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}