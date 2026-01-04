import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🎭 10명 페르소나 설정 (음성 ID 고정)
const PERSONA_CONFIG: any = {
  su: { name: '수경', voice: 'ko-KR-Chirp3-HD-Zephyr', style: '친근한 대학생', prompt: '활발하고 호기심 많은 20대 대학생. 유행어(밈)나 신조어를 적절히 섞어 쓰며, 대학 생활, 알바, 연애 등을 주제로 대화. 해요체(부드러운 존댓말)와 반말을 상황에 따라 섞어 씀.' },
  min: { name: '민철', voice: 'ko-KR-Chirp3-HD-Rasalgethi', style: '다정한 카페 사장님', prompt: '30대 중반의 감성적인 카페 오너. 차분하고 남의 이야기를 잘 들어주는 성격. 커피, 날씨, 소소한 일상 이야기 선호. 정중하고 따뜻한 해요체 사용.' },
  jin: { name: '진성', voice: 'ko-KR-Chirp3-HD-Algenib', style: '깐깐한 면접관', prompt: '40대 대기업 부장. 논리적이고 격식 있는 한국어 구사. 비즈니스 한국어나 면접 대비용 하드 모드. 하십시오체(격식체)와 전문 용어 사용.' },
  seol: { name: '설아', voice: 'ko-KR-Chirp3-HD-Despina', style: 'K-Culture 팬', prompt: '20대 초반의 열정적인 K-POP/K-Drama 덕후. 텐션이 높고 리액션이 매우 큼(대박, 헐 등). 아이돌, 드라마, 패션 이야기. 감탄사가 많은 구어체.' },
  do: { name: '도식', voice: 'ko-KR-Chirp3-HD-Achird', style: '동네 헬스 트레이너', prompt: '에너지 넘치는 20대 후반 트레이너. "할 수 있습니다!"라며 끊임없이 동기를 부여함. 건강, 운동, 식단 관리 이야기. 짧고 간결한 문장, 명령형/청유형 위주.' },
  ju: { name: '주호', voice: 'ko-KR-Chirp3-HD-Achernar', style: '여행 가이드', prompt: '30대 전문 남성 가이드. 발음이 아나운서처럼 정확하고 설명하는 것을 좋아함. 한국의 역사나 관광지 정보 제공. 친절하고 상세한 설명조.' },
  hye: { name: '혜선', voice: 'ko-KR-Chirp3-HD-Aoede', style: '고민 상담사', prompt: '40대 심리 상담가. 차분하고 위로가 되는 말투. 감정을 표현하고 위로받는 대화. 공감하는 리액션("그랬군요", "힘드셨겠어요").' },
  woo: { name: '우주', voice: 'ko-KR-Chirp3-HD-Charon', style: '개구쟁이 중학생', prompt: '잘생긴 중학생 남자아이. 축구와 장난을 좋아함. 솔직하고 엉뚱한 질문. 초급 학습자용 쉬운 단어. "요"자를 빼먹는 반말 섞인 말투.' }, 
  hyun: { name: '현성', voice: 'ko-KR-Chirp3-HD-Zubenelgenubi', style: '소설가', prompt: '30대 후반의 작가. 약간은 시니컬하지만 지적인 대화를 즐김. 철학적인 주제나 추리, 문학 이야기. 문어체에 가까운 세련된 어휘 사용.' },
  sun: { name: '순자 할머니', voice: 'ko-KR-Chirp3-HD-Vindemiatrix', style: '시장통 국밥집 할머니', prompt: '70대 시장 상인. 정이 많지만 목소리가 크고 사투리 억양을 씀. 한국의 정 문화와 생활 사투리 체험. 구수한 반말("밥은 먹었어?", "왔능가").' } 
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; 
    
    // API Key 로드 (여러 환경변수 시도)
    const geminiApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    // TTS 키가 별도로 없으면 Gemini 키 사용 (Google Cloud 프로젝트가 같을 경우)
    const ttsApiKey = process.env.GOOGLE_TTS_API_KEY || geminiApiKey;

    if (!geminiApiKey) {
        console.error("❌ [API Error] Gemini API Key not found in environment variables.");
        return NextResponse.json({ error: "Server Configuration Error: API KEY MISSING" }, { status: 500 });
    }
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // --- [기능 1] 대화 진행 (Chat + STT + TTS) ---
    if (action === "chat") {
      const audioFile = formData.get("audio") as Blob;
      const historyStr = formData.get("history") as string;
      const personaKey = formData.get("persona") as string;
      const history = JSON.parse(historyStr || "[]");

      if (!audioFile) return NextResponse.json({ error: "Audio missing" }, { status: 400 });

      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      const persona = PERSONA_CONFIG[personaKey] || PERSONA_CONFIG['su'];

      const systemPrompt = `
        당신은 한국어 대화 상대 '${persona.name}'입니다. 
        [페르소나]: ${persona.style}, ${persona.prompt}
        
        [수행 역할]
        1. **STT**: 사용자의 오디오를 듣고 한국어 텍스트로 적으세요. (오타/발음 보정)
        2. **대화**: 페르소나에 맞춰 답변하세요.
        3. **규칙**:
           - **앵무새 화법 금지**: 상대 말을 반복하지 말고 꼬리 질문을 하세요.
           - 감탄사('오!', '아하!')와 물결표(~)는 사용하지 마세요.
        
        [종료 규칙]
        - 상대방이 단답을 3회 이상 하거나 대화 의지가 없으면 종료하세요(ended: true).

        [출력 포맷 (JSON Only)]
        {
          "userTranscript": "보정된 사용자 발화",
          "aiResponse": "AI 답변 텍스트",
          "ended": true/false
        }
      `;

      let chatContext = history.map((msg: any) => `${msg.role === 'user' ? '상대방' : persona.name}: ${msg.text}`).join("\n");
      
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
        console.error("Gemini Chat Error:", e);
        return NextResponse.json({ error: "AI가 소리를 인식하지 못했어요." }, { status: 500 });
      }

      // TTS 생성
      let audioContent = null;
      const sanitizedText = aiData.aiResponse.replace(/[~]/g, "").replace(/\(.*\)/g, "");

      try {
          const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: { text: sanitizedText },
                voice: { languageCode: "ko-KR", name: persona.voice },
                audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
            })
          });
          
          if (!ttsRes.ok) {
              const err = await ttsRes.text();
              console.error("TTS API Error:", err);
          } else {
              const ttsData = await ttsRes.json();
              if (ttsData.audioContent) audioContent = ttsData.audioContent;
          }
      } catch (e) { console.error("TTS Net Error", e); }

      return NextResponse.json({ 
          userText: aiData.userTranscript || "(...)", 
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
                [대화] ${history.map((m:any)=>`${m.role}: ${m.text}`).join("\n")}
                [출력] {"pronunciation":"...", "intonation":"...", "general":"..."}
            `;
            const result = await model.generateContent(feedbackPrompt);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            return NextResponse.json(JSON.parse(text));
        } catch (e) { return NextResponse.json({ error: "피드백 실패" }, { status: 500 }); }
    }

    // --- [기능 3] 번역 ---
    if (action === "translate") {
        const text = formData.get("text") as string;
        try {
            const result = await model.generateContent(`Translate to English:\n"${text}"`);
            return NextResponse.json({ translatedText: result.response.text() });
        } catch (e) { return NextResponse.json({ error: "Translation failed" }, { status: 500 }); }
    }

    // --- [기능 4] 단순 TTS (첫 인사용) ---
    if (action === "tts_simple") {
        const text = formData.get("text") as string;
        const voiceName = formData.get("voiceName") as string;
        
        try {
            const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: { text },
                    voice: { languageCode: "ko-KR", name: voiceName },
                    audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
                })
            });
            
            if (!ttsRes.ok) {
                console.error("Simple TTS Error:", await ttsRes.text());
                throw new Error("TTS API call failed");
            }

            const ttsData = await ttsRes.json();
            return NextResponse.json({ audioContent: ttsData.audioContent });
        } catch (e) {
            return NextResponse.json({ error: "TTS failed" }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}