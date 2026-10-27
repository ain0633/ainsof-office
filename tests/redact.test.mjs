import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, hasPersonalInfo, luhn, summarize } from "../plugin/gate/redact.mjs";

test("키를 가린다", () => {
  assert.equal(redact("key sk-ant-api03-TESTTESTTEST"), "key [가림:키]");
  assert.equal(redact("ghp_" + "a".repeat(30)), "[가림:키]");
  assert.equal(redact("https://discord.com/api/webhooks/1/abc"), "https://[가림:키]");
  assert.equal(redact("token=abc123"), "[가림:키]");
});

test("개인정보를 가린다", () => {
  assert.equal(redact("call 010-1234-5678"), "call [가림:개인정보]");
  assert.equal(redact("mail a.b@example.com"), "mail [가림:개인정보]");
  assert.equal(redact("id 900101-1234567"), "id [가림:개인정보]");
  assert.equal(luhn("4111 1111 1111 1111"), true);
  assert.equal(redact("card 4111 1111 1111 1111"), "card [가림:개인정보]");
});

test("ms 타임스탬프 같은 13자리 숫자는 가리지 않는다", () => {
  assert.equal(redact("ts 1791732162596"), "ts 1791732162596");
});

test("개인정보 입력 판별: 커밋 서명의 noreply 주소는 제외", () => {
  assert.equal(hasPersonalInfo("Co-Authored-By: Claude <noreply@anthropic.com>"), false);
  assert.equal(hasPersonalInfo("연락처 010-1234-5678"), "휴대폰");
});

test("개인정보 판별은 걸린 종류를 돌려준다 (내용은 돌려주지 않는다) — 잘못 잡은 경우를 로그로 가리기 위해", () => {
  assert.equal(hasPersonalInfo("900101-1234567"), "주민등록번호");
  assert.equal(hasPersonalInfo("mail a.b@example.com"), "이메일");
  assert.equal(hasPersonalInfo("card 4111 1111 1111 1111"), "카드번호");
  assert.equal(hasPersonalInfo("added 1 package in 2s"), false);
  assert.equal(hasPersonalInfo("npm install react-router-dom@6.30.6 --save"), false); // 패키지@버전은 주소가 아니다
  assert.equal(hasPersonalInfo("mail a@mail.co.kr"), "이메일");
});

// 2026-10-15 라벨 시범: README 의 사례 번호 목록(4자리씩 띄어 씀)이 카드번호로 잡혔다
test("숫자가 길게 이어진 목록 속 16자리는 카드번호로 보지 않는다", () => {
  // 실제로 걸린 두 곳: 줄이 바뀐 뒤 이어지는 번호 4개, 소수점 아래 16자리
  const ids = "12350 12472 2282 5482 1015 10905 318\n206 6392 2655 7319 2952 132 12459 2758\n`random()`=0.6394267984578837, `sample(range(100),3)`=[81, 14, 3]";
  assert.equal(hasPersonalInfo(ids), false);
  assert.equal(redact(ids), ids);
  assert.equal(hasPersonalInfo("결제 카드 4111 1111 1111 1111 로 했다"), "카드번호"); // 따로 떨어진 카드번호는 그대로 잡는다
  assert.equal(hasPersonalInfo("4111-1111-1111-1111"), "카드번호");
});

test("로그 요약은 짧고, URL 쿼리(토큰이 들어가기 쉬운 곳)를 버린다", () => {
  assert.ok(summarize("Bash", { command: "x".repeat(200) }).length <= 121);
  assert.equal(summarize("WebFetch", { url: "https://a.com/b?token=1" }), "a.com/b");
  assert.equal(summarize("Read", { file_path: "C:\\x\\y.md" }), "C:\\x\\y.md");
  assert.equal(summarize("Agent", { subagent_type: "ainsof-office:researcher", description: "조사" }), "ainsof-office:researcher: 조사");
});
