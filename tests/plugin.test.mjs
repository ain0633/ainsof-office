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
  assert.deepEqual(files.sort(), ["designer.md", "developer.md", "operator.md", "qa.md", "researcher.md", "reviewer.md"]);
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
