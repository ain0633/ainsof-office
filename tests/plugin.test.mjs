import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules } from "../plugin/gate/rules.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const frontmatter = (file) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"));
  return Object.fromEntries(m[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
};

test("역할 정의의 tools 와 게이트 규칙의 tools 가 같다", () => {
  const rules = loadRules();
  const files = readdirSync(join(root, "plugin", "agents"));
  assert.deepEqual(files.sort(), ["codereview.md", "designer.md", "developer.md", "operator.md", "qa.md", "researcher.md", "reviewer.md"]);
  for (const f of files) {
    const fm = frontmatter(join(root, "plugin", "agents", f));
    const tools = fm.tools.split(",").map((t) => t.trim());
    assert.deepEqual([...tools].sort(), [...rules.roles[`ainsof-office:${fm.name}`].tools].sort(), f);
  }
});

test("플러그인 매니페스트·MCP 설정·스킬이 읽힌다", () => {
  assert.equal(JSON.parse(readFileSync(join(root, "plugin", ".claude-plugin", "plugin.json"), "utf8")).name, "ainsof-office");
  const mcp = JSON.parse(readFileSync(join(root, "plugin", ".mcp.json"), "utf8")).mcpServers;
  assert.deepEqual(Object.keys(mcp).sort(), ["pw-local", "pw-read"]);
  assert.ok(mcp["pw-local"].args.includes("--allowed-origins"));
  assert.match(mcp["pw-local"].args.join(" "), /localhost:8080/); // vite 개발 서버 포트(2026-10-22: 빠져 있어 ERR_BLOCKED_BY_CLIENT)
  assert.ok(mcp["pw-read"].args.includes("--isolated"));
  for (const s of ["task-card", "research-claims", "review-findings", "retro", "design-brief", "design-output"]) assert.equal(frontmatter(join(root, "plugin", "skills", s, "SKILL.md")).name, s);
});

// 레시피(봇 정의·스킬)는 다른 사무실에서도 읽히게 쓴다. 이유·사건은 결정로그에 둔다
const RECIPES = [
  ...readdirSync(join(root, "plugin", "agents")).map((f) => join("agents", f)),
  ...readdirSync(join(root, "plugin", "skills")).map((d) => join("skills", d, "SKILL.md")),
];
const hits = (re, skip = []) =>
  RECIPES.filter((f) => !skip.includes(f)).flatMap((f) =>
    readFileSync(join(root, "plugin", f), "utf8").split(/\r?\n/).flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1} ${l.match(re)[0]}`] : [])),
  );

test("레시피에 사건 날짜·결정 번호·마일스톤 꼬리표가 없다", () => {
  assert.deepEqual(hits(/\b20\d\d-\d\d-\d\d\b|(?<![\w./])\d{1,2}\/\d{1,2}(?![\w/])|\d+단계 L\d|\bD\d{1,2}\b|P0~M\d|P0에서는/), []);
});

test("레시피에 특정 프로젝트 이름·설정·예시가 없다", () => {
  assert.deepEqual(hits(/VITE_|localhost:8080|\bP\d-[A-Z]\d/i), []);
});

// 모델은 몇 주면 바뀐다. PM 지침에는 등급만 쓰고, 등급 → 모델은 대응표 한 곳에서 고친다
test("PM 지침 본문에는 모델 이름이 없고, 대응표가 T1~T3 를 모두 정한다", () => {
  const body = readFileSync(join(root, "plugin", "agents", "operator.md"), "utf8").replace(/^---[\s\S]*?---/, "");
  assert.doesNotMatch(body, /\b(haiku|sonnet|opus|fable|gpt-\d)/i);
  assert.match(body, /model-tiers\.md/);
  const tiers = readFileSync(join(root, "plugin", "model-tiers.md"), "utf8");
  for (const t of ["T1", "T2", "T3"]) assert.match(tiers, new RegExp(`^\\| ${t} [^|]*\\| (haiku|sonnet|opus) \\|`, "m"), t);
  assert.match(tiers, /기준일: \d{4}-\d\d-\d\d/);
});
