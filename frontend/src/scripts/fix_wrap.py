import re
with open(r'C:\Users\Aijth\.gemini\antigravity\scratch\nourishnet\frontend\src\pages\LandingPage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(
    r'fontSize: "0\.78rem",\s*cursor: "pointer",',
    'fontSize: "0.78rem", cursor: "pointer", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.2,',
    code
)

with open(r'C:\Users\Aijth\.gemini\antigravity\scratch\nourishnet\frontend\src\pages\LandingPage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("Done!")
