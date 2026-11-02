"use client";
// app/dongguk3/page.tsx
// 동국대학교 한국어 3급 전용 포털 페이지

import UnivPortalPage, { UnivPortalConfig } from "@/app/components/UnivPortalPage";

const DONGGUK3_CONFIG: UnivPortalConfig = {
  univKey: "dongguk3",
  univName: "동국대학교",
  title: "동국대학교 한국어 3급",
  subTitle: "3급 중급 학생 전용 발음 & 억양 훈련실",
  logoEmoji: "🏫",
  themeColor: "amber",
  curriculumCollection: "sori_curriculum_dongguk3",
  statusField: "dongguk3_status",
  studentIdField: "dongguk3_student_id",
  appliedAtField: "dongguk3_applied_at",
  sampleProblems: [
    {
      id: "dongguk3-sample-1",
      text: "환경오염 문제를 해결하기 위해 함께 노력해야 합니다",
      pronunciation: "[환경오염 문제를 해결하기 위해 함께 노력해야 함니다]",
      rule_formula: "합[ㅂ] + 니[ㄴ] = [함니] (비음화)",
      chapter: 1,
    },
    {
      id: "dongguk3-sample-2",
      text: "자신의 생각을 논리적으로 설득력 있게 표현해 보세요",
      pronunciation: "[자시네 생각을 놀리적으로 설뜽녁 익께 표현해 보세요]",
      rule_formula: "설득[ㄱ] + 력[ㄹ] = [설뜽녁] (비음화+유음화) / 있[ㅆ] + 게 = [익께]",
      chapter: 1,
    },
    {
      id: "dongguk3-sample-3",
      text: "한국 사회와 문화의 다양성을 깊이 이해하고 싶어요",
      pronunciation: "[한국 사회와 문화의 다양썽을 기피 이해하고 시퍼요]",
      rule_formula: "다양[ㅇ] + 성[ㅅ] = [다양썽] / 깊[ㅍ] + 이[ㅇ] = [기피] (연음)",
      chapter: 2,
    },
  ],
};

export default function Dongguk3Page() {
  return <UnivPortalPage config={DONGGUK3_CONFIG} />;
}
