import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { decide, newDependency, deleteOutside } from "../plugin/gate/decide.mjs";
import { loadRules } from "../plugin/gate/rules.mjs";
import { cases, reviewCases } from "./redteam-cases.mjs";

const rules = loadRules();

for (const c of [...cases, ...reviewCases]) {
  test(`레드팀 ${c.no}: ${c.title}`, () => {
    const r = decide({ agent_type: c.agent_type, tool_name: c.tool_name, tool_input: c.tool_input }, rules);
    assert.equal(r.decision, c.expect, r.reason);
    assert.equal(r.rule, c.rule);
  });
}

test("새 의존성 판별", () => {
  assert.equal(newDependency("npm install"), false);
  assert.equal(newDependency("npm ci && npm test"), false);
  assert.equal(newDependency("npm i -D vitest"), true);
  assert.equal(newDependency("python -m pip install requests"), true);
  assert.equal(newDependency("pip install -r requirements.txt"), false);
});

test("작업 폴더 밖 삭제 판별", () => {
  assert.equal(deleteOutside("rm -rf dist"), false);
  assert.equal(deleteOutside("rm -rf /"), true);
  assert.equal(deleteOutside("rm -r ../other"), true);
  assert.equal(deleteOutside("Remove-Item -Recurse .\\build"), false);
});

test("개인정보가 섞인 쓰기는 승인 요청", () => {
  const r = decide({ agent_type: "ainsof-office:developer", tool_name: "Write", tool_input: { file_path: "a.md", content: "연락처 010-1234-5678" } }, rules);
  assert.equal(r.decision, "ask");
  assert.equal(r.rule, "pii.input");
  assert.match(r.reason, /휴대폰/); // 어떤 종류로 걸렸는지 남겨 잘못 잡은 경우를 가린다 (8단계 L6, 2026-10-14)
});

test("프로젝트 규칙(rules.d/*.json)의 도메인이 더해진다", () => {
  const dir = mkdtempSync(join(tmpdir(), "rules-"));
  writeFileSync(join(dir, "app.json"), JSON.stringify({ "ainsof-office:developer": { webfetchDomains: ["example.org"] } }));
  const r = decide({ agent_type: "ainsof-office:developer", tool_name: "WebFetch", tool_input: { url: "https://example.org/docs", prompt: "x" } }, loadRules(dir));
  assert.equal(r.decision, "allow");
});
