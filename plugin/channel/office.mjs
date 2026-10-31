#!/usr/bin/env node
// ainsof Office 채널: 노트북 안의 사무실 페이지 ↔ PM 세션.
// Claude Code 가 PM 세션을 켤 때 이 파일을 함께 띄운다(MCP, stdio 한 줄 JSON). 의존성 없음.
// 페이지는 127.0.0.1 에서만 열리고, 디스코드 #office 로 보낸 6자리 코드로 짝지은 브라우저만 지시·결재할 수 있다.
// 디스코드가 있으면 코드는 메모리에만 있다. 봇이 파일을 뒤져도 없고, 봇 브라우저는 이 포트를 못 연다(pw-local 허용 주소·게이트 office.page).
// 디스코드가 없으면(간단 설치) 코드를 회사 폴더의 office-pairing.txt 에 쓴다.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { randomBytes, randomInt } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.OFFICE_PORT ?? 7777);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]); // DNS 리바인딩으로 다른 이름이 들어오지 못하게
const WEB = join(dirname(fileURLToPath(import.meta.url)), "web");
// 회사 폴더. 게이트 gate.mjs 의 HOME 과 같게 정한다
const HOME = process.env.AINSOF_HOME ?? (process.platform === "win32" ? "C:\\ainsof" : join(homedir(), "ainsof"));
const LOG_DIR = process.env.OFFICE_LOG_DIR ?? join(HOME, "log");
// 단단한 설치는 관리자 폴더, 간단 설치는 회사 폴더의 secrets.json
const HARD_SECRETS = "C:\\Program Files\\ainsof\\gate\\secrets.json";
const SECRETS = process.env.OFFICE_SECRETS ?? (existsSync(HARD_SECRETS) ? HARD_SECRETS : join(HOME, "secrets.json"));
// 디스코드가 없을 때 짝짓기 코드를 두는 파일. 봇은 게이트(secret.keys)가 막는다 — 같은 계정이라 실수 방지 수준
const PAIRING_FILE = process.env.OFFICE_PAIRING_FILE ?? join(HOME, "office-pairing.txt");
const today = () => new Date().toLocaleDateString("sv-SE"); // 게이트 log.mjs 와 같은 파일 이름
const now = () => new Date().toISOString();
const err = (...a) => process.stderr.write(a.join(" ") + "\n"); // stdout 은 MCP 전용

// ---------- MCP (stdio) ----------
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
const notify = (method, params) => send({ method, params });
const INSTRUCTIONS =
  'CEO가 사무실 페이지에서 보낸 지시는 <channel source="office" ...> 로 온다. 디스코드 지시와 똑같이 다룬다(접수 카드 포함). ' +
  "답은 이 채널의 reply 도구에 text 만 넣어 보낸다. 이 채널은 짝지은 CEO 브라우저만 쓸 수 있다.";
const REPLY = {
  name: "reply",
  description: "사무실 페이지의 CEO에게 답한다",
  inputSchema: { type: "object", properties: { text: { type: "string", description: "보낼 말" } }, required: ["text"] },
};
const pending = new Map(); // 열린 승인 요청 request_id → {tool_name, description, input_preview}

const rpc = createInterface({ input: process.stdin });
rpc.on("close", () => process.exit(0)); // PM 세션이 끝나면 같이 끝난다
rpc.on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  const p = m.params ?? {};
  if (m.method === "initialize") {
    return send({
      id: m.id,
      result: {
        protocolVersion: p.protocolVersion ?? "2025-06-18",
        capabilities: { experimental: { "claude/channel": {}, "claude/channel/permission": {} }, tools: {} },
        serverInfo: { name: "office", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      },
    });
  }
  if (m.method === "tools/list") return send({ id: m.id, result: { tools: [REPLY] } });
  if (m.method === "tools/call") {
    if (p.name !== "reply") return send({ id: m.id, error: { code: -32602, message: `unknown tool: ${p.name}` } });
    remember("reply", { text: String(p.arguments?.text ?? ""), ts: now() });
    return send({ id: m.id, result: { content: [{ type: "text", text: "sent" }] } });
  }
  if (m.method === "notifications/claude/channel/permission_request") {
    const req = { request_id: p.request_id, tool_name: p.tool_name, description: p.description, input_preview: p.input_preview };
    pending.set(p.request_id, req);
    return broadcast("permission", req);
  }
  if (m.method === "ping") return send({ id: m.id, result: {} });
  if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } });
});

// ---------- 짝짓기 ----------
const secrets = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, "utf8")) : {};
const sessions = new Set();
let code = "";
let misses = 0;
async function newCode() {
  code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  misses = 0;
  if (!secrets.discordWebhook) {
    mkdirSync(dirname(PAIRING_FILE), { recursive: true });
    return writeFileSync(PAIRING_FILE, `${code}\n`, "utf8");
  }
  try {
    await fetch(secrets.discordWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "사무실", content: `🐾 사무실 페이지 짝짓기 코드: **${code}** — ${ORIGIN} 에서 넣어 주세요`, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    err("[office] 짝짓기 코드 전송 실패:", e.message);
  }
}
const cookieOf = (req) => /(?:^|;\s*)office=([0-9a-f]{64})/.exec(req.headers.cookie ?? "")?.[1];
const paired = (req) => sessions.has(cookieOf(req));

// ---------- 실시간 (SSE) ----------
const clients = new Set();
function broadcast(event, data) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(chunk);
}
// 대화는 날짜별 파일에도 남긴다. 다시 접속하거나 운영실을 다시 켜도 그날 대화가 보인다(10/23 CEO)
// 한계: 오늘 파일만 읽는다. 지난 날 대화가 필요하면 그때 날짜 고르기를 붙인다
const chatFile = () => join(LOG_DIR, `office-chat-${today()}.jsonl`);
const history = existsSync(chatFile())
  ? readFileSync(chatFile(), "utf8").split("\n").flatMap((l) => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } }).slice(-200)
  : [];
function remember(kind, data) {
  history.push({ kind, ...data });
  if (history.length > 200) history.shift();
  try {
    appendFileSync(chatFile(), JSON.stringify({ kind, ...data }) + "\n", "utf8");
  } catch (e) {
    err("[office] 대화 저장 실패:", e.message);
  }
  broadcast(kind, data);
}
// 작업 기록은 1초마다 늘어난 만큼만 읽는다(fs.watch 는 윈도에서 들쭉날쭉하다)
let file = "";
let offset = 0;
function readNew() {
  const f = join(LOG_DIR, `events-${today()}.jsonl`);
  if (f !== file) [file, offset] = [f, 0];
  if (!existsSync(f)) return [];
  const size = statSync(f).size;
  if (size <= offset) return [];
  const fd = openSync(f, "r");
  const buf = Buffer.alloc(size - offset);
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  const text = buf.toString("utf8");
  const end = text.lastIndexOf("\n") + 1; // 쓰는 중인 마지막 줄은 다음에 읽는다
  offset += Buffer.byteLength(text.slice(0, end));
  return text.slice(0, end).split("\n").filter(Boolean);
}
const backlog = [];
for (const line of readNew()) backlog.push(line);
backlog.splice(0, Math.max(0, backlog.length - 200));
setInterval(() => {
  for (const line of readNew()) {
    backlog.push(line);
    if (backlog.length > 200) backlog.shift();
    for (const res of clients) res.write(`event: log\ndata: ${line}\n\n`);
  }
}, 1000).unref();

// ---------- HTTP ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".jsonl": "application/x-ndjson; charset=utf-8", ".json": "application/json" };
const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json" }).end(body === undefined ? "" : JSON.stringify(body));
async function body(req) {
  let s = "";
  for await (const c of req) {
    s += c;
    if (s.length > 65536) throw new Error("too large");
  }
  return JSON.parse(s || "{}");
}

const route = async (req, res) => {
  if (!HOSTS.has(req.headers.host ?? "")) return json(res, 421);
  const url = new URL(req.url, ORIGIN);
  if (req.method === "POST") {
    // 다른 사이트가 사장님 브라우저를 시켜 보내는 요청(CSRF)을 막는다
    if (req.headers.origin !== ORIGIN && req.headers.origin !== `http://localhost:${PORT}`) return json(res, 403);
    let b;
    try {
      b = await body(req);
    } catch {
      return json(res, 400);
    }
    if (url.pathname === "/pair") {
      if (typeof b.code !== "string" || b.code !== code) {
        if (++misses >= 5) await newCode(); // 5번 틀리면 코드를 바꾼다
        return json(res, 401);
      }
      const token = randomBytes(32).toString("hex");
      sessions.add(token);
      return res.writeHead(200, { "set-cookie": `office=${token}; HttpOnly; SameSite=Strict; Path=/` }).end();
    }
    if (!paired(req)) return json(res, 401);
    if (url.pathname === "/say") {
      const text = String(b.text ?? "").trim().slice(0, 4000);
      if (!text) return json(res, 400);
      notify("notifications/claude/channel", { content: text, meta: { sender: "ceo", chat_id: "office" } });
      remember("said", { text, ts: now() });
      return json(res, 204);
    }
    if (url.pathname === "/verdict") {
      const { request_id: id, behavior } = b;
      if (!pending.has(id) || !/^[a-km-z]{5}$/.test(id) || !["allow", "deny"].includes(behavior)) return json(res, 400);
      notify("notifications/claude/channel/permission", { request_id: id, behavior });
      pending.delete(id);
      broadcast("verdict", { request_id: id, behavior });
      return json(res, 204);
    }
    return json(res, 404);
  }
  if (url.pathname === "/me") return json(res, paired(req) ? 200 : 401);
  if (url.pathname === "/stream") {
    if (!paired(req)) return json(res, 401);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    for (const line of backlog) res.write(`event: log\ndata: ${line}\n\n`);
    for (const { kind, ...data } of history) res.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const p of pending.values()) res.write(`event: permission\ndata: ${JSON.stringify(p)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  // 정적 파일(페이지). 비밀이 없어 짝짓기 전에도 준다
  const p = join(WEB, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (relative(WEB, p).startsWith("..")) return json(res, 403);
  const data = await readFile(p).catch(() => null);
  if (!data) return json(res, 404);
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" }).end(data);
};
// async 처리기의 오류를 여기서 받는다. 놓치면 깨진 주소 한 번에 서버가 꺼진다(new URL, decodeURIComponent)
const server = createServer((req, res) => route(req, res).catch(() => (res.headersSent ? res.destroy() : json(res, 400))));
server.on("error", (e) => err("[office] HTTP 서버 오류:", e.message));
server.listen(PORT, "127.0.0.1", () => {
  err(`[office] ${ORIGIN} 에서 기다립니다`);
  newCode();
});
