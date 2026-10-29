"use client";
// app/dankook/page.tsx
// 단국대학교 한국어 전용 포털 페이지

import UnivPortalPage, { UnivPortalConfig } from "@/app/components/UnivPortalPage";

const DANKOOK_CONFIG: UnivPortalConfig = {
  univKey: "dankook",
  univName: "단국대학교",
  title: "단국대학교 한국어",
  subTitle: "단국대 학생 전용 발음 훈련실",
  logoEmoji: "🐻",
  themeColor: "blue",
  curriculumCollection: "sori_curriculum_dankook",
  statusField: "dankook_status",
  studentIdField: "dankook_student_id",
  appliedAtField: "dankook_applied_at",
  sampleProblems: [
    {
      id: "dankook-sample-1",
      text: "단국대학교에서 한국어를 배워요",
      pronunciation: "[단국때학꾜에서 한구거를 배워요]",
      rule_formula: "국[ㄱ] + 대[ㄷ] = [때] (된소리)",
      chapter: 1,
      meaning_ko: "단국대학교에서 한국어를 배웁니다.",
    },
    {
      id: "dankook-sample-2",
      text: "친구들과 같이 도서관에 가요",
      pronunciation: "[친구들과 가치 도서관에 가요]",
      rule_formula: "같[ㅌ] + 이[ㅇ] = [치] (가치)",
      chapter: 1,
      meaning_ko: "친구들과 함께 도서관에 갑니다.",
    },
    {
      id: "dankook-sample-3",
      text: "주말에 한국 친구를 만났어요",
      pronunciation: "[주마레 한국 친구를 만나써요]",
      rule_formula: "주말[ㄹ] + 에[ㅇ] = [주마레] (연음)",
      chapter: 2,
      meaning_ko: "주말에 한국인 친구와 만났습니다.",
    },
  ],
};

export default function DankookPage() {
  return <UnivPortalPage config={DANKOOK_CONFIG} />;
}
