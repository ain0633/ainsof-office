// 승인 게이트 판정. 훅 입력과 규칙만 보고 allow / ask / deny 를 정한다 (부수효과 없음).
import { hasPersonalInfo } from "./redact.mjs";

export const short = (agentType) => String(agentType ?? "").split(":").pop();

// 셸 명령을 판정하기 쉽게 편다: 따옴표를 벗기고(하위 셸에 넘긴 명령도 보이게) git 의 전역 옵션(-C 경로 등)을 뺀다.
// ponytail: 정규식 수준의 정리다. 변수 조립·인코딩 같은 난독화는 못 푼다 — 그건 NTFS 권한과 네트워크 차단이 막는다(게이트-검토 2장).
export function normShell(cmd) {
  return String(cmd)
    .replace(/["'`]/g, " ")
    .replace(/\bgit(?:\.exe)?(?:\s+(?:-C|-c|--git-dir|--work-tree|--namespace)(?:=\S+|\s+\S+)|\s+--?[\w-]+(?:=\S+)?)*(?=\s+[a-z])/gi, "git");
}
// 출력 돌림(2>&1, > 파일, *> 파일)은 먼저 뺀다. 안 빼면 2>&1 의 & 에서 명령이 잘리고 "2>" 가 인자로 남는다(9단계 run 1)
const REDIRECT = /[\d*]?>>?(?:&\d+|\s*[^\s;&|]+)?/g;
// 따옴표 안의 ; & | 는 grep -E "a|Supabase" 같은 인자다. 실행기(bash -c, cmd /c, -Command, eval, iex) 바로 뒤 따옴표만 명령으로 보고 자른다(2026-10-21 오탐)
const LAUNCH_ARG = /(?:^|\s)(?:-[a-z]*c|\/[ck]|-command|eval|iex|invoke-expression)\s*$/i;
const maskQuoted = (cmd) => String(cmd).replace(/(["'])([\s\S]*?)\1/g, (m, q, body, off, all) => (LAUNCH_ARG.test(all.slice(0, off)) ? m : q + body.replace(/[;&|\n]/g, " ") + q));
const segments = (cmd) => normShell(maskQuoted(cmd)).replace(REDIRECT, " ").split(/[;&|\n]+/).map((s) => s.trim().split(/\s+/).filter(Boolean));
const bare = (x) => x.toLowerCase().replace(/\.(exe|cmd)$/, "");

// 명령 자리(줄 맨 앞, 또는 npx·bash -c 같은 실행기 바로 뒤)에 온 이름만 모은다. 커밋 메시지 속 단어는 세지 않는다.
const LAUNCHERS = new Set(["npx", "bunx", "dlx", "-c", "/c", "-command", "sudo", "start", "call", "&"]);
const atCommand = (t, k) => k === 0 || LAUNCHERS.has(t[k - 1].toLowerCase());

const PUBLISH = new Set(["aws", "az", "gcloud", "gsutil", "vercel", "netlify", "firebase", "wrangler", "supabase", "gh", "flyctl", "fly", "heroku", "railway"]);
// D21: gh 는 이슈·라벨·PR 설명 쓰기만 통과. 토큰도 저장소 1개, 코드는 읽기 전용이라 이 목록이 뚫려도 코드는 못 바꾼다
const GH_OK = { issue: ["create", "edit", "comment", "view", "list", "close", "reopen"], pr: ["view", "list", "diff", "checks", "comment", "edit"], label: ["list", "create", "edit"] };
const ghOk = (t, k) => GH_OK[t[k + 1]?.toLowerCase()]?.includes(t[k + 2]?.toLowerCase());
export const publishExternal = (cmd) =>
  segments(cmd).some((t) => t.some((x, k) => atCommand(t, k) && PUBLISH.has(bare(x)) && !(bare(x) === "gh" && ghOk(t, k)))) ||
  segments(cmd).some((t) => t.map(bare).join(" ").includes("npm publish"));

// 새 패키지 설치. 패키지 관리자 뒤 몇 칸 안에서 하위 명령을 찾는다(사이에 --prefix 같은 전역 옵션이 낄 수 있다).
const INSTALL = { npm: ["install", "i", "add"], pnpm: ["install", "i", "add", "dlx"], yarn: ["add", "dlx"], bun: ["install", "i", "add"], pip: ["install"], pip3: ["install"], pipx: ["install", "run"], uv: ["add"], poetry: ["add"], cargo: ["add", "install"], go: ["get", "install"], gem: ["install"], composer: ["require"] };
export function newDependency(cmd) {
  return segments(cmd).some((t) =>
    t.some((x, i) => {
      const pm = bare(x);
      if (pm === "bunx" || pm === "uvx") return true;
      if (pm === "npx") return t.slice(i + 1).some((y) => /^(-y|--yes|-p|--package)\b/.test(y));
      if (pm === "npm" && t[i + 1] === "pkg" && t[i + 2] === "set") return true;
      const subs = INSTALL[pm];
      if (!subs) return false;
      const j = t.findIndex((y, k) => k > i && k <= i + 4 && subs.includes(y.toLowerCase()));
      if (j < 0) return false;
      const rest = t.slice(j + 1);
      // -r requirements.txt 처럼 목록 파일을 가리키는 인자만 뺀다
      return rest.some((y, k) => !y.startsWith("-") && !/^(-r|--requirement|-c|--constraint)$/.test(rest[k - 1] ?? ""));
    }),
  );
}

// 넘김 저장소(handoff)의 bot/* 브랜치로 가는 푸시만 통과. 원격 주소를 바꾸는 명령도 막는다.
export function pushOutside(cmd) {
  return segments(cmd).some((t) => {
    const g = t.findIndex((x) => bare(x) === "git");
    if (g < 0) return false;
    const [sub, ...rest] = t.slice(g + 1);
    if (sub === "remote") return /^(add|set-url|rename|remove|rm)$/.test(rest[0] ?? "");
    if (sub === "config") return rest.some((x) => /^remote\./i.test(x));
    if (sub !== "push") return false;
    const [remote, ...refs] = rest.filter((x) => !x.startsWith("-"));
    return remote !== "handoff" || refs.length === 0 || refs.some((r) => !/^bot\//.test(r.replace(/^\+/, "").split(":").pop()));
  });
}

// 허용 목록 역할: 조각마다 첫 낱말(+하위 명령)이 목록에 있어야 하고, 출력 돌림은 쓰기 허용 경로·/dev/null·2>&1 만 된다. 걸린 조각을 돌려준다
const REDIRECT_OK = /^(\d?>&\d|[\d*]?>>?\s*(\/dev\/null|\$null|nul))$/i;
export function shellOutside(cmd, allow, okPath) {
  const target = (r) => r.replace(/^[\d*]?>>?\s*/, "").replace(/\\/g, "/").replace(/^\.\//, "");
  const redirect = [...normShell(maskQuoted(cmd)).matchAll(REDIRECT)].map((m) => m[0].trim()).find((r) => !REDIRECT_OK.test(r) && (r.includes("..") || !okPath?.test(target(r))));
  if (redirect) return redirect;
  // mkdir 은 쓰기 허용 경로 안에서만(QA봇의 qa/, 디자이너봇의 디자인 폴더). 인자마다 본다
  const outside = (t) => t[0] === "mkdir" && t.slice(1).some((x) => !x.startsWith("-") && (x.includes("..") || !okPath?.test(target(x))));
  return segments(cmd).map((t) => t.map(bare)).find((t) => t.length && (!allow.some((a) => a.every((w, i) => w === t[i])) || outside(t)))?.join(" ") ?? false;
}

const RECURSIVE =/\b(rm\s+(-\w*[rR]\w*|--recursive)\b|(Remove-Item|ri|rd|rmdir|del|erase)\b.*\s-r(e(c(u(r(s(e)?)?)?)?)?)?\b|(rmdir|rd|del)\s+\/s)/i;
const OUTSIDE = /([A-Za-z]:[\\/]|~|\.\.[\\/]|\$env:|\$\{?HOME\b|%\w+%|(^|\s)[\\/])/i;
export function deleteOutside(cmd) {
  return normShell(cmd)
    .split(/[;&|\n]+/)
    .some((seg) => RECURSIVE.test(seg) && OUTSIDE.test(seg));
}

// 명령 자리에 codex(npx @openai/codex 포함)가 오는지
export const codexCall = (cmd) => segments(cmd).some((t) => t.some((x, k) => atCommand(t, k) && /^(@openai\/)?codex(@[\w.-]+)?$/.test(bare(x))));

const CHECKS = {
  codexCall: (f) => codexCall(f.command),
  newDependency: (f) => newDependency(f.command),
  deleteOutside: (f) => deleteOutside(f.command),
  pushOutside: (f) => pushOutside(f.command),
  publishExternal: (f) => publishExternal(f.command),
  pii: (f) => hasPersonalInfo(f.everything),
};

// 도구 입력의 모든 문자열 값을 모은다. target 은 "어디를 건드리나"(경로·명령·주소·파일 패턴),
// everything 은 밖으로 나갈 수 있는 모든 값(파일 내용·검색어·URL·하위 에이전트 지시 포함)이다.
const PROSE = new Set(["content", "new_string", "old_string", "prompt", "description", "query", "text", "value"]);
function strings(v, key, out) {
  if (typeof v === "string") out.push([key, v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, k, out);
  return out;
}
function fields(tool, ti = {}) {
  const all = strings(ti, "", []);
  const prose = (k) => PROSE.has(k) || (tool === "Grep" && k === "pattern"); // Grep 의 pattern 은 파일이 아니라 내용 검색어
  const command = ti.command ?? "";
  return {
    path: ti.file_path ?? ti.path ?? ti.notebook_path ?? "",
    command,
    shell: normShell(command),
    url: ti.url ?? "",
    target: all.filter(([k]) => !prose(k)).map(([, v]) => v).join("\n"),
    everything: all.map(([, v]) => v).join("\n"),
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
const domainOk = (host, list) => list.some((d) => host === d || host.endsWith("." + d));

// 걸리면 true 또는 걸린 글자(정규식 규칙)·종류(개인정보)를 돌려준다
function matches(rule, tool, f) {
  if (rule.tools && !rule.tools.test(tool)) return false;
  // 걸리면 걸린 명령 조각을 돌려준다. 긴 명령의 앞부분만 보이면 무엇을 승인하는지 모른다(2026-10-21)
  if (rule.check) {
    const hit = CHECKS[rule.check](f);
    if (!hit || !f.command || rule.check === "pii") return hit; // pii 는 걸린 종류(휴대폰 등)를 사유에 쓴다
    return f.command.split(/[;&|\n]+/).map((s) => s.trim()).find((s) => s && CHECKS[rule.check]({ ...f, command: s })) ?? hit;
  }
  if (!rule.field) return true;
  return rule.re.exec(f[rule.field])?.[0] ?? false;
}

// hit: 정규식이 잡은 글자. 로그에 남겨 오탐 원인을 찾는다(2026-10-15 git.history 건은 명령이 잘려 원인을 못 찾았다)
const verdict = (decision, rule, reason, hit) => ({ decision, rule, reason, ...(typeof hit === "string" && rule !== "pii.input" && { hit: hit.slice(0, 80) }) });

export function decide(input, rules) {
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  const roleName = input.agent_type ?? "main";
  const role = rules.roles[roleName];
  if (!role) return verdict("deny", "role.unknown", `등록되지 않은 역할: ${roleName}`);
  // 하위 봇이 결과를 부모에게 돌려주는 Claude Code 내장 도구. 막으면 보고서가 사라진다(2026-10-14 실기)
  if (tool === "SubagentHandback") return verdict("allow", "ok", "");
  if (!role.tools.includes(tool)) return verdict("deny", "role.tool", `${short(roleName)}는 ${tool}을 쓸 수 없음`);
  // 플러그인 이름까지 비교한다. 다른 플러그인의 같은 이름 봇은 부를 수 없다
  if (tool === "Agent" && !(role.agents ?? []).some((a) => ti.subagent_type === a || ti.subagent_type === `ainsof-office:${a}`)) return verdict("deny", "role.agent", `부를 수 없는 봇: ${ti.subagent_type}`);

  const f = fields(tool, ti);
  // QA봇·디자이너봇처럼 쓰기 경로·명령을 좁힌 역할(D30, D31). 채점하는 봇이 채점받는 코드를, 디자이너가 앱 코드를 고치지 못하게 한다
  if (role.writePaths && /^(Write|Edit|NotebookEdit)$/.test(tool) && !role.writePaths.test(f.path.replace(/\\/g, "/"))) return verdict("deny", "role.write", `${short(roleName)}가 쓸 수 없는 경로`);
  if (role.shellAllow && /^(Bash|PowerShell)$/.test(tool)) {
    const bad = shellOutside(f.command, role.shellAllow, role.writePaths);
    if (bad) return verdict("deny", "role.shell", `${short(roleName)} 허용 목록 밖 명령`, bad);
  }
  for (const r of rules.deny) {
    if (r.except === roleName) continue;
    const m = matches(r, tool, f);
    if (m) return verdict("deny", r.id, r.reason, m);
  }
  if (tool === "WebFetch" && role.webfetchDomains && !domainOk(hostOf(f.url), role.webfetchDomains)) return verdict("deny", "web.scope", `허용 도메인 밖: ${hostOf(f.url)}`);
  if (tool.endsWith("__browser_navigate") && role.browserHosts && !role.browserHosts.includes(hostOf(f.url))) return verdict("deny", "web.scope", `로컬 앱 밖: ${hostOf(f.url)}`);
  for (const r of rules.ask) {
    const m = matches(r, tool, f);
    if (m) return verdict("ask", r.id, r.id === "pii.input" ? `${r.reason}: ${m}` : r.reason, m); // 개인정보는 걸린 종류를 붙인다
  }
  return verdict("allow", "ok", "");
}
