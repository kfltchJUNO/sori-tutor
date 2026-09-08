# Hanbook 앱 재설계 — Basecamp Korean 본교재 뷰어

## 목표
- Basecamp Korean 본교재를 웹에서 바로 보는 뷰어로 제작
- QR이 앱 URL을 직접 가리켜 리다이렉트 레이어 자체를 불필요하게 만듦
- 오디오를 자체 호스팅해 유튜브 의존 제거
- 기존 스택 재사용: Next.js 14 + Firebase + Vercel (STEP Korean/쌤툴과 동일 패턴)

## URL 구조
```
/basecamp/[book]/[lesson]
예) /basecamp/b1/l1, /basecamp/b1/l8(종합복습), /basecamp/b2/l9
```
QR은 이 URL을 직접 인코딩 — 콘텐츠 위치가 바뀌어도 URL은 그대로이므로 인쇄물을 다시 찍을 필요가 없습니다.

## 화면 구성 (과 1개 페이지 기준)
1. **Header**: 과 제목 + 진행률 표시(선택)
2. **어휘**: 카드 UI(단어/뜻/발음), 탭하면 단어 발음 오디오 재생
3. **문법**: 아코디언 또는 카드, 영어 설명 + 예문
4. **대화**: 화자별 말풍선 UI + 전체 재생 버튼 (문장별 하이라이트 동기화는 v2 stretch goal)
5. **말하기**: 활동 카드(과외용) + 자가 점검 체크리스트(독학용, 체크박스 UI)
6. **듣기**: 오디오 재생 + 객관식, 클릭 시 즉시 정오답 표시
7. **읽기**: 지문 + 쓰기 예문(모델 문장) + "워크북 PDF 다운로드" CTA
8. **미니 퀴즈**: 5문항 자가 채점
9. **Footer**: 이전 과 / 다음 과 네비게이션

## 데이터 모델 (Firestore)
- Collection: `lessons`, Doc ID: `{book}_{lessonNumber}` (예: `b1_1`)
- 필드: `title`, `vocab[]`, `grammar[]`, `dialogue[]`(+ `dialogueAudioUrl`), `speakingActivities[]`, `selfCheckItems[]`, `listening{audioUrl, questions[]}`, `reading{text, writingPrompt}`, `quiz[]`, `images[]`

## 오디오 저장
- Firebase Storage: `/audio/{book}/{lesson}/dialogue.mp3`, `word_0001.mp3` 등
- ElevenLabs 생성 → 로컬 저장 → 업로드 스크립트로 Storage에 자동 반영

## 접근 제어 (결정 필요)
- **A안**: 전체 무료 공개 — 독학 확산/마케팅 목적
- **B안**: Gumroad 결제 후 과별 unlock — 기존 AIM/소리튜터 패턴 재사용
- **C안**: 본교재는 무료(미끼), 워크북 PDF만 유료 판매 — 수익원은 워크북

## 개발 우선순위 제안
1. 라우팅 + Firestore 스키마 확정
2. 1과 콘텐츠로 컴포넌트 프로토타입 (어휘·대화·듣기 우선 구현)
3. 오디오 업로드 파이프라인 자동화
4. 나머지 과 콘텐츠 이관
5. 접근 제어/과금 모델 결합

## 확정 필요
- [ ] 접근 제어 A/B/C안 중 선택
- [ ] Hanbook 기존 코드베이스에 이어 붙일지, 별도 서브도메인(basecamp.ssamtool.co 등)으로 분리할지
