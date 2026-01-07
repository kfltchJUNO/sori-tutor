export default function Privacy() {
  return (
    <main className="max-w-4xl mx-auto p-6 bg-white min-h-screen text-slate-800">
      <h1 className="text-3xl font-bold mb-6">개인정보처리방침</h1>
      <p className="mb-4">소리튜터(이하 '서비스')는 이용자의 개인정보를 중요시하며, '개인정보 보호법'을 준수하고 있습니다.</p>
      
      <h2 className="text-xl font-bold mt-6 mb-2">1. 수집하는 개인정보 항목</h2>
      <ul className="list-disc pl-6 mb-4">
        <li>로그인 식별 정보 (Google OAuth)</li>
        <li>서비스 이용 기록, 학습 데이터(음성 분석 결과 등)</li>
      </ul>

      <h2 className="text-xl font-bold mt-6 mb-2">2. 개인정보의 처리 목적</h2>
      <p className="mb-4">서비스 제공, 회원 관리, 학습 리포트 생성 및 서비스 개선을 위해 활용됩니다.</p>

      <h2 className="text-xl font-bold mt-6 mb-2">3. 문의처</h2>
      <p className="mb-4">이메일: ot.helper7@gmail.com</p>
    </main>
  );
}