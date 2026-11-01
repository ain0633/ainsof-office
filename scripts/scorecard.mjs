#!/usr/bin/env node
// 작업 카드 성적표. 게이트 기록(events-*.jsonl)에서 카드마다 시도, 도구 호출, 사람 개입, 결과를 코드로 센다.
// 사용법: node scripts/scorecard.mjs [기록 폴더, 기본 C:\ainsof\log] [--sessions <봇 계정 .claude\projects 폴더>]
// --sessions 를 주면 봇 세션 파일에서 토큰을 찾아 API 환산 비용 칸을 채운다(그 파일을 읽을 수 있는 봇 계정에서 돌린다).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sumUsage } from "./usage.mjs";

const name = (role = "") => role.split(":").pop();

export function readEvents(dir) {
  return readdirSync(dir)
    .filter((n) => /^events-.*\.jsonl$/.test(n))
    .sort()
    .flatMap((n) => readFileSync(join(dir, n), "utf8").split("\n"))
    .flatMap((l) => {
      try {
        return l.trim() ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });
}

// 카드 번호는 PM 의 task.assigned 에만 있다. 같은 세션에서 뒤따르는 같은 역할의 agent.start 와 짝지어 agent_id 를 얻는다.
export function scorecard(events) {
  const cards = new Map();
  const byAgent = new Map();
  const waiting = [];
  const last = new Map(); // 봇마다 직전 기록 시각. 재시도 사이 대기는 일한 시간에 넣지 않는다
  for (const e of events) {
    const { role, session_id: sid, agent_id: aid } = e.actor ?? {};
    if (e.type === "task.assigned" && e.data?.card) {
      const c = cards.get(e.data.card) ?? { card: e.data.card, bot: name(e.data.to), tier: null, tries: 0, tools: 0, ask: 0, deny: 0, status: "?", ms: 0, agents: [] };
      c.tries++;
      c.tier = e.data.model ? `${e.data.model}/${e.data.effort ?? "-"}` : c.tier;
      cards.set(e.data.card, c);
      waiting.push({ c, sid, to: e.data.to });
    } else if (e.type === "agent.start" && aid) {
      const i = waiting.findIndex((w) => w.sid === sid && w.to === role);
      if (i >= 0) {
        const [{ c }] = waiting.splice(i, 1);
        byAgent.set(aid, c);
        last.set(aid, Date.parse(e.ts));
        c.agents.push(aid);
      }
    } else if (aid && byAgent.has(aid)) {
      const c = byAgent.get(aid);
      c.ms += Date.parse(e.ts) - last.get(aid);
      last.set(aid, Date.parse(e.ts));
      if (e.type === "tool.call") {
        c.tools++;
        if (e.data?.decision === "ask") c.ask++;
        if (e.data?.decision === "deny") c.deny++;
      }
      if (e.type === "task.result" && e.data?.status) c.status = e.data.status;
    }
  }
  return [...cards.values()];
}

// 재작업: 같은 카드를 다시 맡긴 횟수 + -fix 카드 수
export function totals(rows) {
  return {
    cards: rows.length,
    tries: rows.reduce((n, r) => n + r.tries, 0),
    rework: rows.reduce((n, r) => n + r.tries - 1 + (/-fix$/.test(r.card) ? 1 : 0), 0),
    ask: rows.reduce((n, r) => n + r.ask, 0),
    deny: rows.reduce((n, r) => n + r.deny, 0),
    tools: rows.reduce((n, r) => n + r.tools, 0),
    done: rows.filter((r) => r.status === "done").length,
  };
}

const agentFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? agentFiles(p) : /^agent-.*\.jsonl$/.test(d.name) ? [p] : [];
  });

export function addCost(rows, sessionsDir) {
  const files = agentFiles(sessionsDir);
  for (const r of rows) {
    const mine = files.filter((f) => r.agents.some((a) => f.includes(`agent-${a}`)));
    r.usd = mine.length ? mine.reduce((n, f) => n + sumUsage(readFileSync(f, "utf8").split("\n"), { estimateOutput: true }).usd, 0) : null;
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isCli) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--sessions");
  const sessions = at >= 0 ? args.splice(at, 2)[1] : null;
  const dir = args[0] ?? "C:\\ainsof\\log";
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`기록 폴더가 없습니다: ${dir}`);
    process.exit(1);
  }
  const rows = scorecard(readEvents(dir));
  if (sessions) addCost(rows, sessions);
  console.log("| 카드 | 봇 | 등급 | 시도 | 도구 호출 | 사람 승인 | 차단 | 결과 | 일한 분 | API 환산 |");
  console.log("|---|---|---|---:|---:|---:|---:|---|---:|---:|");
  for (const r of rows) console.log(`| ${r.card} | ${r.bot} | ${r.tier ?? "-"} | ${r.tries} | ${r.tools} | ${r.ask} | ${r.deny} | ${r.status} | ${(r.ms / 60000).toFixed(1)} | ${r.usd == null ? "-" : "$" + r.usd.toFixed(2)} |`);
  const t = totals(rows);
  console.log(`\n카드 ${t.cards}장, 끝낸 카드 ${t.done}장, 재작업 ${t.rework}번, 도구 호출 ${t.tools}건 중 사람 승인 ${t.ask}건, 차단 ${t.deny}건`);
}
