import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; 
    
    // 환경변수 체크 (TTS용 키와 Gemini용 키 공용 사용 가정)
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // --- [기능 1] 대화 진행 (STT + Chat Generation) ---
    if (action === "chat") {
      const audioFile = formData.get("audio") as Blob;
      const historyStr = formData.get("history") as string;
      const history = JSON.parse(historyStr || "[]");

      if (!audioFile) return NextResponse.json({ error: "No audio" }, { status: 400 });

      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      // 시스템 프롬프트: 페르소나 + STT(보정) + 응답 생성
      const systemPrompt = `
        당신은 한국어 학습자의 친한 한국인 친구 '지민'입니다.
        
        [수행 역할 2가지]
        1. **STT (받아쓰기 및 보정)**: 사용자의 오디오를 듣고 한국어 텍스트로 변환하세요. 이때, 오타나 심한 사투리, 부정확한 발음이 있다면 **문맥에 맞는 표준어 문법으로 보정**해서 적으세요. (예: "하꾜 가써" -> "학교에 갔어")
        2. **대화하기**: 위에서 변환된 내용을 바탕으로 '지민'이가 되어 대답하세요.
           - 주제: 첫 만남, 자기소개, 취미 등 가벼운 주제.
           - 태도: 친절하고 밝은 반말(해라체/해요체 혼용 가능). 공감해주고 질문을 던져 대화를 이어가세요.
        
        [종료 규칙]
        - 상대방이 '응', '아니', '그래' 등 성의 없는 단답을 연속 2회 이상 하거나, 
        - 의미 없는 소리만 낸다면,
        - "대화를 이어나가기 힘든 것 같네. 다음에 다시 이야기하자! 안녕!" 이라고 작별 인사를 하고 ended: true를 반환하세요.

        [출력 포맷 (JSON Only)]
        반드시 JSON 형식만 출력하세요. Markdown block 없이.
        {
          "userTranscript": "보정된 사용자 발화 텍스트",
          "aiResponse": "지민이의 답변 텍스트",
          "ended": true/false
        }
      `;

      // 대화 맥락 생성 (이전 대화 기억)
      let chatContext = history.map((msg: any) => `${msg.role === 'user' ? '상대방' : '지민'}: ${msg.text}`).join("\n");
      
      const result = await model.generateContent([
        systemPrompt,
        `[이전 대화 기록]\n${chatContext}\n\n[현재 사용자의 오디오 입력]`,
        { inlineData: { mimeType: "audio/webm", data: base64Audio } }
      ]);

      const responseText = result.response.text().replace(/```json|```/g, "").trim();
      let aiData;
      try {
        aiData = JSON.parse(responseText);
      } catch (e) {
        console.error("JSON Parse Error", responseText);
        aiData = { userTranscript: "(인식 불가)", aiResponse: "미안해, 잘 못 들었어. 다시 말해줄래?", ended: false };
      }

      // AI 답변을 TTS로 변환 (Google Cloud TTS API)
      let audioContent = null;
      try {
        const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: aiData.aiResponse },
            voice: { languageCode: "ko-KR", name: "ko-KR-Chirp3-HD-Puck" }, // 지민이 목소리
            audioConfig: { audioEncoding: "MP3" }
          })
        });
        const ttsData = await ttsRes.json();
        audioContent = ttsData.audioContent;
      } catch (e) { console.error("TTS Fail", e); }

      return NextResponse.json({ 
        userText: aiData.userTranscript, // 보정된 사용자 말
        aiText: aiData.aiResponse,       // AI 답변
        ended: aiData.ended,
        audioContent: audioContent       // AI 음성 (Base64)
      });
    }

    // --- [기능 2] 최종 피드백 생성 ---
    if (action === "feedback") {
      const historyStr = formData.get("history") as string;
      const history = JSON.parse(historyStr || "[]");

      const feedbackPrompt = `
        당신은 한국어 교육 전문가입니다. 아래 대화 기록을 분석해 피드백을 주세요.

        [대화 기록]
        ${history.map((msg: any) => `${msg.role}: ${msg.text}`).join("\n")}

        [분석 항목]
        1. **발음 및 어휘**: 사용자의 표현이 자연스러웠는지, 수정된 부분이 있다면 언급.
        2. **억양과 감정**: 상황(친한 친구와의 첫 만남)에 어울리는 억양이었는지 추론.
        3. **총평**: 더 자연스러운 대화를 위한 팁.

        [출력 포맷 (JSON)]
        {
          "pronunciation": "평가 내용...",
          "intonation": "평가 내용...",
          "general": "총평..."
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