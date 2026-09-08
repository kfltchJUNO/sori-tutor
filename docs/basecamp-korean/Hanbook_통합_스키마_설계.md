# Hanbook 통합 콘텐츠 스키마 (Basecamp Korean 우선 설계)

Basecamp Korean을 먼저 실제 구현하되, 이후 StepKorean(8권, 5유닛×10p, TOPIK 미리보기 포함)도 리네이밍 없이 얹을 수 있도록 컬렉션 이름을 시리즈 중립적으로 설계합니다.

## 1. 전체 구조

```
series (collection)
  {seriesId}                    예: "basecamp-korean", "step-korean"
    - name, description
    - defaultLevel, colorTheme(선택, StepKorean의 권별 컬러用)
    - active: boolean

    books (subcollection)       Basecamp의 "Book1/Book2", StepKorean의 "Step1~8"을 통칭
      {bookId}                  예: "b1","b2" / "step1"~"step8"
        - title, order, levelLabel (예: "0~1급", "TOPIK 3급")

        lessons (subcollection) Basecamp의 "과", StepKorean의 "Unit"을 통칭
          {lessonId}            예: "l0"~"l8" / "unit1"~"unit5"
            - title, order, isFree: boolean   ← 접근 제어는 여기 한 곳에만 존재
            - vocab: []
            - grammar: []
            - dialogue: [] , dialogueAudioUrl
            - speakingActivities: [], selfCheckItems: []
            - listening: { audioUrl, questions: [] }
            - reading: { text, writingPrompt }
            - topikPreview: []        ← StepKorean 전용 필드(Basecamp는 빈 배열)
            - quiz: []
            - images: []

          {lessonId}/workbook (subcollection, 문서 1개: "content")
            - drills: []
            - writingPrompt
            - answerKey: []
```

**핵심 설계 원칙**: 접근 제어 플래그(`isFree`)를 과/유닛 단위 문서 하나에만 두고, 화면 컴포넌트는 시리즈와 무관하게 동일한 필드 이름을 그대로 렌더링합니다. StepKorean의 "문법1/문법2"는 `grammar` 배열에 2개 항목으로, "TOPIK 미리보기"는 Basecamp에는 없는 `topikPreview` 필드로 흡수됩니다 — 스키마 변경 없이 필드가 비어있으면 그 섹션을 안 보여주면 됩니다.

## 2. 라우팅

```
/learn/{seriesId}/{bookId}/{lessonId}
예) /learn/basecamp-korean/b1/l1
    /learn/basecamp-korean/b2/l9
    /learn/step-korean/step2/unit1   ← 나중에 추가될 형태
```
QR은 이 URL을 직접 인코딩. 기존 Basecamp 설계(`/basecamp/[book]/[lesson]`)보다 `seriesId`가 앞에 붙는 점만 다르고 나머지는 동일합니다.

## 3. 접근 제어 / 결제

```
users/{uid}/entitlements/{seriesId}_{bookId}
  - unlockedAt, purchaseId, source (gumroad/manual 등)
```
- 열람 시: `lesson.isFree === true` 이거나, 로그인 유저의 `entitlements`에 해당 `{seriesId}_{bookId}` 문서가 있으면 unlock
- Basecamp는 Book1 1과(`b1_l1`)만 `isFree: true`, 나머지 전부 false — 기존 결정 그대로 반영

## 4. 관리 도구 (`/admin`)

StepKorean 설계 때 이미 나왔던 아이디어를 재사용: Firebase Auth 관리자 계정으로만 접근 가능한 `/admin` 라우트. 시리즈 중립 스키마 덕분에 어드민 화면도 시리즈 선택 드롭다운 하나만 추가하면 Basecamp든 StepKorean이든 같은 화면으로 편집 가능합니다.

## 5. Basecamp 콘텐츠 최초 입력 방법 (중요 — 수작업 지양)

지금 만든 Basecamp 19과 콘텐츠를 어드민 화면에 일일이 손으로 다시 입력하는 건 비효율적입니다. 대신:
1. 각 과의 워드 문서를 만들 때 썼던 JS 스크립트(vocabRows, grammarRows, dialogue 배열 등)를 재사용해 **JSON export 스크립트**로 살짝 변형
2. 19개 과 JSON을 한 번에 Firestore로 밀어넣는 **1회성 import 스크립트** 작성 (Node + firebase-admin SDK)
3. 이후 오타 수정 등 자잘한 편집만 `/admin`에서 수동으로

## 6. 개발 순서 (Basecamp 우선)
1. 이 스키마로 `series/basecamp-korean` 문서 + `books/b1`, `books/b2` 생성
2. Book1 1과 콘텐츠부터 JSON 변환 → import 스크립트로 Firestore에 적재
3. `/learn/[seriesId]/[bookId]/[lessonId]` 동적 라우트 페이지 구현 (프로토타입 HTML을 컴포넌트로 이식)
4. entitlements 체크 로직 + Gumroad 연동
5. 나머지 18과 순차 적재
6. (나중에) StepKorean을 같은 스키마의 새 `series` 문서로 추가
