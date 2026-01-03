import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; // 'chat' or 'feedback'
    
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // --- [기능 1] 대화 진행 (Chat Turn) ---
    if (action === "chat") {
      const audioFile = formData.get("audio") as Blob;
      const historyStr = formData.get("history") as string; // 이전 대화 내용 JSON
      const history = JSON.parse(historyStr || "[]");

      if (!audioFile) return NextResponse.json({ error: "No audio" }, { status: 400 });

      // 오디오 변환
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      // 페르소나 및 룰 설정
      const systemPrompt = `
        당신은 한국어 학습자의 친한 한국인 친구 '지민'입니다.
        
        [상황]
        - 주제: 첫 만남과 자기소개
        - 태도: 밝고 친절하며, 상대방의 말에 공감하고 꼬리 질문을 하여 대화를 이어나가세요. 반말을 사용하세요.
        
        [종료 규칙 (매우 중요)]
        - 상대방이 '응', '아니', '그래' 등 성의 없는 단답형 대답을 연속 2회 이상 하거나, 
        - 의미 없는 소리만 낸다면,
        - "대화를 이어나가기 힘든 것 같네. 다음에 다시 이야기하자! 안녕!" 이라고 작별 인사를 하고 대화를 끝내세요.

        [출력 포맷 (JSON Only)]
        {
          "text": "지민이의 답변 텍스트",
          "ended": true/false (대화 종료 여부)
        }
      `;

      // 이전 대화 기록을 프롬프트에 포함 (Context 유지)
      let chatContext = history.map((msg: any) => `${msg.role === 'user' ? '상대방' : '지민'}: ${msg.text}`).join("\n");
      
      const result = await model.generateContent([
        systemPrompt,
        `[이전 대화 기록]\n${chatContext}\n\n[상대방의 현재 발화 (오디오 분석)]`,
        { inlineData: { mimeType: "audio/webm", data: base64Audio } }
      ]);

      const responseText = result.response.text().replace(/```json|```/g, "").trim();
      const aiResponse = JSON.parse(responseText);

      // AI 답변을 TTS로 변환 (Google TTS API 재사용)
      // *실제 서비스에선 별도 함수로 분리 권장
      let audioContent = null;
      try {
        const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: aiResponse.text },
            voice: { languageCode: "ko-KR", name: "ko-KR-Chirp3-HD-Puck" }, // 지민이는 밝은 목소리(Puck)
            audioConfig: { audioEncoding: "MP3" }
          })
        });
        const ttsData = await ttsRes.json();
        audioContent = ttsData.audioContent;
      } catch (e) { console.error("TTS Fail", e); }

      return NextResponse.json({ 
        text: aiResponse.text, 
        ended: aiResponse.ended,
        audioContent: audioContent
      });
    }

    // --- [기능 2] 최종 피드백 생성 (Feedback) ---
    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const history = JSON.parse(historyStr || "[]");

      const feedbackPrompt = `
        당신은 한국어 교육 전문가입니다. 아래는 외국인 학습자와 AI(지민)의 대화 기록입니다.
        전체적인 대화를 분석하여 피드백을 제공해주세요.

        [대화 기록]
        ${history.map((msg: any) => `${msg.role}: ${msg.text}`).join("\n")}

        [분석 항목]
        1. **발음 및 전달력**: 전반적으로 발음이 정확했는지, 알아듣기 힘든 부분이 있었는지 평가.
        2. **억양과 감정**: 상황(첫 만남)에 어울리는 억양과 감정을 사용했는지.
        3. **총평 및 조언**: 더 자연스러운 대화를 위한 팁.

        [출력 포맷 (JSON)]
        {
          "pronunciation": "발음 평가 내용...",
          "intonation": "억양 및 감정 평가 내용...",
          "general": "총평 및 조언..."
        }
      `;

      const result = await model.generateContent(feedbackPrompt);
      const responseText = result.response.text().replace(/```json|```/g, "").trim();
      return NextResponse.json(JSON.parse(responseText));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}