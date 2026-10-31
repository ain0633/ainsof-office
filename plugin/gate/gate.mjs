#!/usr/bin/env node
// 승인 게이트 진입점. 두 군데서 부른다: `node gate.mjs <pre|post|agent-start|agent-stop|compact> [--plugin]`
// - 단단한 설치: 관리자 설정(managed-settings)의 훅. 봇 계정(BOT_USER)의 호출만 본다.
// - 간단 설치: 플러그인 훅(--plugin). 사람과 같은 계정이라 이 회사 봇(ainsof-office:*)의 호출만 본다.
//   봇 계정에서는 관리자 훅이 이미 보므로 아무것도 하지 않는다.
import { readFileSync, existsSync } from "node:fs";
import { userInfo, homedir } from "node:os";
import { join } from "node:path";
import { decide, short } from "./decide.mjs";
import { loadRules, BOT_USER } from "./rules.mjs";
import { redact, summarize } from "./redact.mjs";
import { appendEvent, appendReport, bumpCounters } from "./log.mjs";

const NAMES = { operator: "PM", researcher: "리서치봇", developer: "개발봇", reviewer: "검수봇", qa: "QA봇", designer: "디자이너봇", codereview: "코드리뷰봇", main: "메인" };
const nameOf = (agentType) => NAMES[short(agentType)] ?? short(agentType);

// 승인 요청 알림에 쓸 말. DM 버튼에는 도구 이름만 와서 CEO 가 판단할 수 없었다(2026-10-15)
const VERB = { Write: "파일 쓰기", Edit: "파일 고치기", Read: "파일 읽기", Bash: "명령 실행", PowerShell: "명령 실행", WebFetch: "웹 페이지 열기", WebSearch: "웹 검색", Agent: "봇 부르기", Glob: "파일 찾기", Grep: "파일 내용 찾기" };
const AFTER = {
  "pii.input": "그대로 진행됩니다. 파일에 쓰는 거면 나중에 고칠 수 있고, 밖으로 보내는 거면 되돌릴 수 없습니다",
  "net.http": "외부와 통신합니다. 보낸 내용은 되돌릴 수 없습니다",
  "dependency.new": "새 패키지가 설치되고 목록 파일이 바뀝니다. 지우면 되돌릴 수 있습니다",
  "dependency.manifest": "의존성 목록 파일이 바뀝니다. 커밋 전이면 쉽게 되돌릴 수 있습니다",
  "git.history": "git 기록이 바뀌거나 변경이 버려집니다. 되돌리기 어려울 수 있습니다",
};
const code = (s) => "`" + String(s).replace(/`/g, "'") + "`"; // 코드 표시: 디스코드가 \. 의 역슬래시를 지우지 않게

export function gateMessage(who, tool, target, r, ceoId) {
  const lines = [
    `• ${r.decision === "deny" ? "하려던" : "하려는"} 일: ${VERB[tool] ?? tool.split("__").pop()}${target ? ": " + code(target) : ""}`,
    `• ${r.decision === "deny" ? "막은" : "묻는"} 이유: ${r.reason}`,
    ...(r.hit ? [`• 걸린 부분: ${code(r.hit)}`] : []),
    r.decision === "deny" ? "• 봇은 다시 시도하지 않고 PM에게 보고합니다" : `• 승인하면: ${AFTER[r.rule] ?? "그대로 진행됩니다"}`,
  ];
  const head = r.decision === "deny" ? `⛔ **${who}의 동작을 막았습니다** (${r.rule})` : `${ceoId ? `<@${ceoId}> ` : ""}🔐 **${who}이 승인을 요청합니다** (${r.rule}) — DM 버튼이나 사무실 페이지 결재함에서 답해 주세요`;
  return [head, ...lines].join("\n");
}

export async function postDiscord(url, username, content, mention) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, content: redact(content).slice(0, 1900), allowed_mentions: mention ? { users: [mention] } : { parse: [] } }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // 디스코드 장애가 게이트를 막지 않는다
  }
}

// 회사 폴더(로그·비밀 설정). 단단한 설치는 C:\ainsof 고정
export const HOME = process.env.AINSOF_HOME ?? (process.platform === "win32" ? "C:\\ainsof" : join(homedir(), "ainsof"));

export function active(user, botUser, agentType, plugin) {
  const bot = String(user).toLowerCase() === botUser.toLowerCase();
  return plugin ? !bot && String(agentType ?? "").startsWith("ainsof-office:") : bot;
}

export async function handle(mode, input, ctx) {
  if (!active(ctx.user, ctx.rules.botUser, input.agent_type, ctx.plugin)) return null;
  const role = input.agent_type ?? "main";
  const actor = { role, session_id: input.session_id, agent_id: input.agent_id };
  const say = (text, mention) => (ctx.post ?? postDiscord)(ctx.webhook, nameOf(role), text, mention);
  const ti = input.tool_input ?? {};

  if (mode === "pre") {
    let r = decide(input, ctx.rules);
    if (r.decision !== "deny") {
      const c = bumpCounters(ctx.logDir, input);
      if (c.repeat >= ctx.rules.limits.repeatSame) r = { decision: "deny", rule: "limit.repeat", reason: `같은 호출 ${c.repeat}번 연속` };
      else if (c.daily > ctx.rules.limits.dailyToolCalls) r = { decision: "deny", rule: "limit.daily", reason: "하루 도구 호출 상한" };
    }
    const target = redact(summarize(input.tool_name, ti));
    appendEvent(ctx.logDir, { type: "tool.call", actor, data: { tool: input.tool_name, target, decision: r.decision, rule: r.rule, ...(r.decision !== "allow" && { reason: r.reason }), ...(r.hit && { hit: redact(r.hit) }) } });
    if (/^mcp__(plugin_discord_discord__(reply|edit_message)|office__reply)$/.test(input.tool_name) && r.decision !== "deny" && ti.text) appendReport(ctx.logDir, nameOf(role) + (r.decision === "ask" ? " (CEO 승인 뒤 전송)" : ""), redact(ti.text));
    if (input.tool_name === "Agent" && r.decision === "allow") {
      const card = /\bid:\s*([\w-]+)/.exec(ti.prompt ?? "")?.[1] ?? null;
      // PM 이 부를 때 고른 모델·생각 깊이(있을 때만). 등급 규칙이 실제로 지켜졌는지 회고에서 센다
      const pick = { ...(typeof ti.model === "string" && { model: ti.model }), ...(typeof ti.effort === "string" && { effort: ti.effort }) };
      appendEvent(ctx.logDir, { type: "task.assigned", actor, data: { to: ti.subagent_type, card, ...pick } });
      await say(`[${card ?? "작업"}] → ${nameOf(ti.subagent_type)} · 배정 · ${redact(ti.description ?? "")}`);
    }
    if (r.decision !== "allow") await say(gateMessage(nameOf(role), input.tool_name, target, r, r.decision === "ask" ? ctx.ceoId : null), r.decision === "ask" ? ctx.ceoId || undefined : undefined);
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: r.decision, permissionDecisionReason: `[${r.rule}] ${r.reason}` } };
  }
  if (mode === "post") {
    appendEvent(ctx.logDir, { type: "tool.result", actor, data: { tool: input.tool_name } });
    // 봇을 백그라운드로 돌리면 Agent 는 맡기자마자 끝나 상태가 없고, 결과는 봇의 SubagentHandback 으로 돌아온다
    if (input.tool_name === "Agent" || input.tool_name === "SubagentHandback") {
      // Agent 의 ti 는 PM 이 쓴 지시문이라 결과가 아니다. 결과는 tool_response, SubagentHandback 은 ti 에 있다
      const status = /status:\s*(done|needs_approval|blocked|failed)\b/.exec(JSON.stringify([input.tool_name === "Agent" ? "" : ti, input.tool_response ?? ""]))?.[1];
      if (status || input.tool_name === "SubagentHandback") {
        const from = input.tool_name === "Agent" ? ti.subagent_type : role;
        appendEvent(ctx.logDir, { type: "task.result", actor, data: { from, status: status ?? "unknown" } });
        await say(`[작업] ${nameOf(from)} · ${status ?? "unknown"}`);
      }
    }
    return null;
  }
  if (mode === "agent-start" || mode === "agent-stop" || mode === "compact") {
    appendEvent(ctx.logDir, { type: mode === "compact" ? "compact" : mode.replace("-", "."), actor, data: {} });
  }
  return null;
}

// 경로 표기(대소문자·슬래시·짧은 이름)가 달라도 어긋나지 않게 파일 이름으로만 본다. 어긋나면 판정 없이 통과돼 버린다.
const isCli = /(^|[\\/])gate\.mjs$/i.test(process.argv[1] ?? "");
const plugin = process.argv.includes("--plugin");
const user = userInfo().username;
if (isCli && (plugin || user.toLowerCase() === BOT_USER.toLowerCase())) {
  const mode = process.argv[2] ?? "pre";
  let result = null;
  let input = null;
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
    // 비밀 설정(디스코드 웹후크)은 봇이 못 읽는 곳에 둔다: 단단한 설치는 관리자 폴더, 간단 설치는 회사 폴더(게이트 secret.keys 가 막음)
    const secrets = plugin ? join(HOME, "secrets.json") : new URL("./secrets.json", import.meta.url);
    const s = existsSync(secrets) ? JSON.parse(readFileSync(secrets, "utf8")) : {};
    result = await handle(mode, input, { user, plugin, rules: loadRules(), logDir: join(HOME, "log"), webhook: s.discordWebhook ?? null, ceoId: s.ceoDiscordId ?? null });
  } catch (e) {
    // 게이트가 고장 나면 막는다 (fail closed). 간단 설치에서 사람의 다른 세션까지 막지는 않는다
    if (mode === "pre" && (!plugin || active(user, BOT_USER, input?.agent_type, true))) result = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[gate.error] ${e.message}` } };
  }
  if (result) process.stdout.write(JSON.stringify(result));
}
