import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, voiceName } = body;
    
    // 1. 새로 등록한 환경변수 사용
    const apiKey = process.env.GOOGLE_TTS_API_KEY;

    // --- [디버깅 로그] Vercel Logs에서 확인 가능 ---
    console.log("TTS 요청 시작:");
    console.log("- Voice:", voiceName);
    console.log("- Key 존재 여부:", apiKey ? `있음 (앞 4자리: ${apiKey.substring(0, 4)}...)` : "없음(Undefined)");
    // ---------------------------------------------

    if (!apiKey) {
      console.error("오류: 환경변수 GOOGLE_TTS_API_KEY가 없습니다.");
      return NextResponse.json({ error: "Server API Key Config Error" }, { status: 500 });
    }

    const targetVoice = voiceName || "ko-KR-Chirp3-HD-Kore";

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            // Referer 헤더는 아예 보내지 않습니다. (키 제한 '없음' 설정 필수)
        },
        body: JSON.stringify({
          input: { text },
          voice: { 
            languageCode: "ko-KR", 
            name: targetVoice 
          },
          audioConfig: { 
            audioEncoding: "MP3",
            speakingRate: 1.0 
          },
        }),
      }
    );

    const data = await response.json();

    // 구글이 거절했다면, 정확한 이유를 로그에 찍습니다.
    if (!response.ok || data.error) {
      console.error("🔥 Google API Error Detail:", JSON.stringify(data, null, 2));
      throw new Error(`Google Cloud Error: ${data.error?.message || "Unknown Error"} (Status: ${data.error?.status})`);
    }

    return NextResponse.json({ audioContent: data.audioContent });

  } catch (error: any) {
    console.error("🚨 TTS Route Critical Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}