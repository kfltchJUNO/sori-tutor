"use client";
// app/components/LandingPage.tsx
// 애드센스 심사용 랜딩 페이지
// — 로그인 전 노출 (크롤러 인덱싱용)
// — 영어+한국어 병기
// — 실제 Firestore 데이터 미리보기

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";
import Login from "./Login";

interface WordPreview { id: string; text: string; pronunciation: string; tip: string; }
interface SentencePreview { id: string; text: string; translation: string; }

// ── 구글 폰트 인라인 로드 ───────────────────────────────────
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap";

export default function LandingPage({ onUserChange }: { onUserChange: (u: any) => void }) {
  const [words, setWords]         = useState<WordPreview[]>([]);
  const [sentences, setSentences] = useState<SentencePreview[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    // 폰트 로드
    const link = document.createElement("link");
    link.rel  = "stylesheet"; link.href = FONT_LINK;
    document.head.appendChild(link);

    // Firestore 미리보기 데이터
    (async () => {
      try {
        const [wSnap, sSnap] = await Promise.all([
          getDocs(query(collection(db, "sori_curriculum_word"), limit(4))),
          getDocs(query(collection(db, "sori_curriculum_sentence"), limit(3))),
        ]);
        setWords(wSnap.docs.map(d => ({ id: d.id, ...d.data() } as WordPreview)));
        setSentences(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as SentencePreview)));
      } catch { /* 데이터 없으면 샘플로 폴백 */ }
      setLoading(false);
    })();
  }, []);

  // 샘플 데이터 폴백
  const displayWords: WordPreview[] = words.length > 0 ? words : [
    { id: "1", text: "안녕하세요", pronunciation: "[an-nyeong-ha-se-yo]", tip: "ㅎ is aspirated — breathe out softly" },
    { id: "2", text: "감사합니다", pronunciation: "[gam-sa-ham-ni-da]", tip: "ㅂ→ㅁ assimilation before ㄴ" },
    { id: "3", text: "괜찮아요", pronunciation: "[gwaen-cha-na-yo]", tip: "ㅎ is silent between vowels" },
    { id: "4", text: "맛있어요", pronunciation: "[ma-si-sseo-yo]", tip: "연음: ㅅ links to the next syllable" },
  ];

  const displaySentences: SentencePreview[] = sentences.length > 0 ? sentences : [
    { id: "1", text: "오늘 날씨가 정말 좋네요.", translation: "The weather is really nice today." },
    { id: "2", text: "한국어 공부가 재미있어요.", translation: "Studying Korean is really fun." },
    { id: "3", text: "조금 더 천천히 말해 주세요.", translation: "Please speak a little more slowly." },
  ];

  const FEATURES = [
    { icon: "🎙️", en: "Real-Time Pronunciation AI", ko: "실시간 AI 발음 교정", desc: "Speak and get instant phoneme-level feedback powered by Google Gemini. Every consonant and vowel analyzed." },
    { icon: "🤖", en: "AI Conversation Partners", ko: "AI 대화 상대 10명", desc: "Chat with 10 unique Korean personas — a café owner, a university student, a novelist, and more." },
    { icon: "📚", en: "TOPIK-Aligned Curriculum", ko: "TOPIK 대비 커리큘럼", desc: "Step 1~8 covering TOPIK I through TOPIK II Level 6. Systematic vocabulary, sentences, and dialogues." },
    { icon: "🔊", en: "Native-Quality Audio", ko: "원어민 품질 음성", desc: "Google Chirp3-HD voices with optional teacher-recorded audio for the most natural pronunciation models." },
  ];

  const STEPS = [
    { n: "01", en: "Listen", ko: "듣기", desc: "Hear the target word or sentence with native-quality TTS audio." },
    { n: "02", en: "Speak", ko: "말하기", desc: "Record yourself. The AI captures exactly what you said — no autocorrect." },
    { n: "03", en: "Compare", ko: "비교", desc: "Jamo-level analysis shows exactly which sounds differ from native Korean." },
    { n: "04", en: "Improve", ko: "향상", desc: "Get specific advice on tongue position, aspiration, and intonation." },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: "#0f172a", background: "#fff", overflowX: "hidden" }}>

      {/* ── 네비 ──────────────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e2e8f0", padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>S</div>
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px" }}>Sori-Tutor</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: 20, border: "1px solid #bfdbfe" }}>소리튜터</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <a href="#features" style={{ fontSize: 14, fontWeight: 600, color: "#475569", textDecoration: "none" }}>Features</a>
            <a href="#preview" style={{ fontSize: 14, fontWeight: 600, color: "#475569", textDecoration: "none" }}>Preview</a>
            <a href="#how" style={{ fontSize: 14, fontWeight: 600, color: "#475569", textDecoration: "none" }}>How it works</a>
            <Login onUserChange={onUserChange} />
          </div>
        </div>
      </nav>

      {/* ── 히어로 ────────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(160deg, #eff6ff 0%, #fff 55%, #f0f9ff 100%)", padding: "96px 24px 80px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* 배경 장식 */}
        <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, background: "radial-gradient(circle, rgba(14,165,233,0.07) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#dbeafe", padding: "6px 16px", borderRadius: 999, marginBottom: 28 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>✨ Powered by Google Gemini AI</span>
          </div>

          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "clamp(2.4rem, 6vw, 4rem)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-1.5px", marginBottom: 12, color: "#0f172a" }}>
            Speak Korean Like<br />
            <span style={{ color: "#2563eb" }}>a Native Speaker</span>
          </h1>
          <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: "clamp(1.1rem, 3vw, 1.5rem)", color: "#334155", fontWeight: 400, marginBottom: 8 }}>
            원어민처럼 한국어를 말하세요
          </p>
          <p style={{ fontSize: 17, color: "#64748b", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.7 }}>
            AI analyzes your pronunciation at the phoneme level — every vowel, consonant, and intonation pattern — and gives you instant, actionable feedback.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ background: "#2563eb", borderRadius: 14, padding: "14px 32px", display: "inline-block" }}>
              <Login onUserChange={onUserChange} />
            </div>
            <a href="#preview" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", border: "2px solid #e2e8f0", borderRadius: 14, fontWeight: 700, fontSize: 15, color: "#334155", textDecoration: "none", background: "#fff" }}>
              See Sample Lessons →
            </a>
          </div>

          {/* 신뢰 지표 */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", marginTop: 48, flexWrap: "wrap" }}>
            {[["🌍", "Global Learners", "전 세계 학습자"], ["📊", "TOPIK I~II", "입문~6급"], ["🤖", "10 AI Personas", "AI 페르소나 10명"]].map(([icon, en, ko]) => (
              <div key={en} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{en}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{ko}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 핵심 기능 ─────────────────────────────────────────── */}
      <section id="features" style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Why Sori-Tutor</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 12 }}>
              Everything You Need to Master Korean Pronunciation
            </h2>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 15, color: "#64748b" }}>한국어 발음 완성을 위한 모든 것</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ padding: 28, borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#fafafa", transition: "all 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#93c5fd"; (e.currentTarget as HTMLDivElement).style.background = "#eff6ff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLDivElement).style.background = "#fafafa"; }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 2, color: "#0f172a" }}>{f.en}</h3>
                <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12, color: "#2563eb", fontWeight: 700, marginBottom: 10 }}>{f.ko}</p>
                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 오늘의 학습 미리보기 (실제 Firestore 데이터) ─────── */}
      <section id="preview" style={{ padding: "80px 24px", background: "linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Sample Content</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 8 }}>
              Today's Korean Lessons
            </h2>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 15, color: "#64748b" }}>오늘의 학습 미리보기</p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading curriculum data...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>

              {/* 단어 카드 */}
              <div style={{ background: "#fff", borderRadius: 24, border: "1.5px solid #dbeafe", padding: 28, boxShadow: "0 4px 24px rgba(37,99,235,0.07)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔤</div>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", margin: 0 }}>Vocabulary</p>
                    <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12, color: "#2563eb", margin: 0 }}>단어 연습</p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {displayWords.map(w => (
                    <div key={w.id} style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{w.text}</span>
                        <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{w.pronunciation}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>💡 {w.tip}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 문장 + 안내 카드 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: "#fff", borderRadius: 24, border: "1.5px solid #dbeafe", padding: 28, boxShadow: "0 4px 24px rgba(37,99,235,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📝</div>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", margin: 0 }}>Sentences</p>
                      <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12, color: "#2563eb", margin: 0 }}>문장 연습</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {displaySentences.map(s => (
                      <div key={s.id} style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0" }}>
                        <p style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 16, color: "#0f172a", margin: "0 0 4px" }}>{s.text}</p>
                        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{s.translation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI 회화 CTA 카드 */}
                <div style={{ background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)", borderRadius: 24, padding: 28, color: "#fff" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                  <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>AI Conversation Practice</h3>
                  <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 13, opacity: 0.85, marginBottom: 16 }}>10명의 AI 페르소나와 자유 대화</p>
                  <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6, marginBottom: 20 }}>Practice real conversations with 10 unique AI personas. From a café owner to a K-drama fan — each with a distinct personality and speaking style.</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["☕ 민철 (Café)", "🎓 수경 (Student)", "💼 진성 (Manager)", "🎵 설아 (K-fan)"].map(p => (
                      <span key={p} style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: 8 }}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16 }}>
              Sign in to unlock all lessons, pronunciation scoring, and AI chat. <span style={{ fontFamily: "'Noto Serif KR', serif" }}>로그인하면 모든 콘텐츠를 이용할 수 있어요.</span>
            </p>
            <Login onUserChange={onUserChange} />
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how" style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>How It Works</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 8 }}>
              4 Steps to Better Pronunciation
            </h2>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 15, color: "#64748b" }}>4단계 발음 교정 프로세스</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ textAlign: "center", padding: "28px 20px" }}>
                <div style={{ width: 52, height: 52, background: i < 2 ? "#2563eb" : "#dbeafe", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontWeight: 900, fontSize: 16, color: i < 2 ? "#fff" : "#1d4ed8" }}>{s.n}</div>
                <h3 style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", marginBottom: 4 }}>{s.en}</h3>
                <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12, color: "#2563eb", fontWeight: 700, marginBottom: 10 }}>{s.ko}</p>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOPIK 커리큘럼 ───────────────────────────────────── */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 8 }}>
              Structured for TOPIK Success
            </h2>
            <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 15, color: "#64748b" }}>TOPIK 합격을 위한 체계적인 커리큘럼</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 14 }}>
            {[
              ["Step 1", "입문", "Beginner", "#fef3c7", "#92400e"],
              ["Step 2", "TOPIK I 1급", "Basic", "#dcfce7", "#166534"],
              ["Step 3", "TOPIK I 2급", "Elementary", "#dbeafe", "#1e40af"],
              ["Step 4", "TOPIK II 3급", "Intermediate", "#ede9fe", "#5b21b6"],
              ["Step 5", "TOPIK II 3급+", "Upper-Int.", "#fce7f3", "#9d174d"],
              ["Step 6", "TOPIK II 4급", "Advanced", "#e0f2fe", "#0c4a6e"],
              ["Step 7", "TOPIK II 5급", "Upper-Adv.", "#f0fdf4", "#14532d"],
              ["Step 8", "TOPIK II 6급", "Mastery", "#fef9c3", "#713f12"],
            ].map(([step, ko, en, bg, color]) => (
              <div key={step} style={{ background: bg as string, borderRadius: 16, padding: "18px 12px", textAlign: "center" }}>
                <p style={{ fontWeight: 900, fontSize: 15, color: color as string, marginBottom: 4 }}>{step}</p>
                <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 11, color: color as string, fontWeight: 700, marginBottom: 2 }}>{ko}</p>
                <p style={{ fontSize: 11, color: color as string, opacity: 0.8 }}>{en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 최종 CTA ────────────────────────────────────────── */}
      <section style={{ padding: "96px 24px", background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #0ea5e9 100%)", textAlign: "center", color: "#fff" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, letterSpacing: "-1px", marginBottom: 12 }}>
            Start Speaking Korean Today
          </h2>
          <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 18, opacity: 0.9, marginBottom: 12 }}>지금 바로 시작하세요</p>
          <p style={{ fontSize: 16, opacity: 0.8, marginBottom: 40, lineHeight: 1.7 }}>
            Free to start. No credit card required.<br />
            <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 14 }}>무료로 시작 · 신용카드 불필요</span>
          </p>
          <div style={{ display: "inline-block", background: "#fff", borderRadius: 16, padding: "16px 36px" }}>
            <Login onUserChange={onUserChange} />
          </div>
        </div>
      </section>

      {/* ── 푸터 (애드센스 필수) ─────────────────────────────── */}
      <footer style={{ background: "#0f172a", color: "#94a3b8", padding: "48px 24px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 40, marginBottom: 40, flexWrap: "wrap" as any }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900 }}>S</div>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#fff" }}>Sori-Tutor</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 300 }}>
                AI-powered Korean pronunciation coach for global learners. Speak Korean with confidence.
              </p>
              <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12, marginTop: 8 }}>AI 기반 한국어 발음 교정 서비스</p>
            </div>
            <div>
              <h4 style={{ color: "#e2e8f0", fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Features / 기능</h4>
              {["Pronunciation Analysis", "AI Conversation", "TOPIK Curriculum", "Vocabulary Practice"].map(f => (
                <p key={f} style={{ fontSize: 13, marginBottom: 8 }}>{f}</p>
              ))}
            </div>
            <div>
              <h4 style={{ color: "#e2e8f0", fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Legal / 약관</h4>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                <a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none" }}>Privacy Policy / 개인정보처리방침</a>
              </p>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                <a href="/terms" style={{ color: "#94a3b8", textDecoration: "none" }}>Terms of Service / 이용약관</a>
              </p>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                <a href="/contact" style={{ color: "#94a3b8", textDecoration: "none" }}>Contact / 문의</a>
              </p>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as any, gap: 12 }}>
            <p style={{ fontSize: 13 }}>© 2026 Sori-Tutor. All rights reserved.</p>
            <p style={{ fontSize: 12 }}>Powered by Google Gemini AI · Google Cloud TTS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}