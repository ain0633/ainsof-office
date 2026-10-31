// 민감한 글자 다루기: 화면·디스코드로 보내기 전에 가리고, 개인정보가 섞인 입력을 찾아낸다.

const KEY = [
  /\bsk-ant-[\w-]{8,}/g,
  /\bAIza[\w-]{20,}/g,
  /\b(ghp|gho|ghs|ghu|github_pat)_\w{20,}/g,
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, // JWT
  /\b[\w-]{24,26}\.[\w-]{6}\.[\w-]{27,40}\b/g, // 디스코드 봇 토큰 모양
  /discord(app)?\.com\/api\/webhooks\/\S+/gi,
  /\b(api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi,
];
// 한계: 형식 변형 몇 가지만 잡는다. 일반 전화·계좌·주소·이름은 안 잡는다 — 봇 계정에 개인 자료를 두지 않는 것이 본 대책(기획서 4.4 피해 상한).
const PERSONAL_KINDS = [
  ["주민등록번호", /\b\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-?[1-4]\d{6}\b/g], // 하이픈 없어도, 생년월일 형식일 때만
  ["휴대폰", /(\+82[-.\s]?|\b0)1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g], // 점 구분, +82 표기 포함
  ["이메일", /\b[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}\b/g], // 끝은 글자. react-router-dom@6.30.6 같은 패키지@버전은 주소가 아니다(2026-10-21)
];
const PERSONAL = PERSONAL_KINDS.map(([, re]) => re);
// 15~16자리 (ms 타임스탬프 13자리와 겹치지 않게). 앞뒤로 숫자가 더 이어지거나 소수점 아래면 카드번호가 아니다
// (2026-10-15 라벨 시범: 띄어 쓴 사례 번호 목록과 난수 0.6394…가 잡혔다)
const CARD = /(?<!\d[ .-]?)\b(?:\d[ -]?){14,15}\d\b(?![ -]?\d)/g;

export function luhn(s) {
  const d = s.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

export function redact(text) {
  let s = String(text ?? "");
  for (const re of KEY) s = s.replace(re, "[가림:키]");
  for (const re of PERSONAL) s = s.replace(re, "[가림:개인정보]");
  return s.replace(CARD, (m) => (luhn(m) ? "[가림:개인정보]" : m));
}

export function hasPersonalInfo(text) {
  const s = String(text ?? "").replace(/\bnoreply@anthropic\.com\b|[\w.+-]+@users\.noreply\.github\.com\b/gi, ""); // 커밋 서명 주소만 뺀다
  // 걸린 종류만 돌려준다(내용은 아님). 게이트 사유에 남겨 잘못 잡은 경우를 가린다
  const kind = PERSONAL_KINDS.find(([, re]) => s.search(re) !== -1)?.[0];
  return kind ?? ((s.match(CARD) ?? []).some(luhn) ? "카드번호" : false);
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

// 로그 한 줄에 들어갈 "무엇을 하려 했나" 요약. 파일 내용은 넣지 않는다.
export function summarize(tool, input = {}) {
  if (input.command) return clip(input.command, 120);
  if (input.file_path || input.path) return input.file_path || input.path;
  if (input.url) {
    try {
      const u = new URL(input.url);
      return u.host + u.pathname;
    } catch {
      return clip(input.url, 120);
    }
  }
  if (input.query) return clip(input.query, 120);
  if (tool === "Agent") return `${input.subagent_type ?? "?"}: ${clip(input.description ?? "", 80)}`;
  return "";
}
