"use client";
// app/dongguk/page.tsx
// 동국대학교 한국어 1급 전용 포털 페이지

import UnivPortalPage, { UnivPortalConfig } from "@/app/components/UnivPortalPage";

const DONGGUK_CONFIG: UnivPortalConfig = {
  univKey: "dongguk",
  univName: "동국대학교",
  title: "동국대학교 한국어 1급",
  subTitle: "1급 학생 전용 발음 훈련실",
  logoEmoji: "🏫",
  themeColor: "amber",
  curriculumCollection: "sori_curriculum_dongguk",
  statusField: "dongguk_status",
  studentIdField: "dongguk_student_id",
  appliedAtField: "dongguk_applied_at",
  sampleProblems: [
    {
      id: "dongguk-sample-1",
      text: "작년에 한국에 왔어요",
      pronunciation: "[장년에 한구게 와써요]",
      rule_formula: "작[ㄱ] + 년[ㄴ] = [ㅇ] (장년) / 한국[ㄱ] + 에[ㅇ] = [한구게] (연음)",
      chapter: 1,
    },
    {
      id: "dongguk-sample-2",
      text: "한국말을 잘하고 싶어요",
      pronunciation: "[한국마를 자라고 시퍼요]",
      rule_formula: "말[ㄹ] + 을[ㅇ] = [마를] (연음) / 잘[ㄹ] + 하고 = [자라고]",
      chapter: 1,
    },
    {
      id: "dongguk-sample-3",
      text: "국립중앙박물관에 가요",
      pronunciation: "[궁닙쯩앙방물과네 가요]",
      rule_formula: "국[ㄱ] + 립[ㄹ] = [궁닙] / 박[ㄱ] + 물[ㅁ] = [방물]",
      chapter: 2,
    },
  ],
};

export default function DonggukPage() {
  return <UnivPortalPage config={DONGGUK_CONFIG} />;
}
