// scripts/data/basecamp-book1-lesson1.js
// Basecamp Korean Book1 1과 ("저는 ○○이에요") 콘텐츠 — sori_curriculum_* 스키마 변환본
// 출처: docs/basecamp-korean/Basecamp_Korean_Book1_1과_초안.docx

const SERIES_ID = "basecamp-korean";
const CATEGORY = "자기소개";
const BOOK = 1; // step 필드에 매핑 (Basecamp Book 번호)
const LESSON = 1; // unit 필드에 매핑 (Basecamp 과 번호)

const words = [
  { id: "basecamp-b1-l1-w01", text: "저", pronunciation: "[저]", tip: "정중하게 자신을 가리킬 때 쓰는 말, 반말의 '나'보다 격식적" },
  { id: "basecamp-b1-l1-w02", text: "이름", pronunciation: "[이름]", tip: "받침 'ㅁ'을 명확히 닫아서 발음" },
  { id: "basecamp-b1-l1-w03", text: "학생", pronunciation: "[학쌩]", tip: "받침 'ㄱ' 뒤 'ㅅ'은 된소리 [ㅆ]로 발음 (경음화)" },
  { id: "basecamp-b1-l1-w04", text: "선생님", pronunciation: "[선생님]", tip: "'선생님'까지 붙여서 존칭으로만 사용, '선생'만 쓰면 실례" },
  { id: "basecamp-b1-l1-w05", text: "친구", pronunciation: "[친구]", tip: "또래나 아랫사람에게만 사용, 윗사람에겐 쓰지 않음" },
  { id: "basecamp-b1-l1-w06", text: "나라", pronunciation: "[나라]", tip: "'어느 나라'처럼 의문사와 함께 자주 쓰임" },
  { id: "basecamp-b1-l1-w07", text: "사람", pronunciation: "[사람]", tip: "'~ 나라 사람'으로 국적을 나타낼 때 필수" },
  { id: "basecamp-b1-l1-w08", text: "안녕하세요", pronunciation: "[안녕하세요]", tip: "끝을 살짝 내려서 인사말답게 발음" },
  { id: "basecamp-b1-l1-w09", text: "만나서 반가워요", pronunciation: "[만나서 반가워요]", tip: "첫 만남에서만 사용, 두 번째 만남부터는 안 씀" },
  { id: "basecamp-b1-l1-w10", text: "나이", pronunciation: "[나이]", tip: "'몇 살'과 함께 나이를 물을 때 사용" },
  { id: "basecamp-b1-l1-w11", text: "살", pronunciation: "[살]", tip: "숫자는 반드시 고유어(하나,둘..)로, 한자어(일,이..)는 쓸 수 없음" },
  { id: "basecamp-b1-l1-w12", text: "몇", pronunciation: "[멷]", tip: "받침 'ㅊ'은 대표음 [ㄷ]으로 발음" },
  { id: "basecamp-b1-l1-w13", text: "명", pronunciation: "[명]", tip: "숫자 1~4는 한/두/세/네로 형태가 바뀜 (한 명, 두 명...)" },
  { id: "basecamp-b1-l1-w14", text: "가족", pronunciation: "[가족]", tip: "받침 'ㄱ' 뒤 예사소리가 된소리로 나기 쉬우니 '가족은'처럼 조사와 붙여 연습" },
  { id: "basecamp-b1-l1-w15", text: "아버지", pronunciation: "[아버지]", tip: "구어에서는 '아빠'도 쓰지만 격식체에서는 '아버지'" },
  { id: "basecamp-b1-l1-w16", text: "어머니", pronunciation: "[어머니]", tip: "구어에서는 '엄마'도 쓰지만 격식체에서는 '어머니'" },
  { id: "basecamp-b1-l1-w17", text: "동생", pronunciation: "[동생]", tip: "성별 구분 없이 남녀 동생 모두 지칭 가능" },
  { id: "basecamp-b1-l1-w18", text: "네", pronunciation: "[네]", tip: "대답할 때 짧고 분명하게 발음" },
  { id: "basecamp-b1-l1-w19", text: "아니요", pronunciation: "[아니요]", tip: "'아니오'가 아니라 '아니요'로 표기하는 것이 표준" },
  { id: "basecamp-b1-l1-w20", text: "감사합니다", pronunciation: "[감사함니다]", tip: "받침 'ㅂ' 뒤 'ㄴ'의 영향으로 [ㅁ]으로 발음 (비음화)" },
  { id: "basecamp-b1-l1-w21", text: "저기요", pronunciation: "[저기요]", tip: "모르는 사람을 부르거나 종업원을 부를 때 사용" },
  { id: "basecamp-b1-l1-w22", text: "한국", pronunciation: "[한국]", tip: "받침 'ㄴ' 뒤 'ㄱ'은 그대로 발음" },
  { id: "basecamp-b1-l1-w23", text: "미국", pronunciation: "[미국]", tip: "'미국 사람'처럼 '사람'과 붙여 국적을 표현" },
  { id: "basecamp-b1-l1-w24", text: "일본", pronunciation: "[일본]", tip: "받침 'ㄹ' 뒤 'ㅂ'을 명확히 발음" },
  { id: "basecamp-b1-l1-w25", text: "베트남", pronunciation: "[베트남]", tip: "외래어 표기이므로 음절 그대로 또박또박 발음" },
  { id: "basecamp-b1-l1-w26", text: "브라질", pronunciation: "[브라질]", tip: "외래어 표기이므로 음절 그대로 또박또박 발음" },
  { id: "basecamp-b1-l1-w27", text: "형/오빠", pronunciation: "[형/오빠]", tip: "화자가 남성이면 '형', 여성이면 '오빠' 사용" },
  { id: "basecamp-b1-l1-w28", text: "누나/언니", pronunciation: "[누나/언니]", tip: "화자가 남성이면 '누나', 여성이면 '언니' 사용" },
].map((w) => ({
  ...w,
  category: CATEGORY,
  step: BOOK,
  unit: LESSON,
  source: "manual",
  has_audio: false,
  seriesId: SERIES_ID,
}));

const dialogues = [
  {
    id: "basecamp-b1-l1-d01",
    title: "자기소개 — 마이클과 유키",
    script: [
      "A: 안녕하세요. 저는 마이클이에요.",
      "B: 안녕하세요. 저는 유키예요. 만나서 반가워요.",
      "A: 만나서 반가워요. 유키 씨는 어느 나라 사람이에요?",
      "B: 저는 일본 사람이에요. 마이클 씨는요?",
      "A: 저는 미국 사람이에요.",
      "B: 마이클 씨는 몇 살이에요?",
      "A: 저는 스물다섯 살이에요. 유키 씨 가족은 몇 명이에요?",
      "B: 저희 가족은 네 명이에요. 아버지, 어머니, 언니, 저 이렇게 네 명이에요.",
    ].join("|"),
    translation: [
      "A: Hello. I'm Michael.",
      "B: Hello. I'm Yuki. Nice to meet you.",
      "A: Nice to meet you too. Yuki, which country are you from?",
      "B: I'm from Japan. What about you, Michael?",
      "A: I'm from the USA.",
      "B: Michael, how old are you?",
      "A: I'm 25 years old. How many people are in your family, Yuki?",
      "B: There are four people in my family — my father, mother, older sister, and me.",
    ].join("|"),
    category: CATEGORY,
    step: BOOK,
    unit: LESSON,
    has_audio: false,
    seriesId: SERIES_ID,
  },
];

module.exports = { words, dialogues, SERIES_ID, CATEGORY, BOOK, LESSON };
