// check-my-models.js
const https = require('https');
const fs = require('fs');
const path = require('path');

function getApiKey() {
    try {
        const envPath = path.join(__dirname, '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/GEMINI_API_KEY_FREE=(.*)/);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch (e) {
        return null;
    }
    return null;
}

const apiKey = getApiKey();

if (!apiKey) {
    console.error("❌ 오류: .env.local 파일에서 'GEMINI_API_KEY_FREE'를 찾을 수 없습니다.");
    process.exit(1);
}

console.log(`🔑 키 확인됨 (앞자리: ${apiKey.substring(0, 5)}...)`);
console.log("📡 구글 서버에 모델 목록을 요청합니다...\n");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            if (response.error) {
                console.error("🚨 API 키 오류:", response.error.message);
            } else if (response.models) {
                console.log("✅ [사용 가능한 모델 목록]");
                const models = response.models.map(m => m.name.replace('models/', ''));
                models.forEach(m => console.log(` - ${m}`));
                
                console.log("\n-------------------------------------------");
                if (models.includes('gemini-1.5-flash')) {
                    console.log("🎉 1.5-flash 사용 가능! (코드 설정 문제였음)");
                } else {
                    console.log("⚠️ 1.5-flash가 없습니다. 'gemini-pro'로 코드를 바꿔야 합니다.");
                }
            }
        } catch (e) { console.error("파싱 실패"); }
    });
});