#!/usr/bin/env node
// 세션 기록(JSONL)의 사용량을 합산한다.
// 사용법: node scripts/usage.mjs <세션.jsonl> [<세션.jsonl> ...]
// 세션 폴더의 subagents/agent-*.jsonl 도 찾아서 역할(agentType)별로 더한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 100만 토큰당 달러 (2026-09-25 기준). 캐시 쓰기 배수 5분 1.25 / 1시간 2.0 은 추정.
export const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2 },
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1 },
  "claude-fable-5-1": { in: 10, out: 50, read: 0.25 },
};
const priceOf = (model = "") => PRICES[Object.keys(PRICES).find((k) => model.startsWith(k))] ?? null;

// 출력 토큰 1개당 기록에 남는 글자 수. CEO 계정 메인 세션 3개(응답 881개)에서 잰 값 0.82(2026-10-14).
// thinking 은 기록에 거의 안 남아 토큰보다 글자가 적다. ponytail: 하위 봇도 같은 비율이라고 가정한다.
export const CHARS_PER_TOKEN = 0.8;
const charsOf = (c) => (c?.type === "text" ? c.text : c?.type === "thinking" ? c.thinking : c?.type === "tool_use" ? JSON.stringify(c.input) : "")?.length ?? 0;

// estimateOutput: 하위 봇 기록은 output_tokens 에 응답 시작 때 값만 남으므로 내용 글자 수로 추정한 값과 큰 쪽을 쓴다.
export function sumUsage(lines, { estimateOutput = false } = {}) {
  const resp = new Map(); // 한 응답이 여러 줄로 나뉘어 저장된다
  const t = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0, unpriced: 0, estimated: 0, userTurns: 0, start: null, end: null };
  for (const line of lines) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.timestamp && (d.type === "user" || d.type === "assistant")) {
      t.start = t.start && t.start < d.timestamp ? t.start : d.timestamp;
      t.end = t.end && t.end > d.timestamp ? t.end : d.timestamp;
    }
    if (d.type === "user" && !d.isMeta) {
      const c = d.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join(" ") : "";
      if (text.trim() && !/^\s*<(task-notification|system-reminder|local-command)/.test(text)) t.userTurns++;
    }
    const m = d.message;
    if (d.type !== "assistant" || !m?.usage) continue;
    const key = m.id ?? d.uuid;
    if (!resp.has(key)) resp.set(key, { u: m.usage, model: m.model, chars: 0 });
    for (const c of Array.isArray(m.content) ? m.content : []) resp.get(key).chars += charsOf(c);
  }
  for (const { u, model, chars } of resp.values()) {
    let out = u.output_tokens ?? 0;
    if (estimateOutput && chars / CHARS_PER_TOKEN > out) {
      out = Math.round(chars / CHARS_PER_TOKEN);
      t.estimated++;
    }
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5m = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1h);
    t.requests++;
    t.input += u.input_tokens ?? 0;
    t.output += out;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
    t.cacheWrite += w5m + w1h;
    const p = priceOf(model);
    if (!p) {
      t.unpriced++;
      continue;
    }
    t.usd += ((u.input_tokens ?? 0) * p.in + w5m * p.in * 1.25 + w1h * p.in * 2 + (u.cache_read_input_tokens ?? 0) * p.read + out * p.out) / 1e6;
  }
  return t;
}

const linesOf = (file) => readFileSync(file, "utf8").split("\n");

export function summarizeSession(file) {
  const rows = { main: sumUsage(linesOf(file)) };
  const sub = join(dirname(file), basename(file, ".jsonl"), "subagents");
  if (existsSync(sub)) {
    for (const f of readdirSync(sub).filter((n) => n.endsWith(".jsonl"))) {
      const metaFile = join(sub, f.replace(/\.jsonl$/, ".meta.json"));
      const role = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")).agentType : "unknown";
      const u = sumUsage(linesOf(join(sub, f)), { estimateOutput: true });
      const prev = rows[role];
      rows[role] = prev ? Object.fromEntries(Object.keys(u).map((k) => [k, typeof u[k] === "number" ? prev[k] + u[k] : prev[k] ?? u[k]])) : u;
    }
  }
  return rows;
}

const isCli = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isCli) {
  for (const file of process.argv.slice(2)) {
    const rows = summarizeSession(file);
    const m = rows.main;
    const minutes = m.start && m.end ? Math.round((Date.parse(m.end) - Date.parse(m.start)) / 60000) : "?";
    console.log(`\n## ${basename(file)} — ${minutes}분, CEO 입력 ${m.userTurns}번`);
    console.log("| 역할 | 요청 | 입력 | 출력 | 캐시 읽기 | 캐시 쓰기 | API 환산(추정) |");
    console.log("|---|---|---|---|---|---|---|");
    let total = 0;
    for (const [role, t] of Object.entries(rows)) {
      total += t.usd;
      console.log(`| ${role} | ${t.requests} | ${t.input} | ${t.output} | ${t.cacheRead} | ${t.cacheWrite} | $${t.usd.toFixed(2)}${t.unpriced ? ` (+가격 모름 ${t.unpriced})` : ""}${t.estimated ? ` (출력 추정 ${t.estimated}건)` : ""} |`);
    }
    console.log(`| **합계** | | | | | | **$${total.toFixed(2)}** |`);
  }
}
