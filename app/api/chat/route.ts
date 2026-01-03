import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; 
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) throw new Error("API Key missing");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    if (action === "chat") {
      const audioFile = formData.get("audio") as Blob;
      const historyStr = formData.get("history") as string;
      const persona = formData.get("persona") as string;
      const history = JSON.parse(historyStr || "[]");

      if (!audioFile) return NextResponse.json({ error: "No audio" }, { status: 400 });

      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      const personaConfig = persona === 'min' 
        ? { name: '민철', style: '활기차고 에너지 넘치는' }
        : { name: '수경', style: '차분하고 상냥한' };

      const systemPrompt = `
        당신은 한국어 학습자의 친구 '${personaConfig.name}'입니다.
        성격: ${personaConfig.style}.
        
        [수행 역할]
        1. **STT (받아쓰기)**: 사용자의 오디오를 듣고 한국어 텍스트로 적으세요. 오타는 표준어로 보정하세요.
        2. **대화하기**: 보정된 내용을 바탕으로 자연스럽게 대답하세요. (사용자의 말을 보고 반말과 존댓말 중에서 선택하여 대답)
        
        [종료 규칙]
        - 상대방이 단답을 2회 이상 하거나 의미 없는 소리를 내면 대화를 종료하세요(ended: true).

        [출력 포맷 (JSON Only)]
        {
          "userTranscript": "사용자 말 (보정됨)",
          "aiResponse": "AI 답변",
          "ended": true/false
        }
      `;

      let chatContext = history.map((msg: any) => `${msg.role === 'user' ? '사용자' : personaConfig.name}: ${msg.text}`).join("\n");
      
      const result = await model.generateContent([
          systemPrompt,
          `[이전 대화]\n${chatContext}\n\n[현재 사용자 오디오]`,
          { inlineData: { mimeType: "audio/webm", data: base64Audio } }
      ]);

      const responseText = result.response.text().replace(/```json|```/g, "").trim();
      const aiData = JSON.parse(responseText);

      let audioContent = null;
      const voiceName = persona === 'min' ? "ko-KR-Chirp3-HD-Rasalgethi" : "ko-KR-Chirp3-HD-Zephyr";
      
      try {
          const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              input: { text: aiData.aiResponse },
              voice: { languageCode: "ko-KR", name: voiceName },
              audioConfig: { audioEncoding: "MP3" }
          })
          });
          const ttsData = await ttsRes.json();
          audioContent = ttsData.audioContent;
      } catch (e) { console.error("TTS Fail", e); }

      return NextResponse.json({ 
          userText: aiData.userTranscript || "(소리 인식 실패)", 
          aiText: aiData.aiResponse,       
          ended: aiData.ended,
          audioContent: audioContent       
      });
    }

    if (action === "feedback") {
        const historyStr = formData.get("history") as string;
        const history = JSON.parse(historyStr || "[]");
        const feedbackPrompt = `
            당신은 한국어 교육 전문가입니다. 아래 대화를 분석해 JSON으로 답하세요.
            [대화] ${history.map((m:any)=>m.text).join("\n")}
            [출력] {"pronunciation":"...", "intonation":"...", "general":"..."}
        `;
        const result = await model.generateContent(feedbackPrompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        return NextResponse.json(JSON.parse(text));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}