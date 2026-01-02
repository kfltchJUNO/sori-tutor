import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, voiceName } = await req.json();
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    // 안전장치: 혹시라도 voiceName이 없으면 가장 무난한 'Kore' 사용
    const targetVoice = voiceName || "ko-KR-Chirp3-HD-Kore";

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            // 배포된 도메인 주소로 변경 필요할 수 있음 (로컬은 localhost:3000)
            "Referer": "http://localhost:3000" 
        },
        body: JSON.stringify({
          input: { text },
          voice: { 
            languageCode: "ko-KR", 
            name: targetVoice // 선택한 성우 ID (예: ko-KR-Chirp3-HD-Pulcherrima)
          },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return NextResponse.json({ audioContent: data.audioContent });

  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}