## 언어
항상 한국어로 답변할 것. 코드 주석/커밋 메시지는 영어 그대로 둬도 됨.

## 응답 스타일 (토큰 절약)
- 각 단계 진행 서술 최소화("이제 ~합니다" 반복 금지). 최종 결과 위주로 보고.
- 요약은 5줄 이내로. 상세 로그는 요청 시에만.

## 상세 컨텍스트 문서
docs/sori-tutor-context/sori-tutor-master.docx 에 전체 스키마·기능 현황·미확정 사항이 
정리돼 있음. 세션 시작 시 필요한 부분만 열어서 참고 (전체를 매번 재탐색하지 말 것).

## 프로젝트 한 줄 요약
발음 학습 앱. Firebase + Next.js. "소리(Sori)" 토큰 재화, Gumroad 결제. 
STEP Korean/Basecamp Korean 커리큘럼 콘텐츠 연동 진행 중.

## 절대 규칙 (위반 시 실제 버그로 이어짐 — 마스터 문서에서 이미 확인된 위험 지점)
- **토큰/역할 변경은 반드시 서버 API Route + 트랜잭션으로**. 클라이언트에서 
  Firestore updateDoc으로 tokens/role 직접 수정하는 코드 절대 작성하지 말 것.
- **새 API Route 추가 시** lib/adminAuth.ts의 requireAdmin() 적용 확인.
- **토큰 소비량 변경 시** api/token/route.ts의 COSTS + ALLOWED_SPEND_REASONS 동기화 필수.
- **Firestore 컬렉션 추가/변경 시** firestore.rules에도 반드시 같이 반영.
- **파일 생성/수정 시 UTF-8 인코딩 필수** — PowerShell 스크립트 안에서 파일 쓸 때 
  `[System.IO.File]::WriteAllText` 사용 (기본 인코딩 쓰면 한글 깨짐).
- page.tsx 등 JSX 수정 시 **div 태그 균형 자주 깨짐** — 수정 후 반드시 확인.

## 확인 없이 하지 말 것
- git push, `firebase deploy` (특히 firestore:rules), Vercel 환경변수 변경
- Gumroad 관련 설정/코드 변경 (상품 미등록 상태 등 실제 결제에 영향 있음)
- 관리자 이메일/권한 관련 코드 변경

## 현재 알려진 미확정 사항 (건드릴 때 주의)
- Gumroad 상품 4종 + STEP Korean 교재(step_korean_1~8) 전부 미등록 상태
- AdSense 심사 통과 여부 미확인
- Firestore Security Rules 실제 배포 여부 미확인 (코드는 존재)
- Next.js/Gemini 모델 버전 표기가 실제 지원 버전인지 불확실 — 버전 관련 이슈 만나면 먼저 확인

## 커밋 규칙
의미 단위로 자주 커밋. 커밋 전 "커밋할까요?" 한 번 물어볼 것 (자동 커밋 금지).
