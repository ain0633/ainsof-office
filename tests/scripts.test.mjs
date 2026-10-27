import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sumUsage, summarizeSession } from "../scripts/usage.mjs";

const line = (o) => JSON.stringify(o);
const usageLine = (id, model, usage, ts) => line({ type: "assistant", timestamp: ts, message: { id, model, usage } });

test("사용량 합산: 같은 응답이 여러 줄이어도 한 번만 세고, CEO 입력만 센다", () => {
  const u = { input_tokens: 10, output_tokens: 1000, cache_read_input_tokens: 100000, cache_creation_input_tokens: 0 };
  const t = sumUsage([
    line({ type: "user", timestamp: "2026-10-12T00:00:00Z", message: { content: "시작" } }),
    line({ type: "user", message: { content: [{ type: "text", text: "<ide_opened_file>a</ide_opened_file> 이어서" }] } }),
    line({ type: "user", message: { content: [{ type: "text", text: "<task-notification>끝남</task-notification>" }] } }),
    line({ type: "user", message: { content: [{ type: "tool_result", content: "결과" }] } }),
    usageLine("m1", "claude-opus-5-5", u, "2026-10-12T00:01:00Z"),
    usageLine("m1", "claude-opus-5-5", u, "2026-10-12T00:01:00Z"),
  ]);
  assert.equal(t.requests, 1);
  assert.equal(t.userTurns, 2);
  // 10*$4 + 100000*$0.2 + 1000*$20 = 40,040 / 1e6
  assert.ok(Math.abs(t.usd - 0.04004) < 1e-9);
  assert.equal(t.start, "2026-10-12T00:00:00Z");
  assert.equal(t.end, "2026-10-12T00:01:00Z");
});

test("사용량 합산: 서브에이전트 기록을 역할별로 나눈다", () => {
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  const main = join(dir, "s1.jsonl");
  writeFileSync(main, usageLine("a", "claude-opus-5-5", { input_tokens: 1, output_tokens: 1 }, "2026-10-12T00:00:00Z"));
  mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
  writeFileSync(join(dir, "s1", "subagents", "agent-x.jsonl"), usageLine("b", "claude-sonnet-5-5", { input_tokens: 1, output_tokens: 1 }, "2026-10-12T00:00:05Z"));
  writeFileSync(join(dir, "s1", "subagents", "agent-x.meta.json"), line({ agentType: "ainsof-office:researcher" }));
  const rows = summarizeSession(main);
  assert.deepEqual(Object.keys(rows).sort(), ["ainsof-office:researcher", "main"]);
  assert.equal(rows["ainsof-office:researcher"].requests, 1);
});

// 하위 봇 기록의 output_tokens 는 응답 시작 때 값(5~8)만 남는다(P0 run 1, 2026-10-14). 내용 글자 수로 추정한다.
test("사용량 합산: 하위 봇 출력 토큰은 여러 줄에 나뉜 내용 글자 수로 추정한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  const main = join(dir, "s1.jsonl");
  const u = { input_tokens: 1, output_tokens: 5 };
  const part = (content) => line({ type: "assistant", timestamp: "2026-10-12T00:00:00Z", message: { id: "b", model: "claude-opus-5-5", usage: u, content } });
  writeFileSync(main, part([{ type: "text", text: "x".repeat(800) }])); // 메인은 기록값을 그대로 쓴다
  mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
  writeFileSync(join(dir, "s1", "subagents", "agent-x.jsonl"), [part([{ type: "text", text: "x".repeat(400) }]), part([{ type: "tool_use", input: { q: "x".repeat(392) } }])].join("\n"));
  const rows = summarizeSession(main);
  assert.equal(rows.main.output, 5);
  assert.equal(rows.unknown.output, 1000); // (400 + 400) / 0.8
  assert.equal(rows.unknown.estimated, 1);
});
