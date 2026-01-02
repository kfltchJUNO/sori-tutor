import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, role } = await req.json();
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY; // TTS도 같은 키 사용 가능 (Google Cloud 설정 필요)

    // 🔥 역할에 따라 목소리 자동 변경 (A: 여자, B: 남자)
    const voiceName = role === "A" ? "ko-KR-Neural2-A" : "ko-KR-Neural2-C";

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "ko-KR", name: voiceName },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // 오디오 데이터(Base64) 반환
    return NextResponse.json({ audioContent: data.audioContent });

  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}