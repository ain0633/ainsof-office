import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyTree, mergeSecrets } from "../company-lock/install.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

// 이 저장소 경로에는 한글(문서, 코드_프로젝트)이 있다. fs.cpSync 는 Node 22.18 Windows 에서 이런 경로를 만나면
// 오류 없이 프로세스가 죽었다(Segmentation fault, 2026-10-13 설치 중단). 실제 복사를 같은 조건에서 시험한다.
test("설치 복사: 한글 경로의 폴더와 파일을 그대로 복사한다", () => {
  const dst = mkdtempSync(join(tmpdir(), "ainsof-copy-"));
  try {
    copyTree(join(root, "plugin", "gate"), join(dst, "gate"));
    copyTree(join(root, "company-lock", "managed-settings.json"), join(dst, "managed-settings.json"));
    copyTree(join(root, "plugin"), join(dst, "plugin"));
    for (const f of ["gate/gate.mjs", "gate/rules.mjs", "plugin/hooks/hooks.json", "managed-settings.json", "plugin/.claude-plugin/plugin.json", "plugin/agents/developer.md"]) assert.ok(existsSync(join(dst, f)), f);
  } finally {
    rmSync(dst, { recursive: true, force: true });
  }
});

// 다시 설치할 때 --webhook 없이 돌려도 웹후크 주소가 지워지지 않고, CEO 디스코드 ID 가 더해진다(승인 요청 멘션용)
test("secrets.json 은 기존 값을 지키며 합친다", () => {
  const before = JSON.stringify({ discordWebhook: "https://w" });
  assert.deepEqual(JSON.parse(mergeSecrets(before, { ceoId: "123" })), { discordWebhook: "https://w", ceoDiscordId: "123" });
  assert.deepEqual(JSON.parse(mergeSecrets(null, { webhook: "https://x" })), { discordWebhook: "https://x" });
  assert.equal(mergeSecrets(before, {}), null); // 바꿀 게 없으면 쓰지 않는다
});

test("관리자 설정에는 훅만 있고, 모든 훅이 게이트를 알려진 모드로 부른다", () => {
  const settings = JSON.parse(readFileSync(join(root, "company-lock", "managed-settings.json"), "utf8"));
  assert.deepEqual(Object.keys(settings), ["hooks"]); // PC 전체 잠금 옵션을 넣지 않는다 (CEO 세션 보호)
  const hooks = Object.values(settings.hooks).flat().flatMap((h) => h.hooks);
  assert.deepEqual(hooks.map((h) => h.command.split(" ").pop()).sort(), ["agent-start", "agent-stop", "compact", "post", "pre"]);
  assert.ok(hooks.every((h) => h.command.startsWith('node "C:/Program Files/ainsof/gate/gate.mjs"')));
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].timeout, 600);
});

test("설치 스크립트 dry-run 은 할 일만 보여 주고 웹후크 주소는 숨긴다", () => {
  const out = execFileSync(process.execPath, [join(root, "company-lock", "install.mjs"), "--dry-run", "--webhook", "https://discord.com/api/webhooks/1/secret"]).toString();
  assert.match(out, /icacls C:\\ainsof\\log \/grant ainsof-bot:\(OI\)\(CI\)M/);
  assert.match(out, /icacls C:\\ainsof\\memory \/grant ainsof-bot:\(OI\)\(CI\)RX/);
  assert.match(out, /icacls C:\\ainsof\\work \/grant ainsof-bot:\(OI\)\(CI\)M/);
  assert.match(out, /icacls C:\\ainsof\\plugin \/grant ainsof-bot:\(OI\)\(CI\)RX/);
  assert.match(out, /→ C:\\ainsof\\plugin\\ainsof-office/);
  assert.match(out, /managed-settings\.json/);
  assert.match(out, /git init --bare C:\\ainsof\\handoff\\app\.git/);
  // Codex 시스템 설정 폴더는 관리자만 쓴다. 봇이 여기에 config.toml 을 만들면 읽기 전용 샌드박스가 풀린다(CVE-2026-35603)
  assert.match(out, /폴더 만들기: C:\\ProgramData\\openai\\codex/);
  assert.match(out, /icacls C:\\ProgramData\\openai \/inheritance:r \/grant:r \*S-1-5-32-544:\(OI\)\(CI\)F \*S-1-5-18:\(OI\)\(CI\)F \*S-1-5-32-545:\(OI\)\(CI\)RX/);
  assert.doesNotMatch(out, /webhooks\/1\/secret/);
});
