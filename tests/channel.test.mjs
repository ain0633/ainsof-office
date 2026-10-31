// 사무실 채널: 가짜 Claude Code(stdin/stdout)와 가짜 디스코드 웹후크로 처음부터 끝까지 돌린다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../plugin/channel/office.mjs", import.meta.url));
const PORT = 17777;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const today = () => new Date().toLocaleDateString("sv-SE");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("사무실 채널: 짝짓기 → 지시 → 답 → 결재 → 작업 기록이 이어진다", async (t) => {
  // 가짜 디스코드: 짝짓기 코드를 받아 둔다
  let posted = null;
  const hook = createServer(async (req, res) => {
    let s = "";
    for await (const c of req) s += c;
    posted = JSON.parse(s).content;
    res.end();
  }).listen(0);
  await new Promise((r) => hook.once("listening", r));
  const dir = mkdtempSync(join(tmpdir(), "office-"));
  writeFileSync(join(dir, "secrets.json"), JSON.stringify({ discordWebhook: `http://127.0.0.1:${hook.address().port}/x` }));
  writeFileSync(join(dir, `events-${today()}.jsonl`), JSON.stringify({ v: 1, type: "agent.start", actor: { role: "ainsof-office:developer" }, data: {} }) + "\n");

  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, OFFICE_PORT: String(PORT), OFFICE_LOG_DIR: dir, OFFICE_SECRETS: join(dir, "secrets.json") } });
  t.after(async () => {
    await wait(50);
    child.kill();
    hook.close();
  });
  const out = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) out.push(JSON.parse(buf.slice(0, i)));
  });
  const rpc = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const until = async (pred, what) => {
    for (let i = 0; i < 50; i++) {
      const hit = pred();
      if (hit) return hit;
      await wait(100);
    }
    throw new Error("기다렸지만 오지 않음: " + what);
  };

  // 1. Claude Code 와 인사: 채널·결재 중계를 밝힌다
  rpc({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  const init = await until(() => out.find((m) => m.id === 1), "initialize");
  assert.deepEqual(init.result.capabilities.experimental, { "claude/channel": {}, "claude/channel/permission": {} });

  // 2. 짝짓기 전에는 아무것도 못 한다
  const code = (await until(() => posted, "짝짓기 코드")).match(/\*\*(\d{6})\*\*/)[1];
  const post = (path, body, headers = {}) => fetch(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(ORIGIN + "/me")).status, 401);
  assert.equal((await post("/say", { text: "x" })).status, 401);
  assert.equal((await post("/pair", { code: "000000" === code ? "111111" : "000000" })).status, 401);
  // fetch 는 Host 를 바꿔 보내지 못해 http 로 시험한다(DNS 리바인딩 흉내)
  const status = await new Promise((r) => request({ port: PORT, path: "/me", agent: false, headers: { host: `evil.example:${PORT}` } }, (res) => r(res.statusCode)).end());
  assert.equal(status, 421, "다른 호스트 이름은 거절");

  const paired = await post("/pair", { code });
  assert.equal(paired.status, 200);
  const cookie = paired.headers.get("set-cookie").split(";")[0];
  assert.match(paired.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.equal((await post("/say", { text: "x" }, { cookie, origin: "http://evil.example" })).status, 403, "다른 사이트에서 온 요청은 거절");

  // 3. 실시간 흐름을 열면 오늘 작업 기록부터 온다
  const ac = new AbortController();
  t.after(() => ac.abort()); // 서버를 끄기 전에 먼저 끊는다
  const stream = await fetch(ORIGIN + "/stream", { headers: { cookie }, signal: ac.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  let sse = "";
  (async () => {
    for (let r; !(r = await reader.read()).done; ) sse += Buffer.from(r.value).toString();
  })().catch(() => {}); // 끝날 때 서버를 끄면 끊긴다
  await until(() => sse.includes('"agent.start"'), "기록 되감기");

  // 4. 지시 → PM 세션으로
  assert.equal((await post("/say", { text: "TD-3 시작해" }, { cookie })).status, 204);
  const said = await until(() => out.find((m) => m.method === "notifications/claude/channel"), "지시 전달");
  assert.equal(said.params.content, "TD-3 시작해");

  // 5. PM 답 → 페이지
  rpc({ id: 2, method: "tools/call", params: { name: "reply", arguments: { text: "접수했습니다" } } });
  await until(() => sse.includes("접수했습니다"), "답 말풍선");

  // 5-1. 다시 접속해도 오늘 대화가 보이고, 파일에도 남는다
  const again = await fetch(ORIGIN + "/stream", { headers: { cookie }, signal: ac.signal });
  const r2 = again.body.getReader();
  let sse2 = "";
  (async () => {
    for (let r; !(r = await r2.read()).done; ) sse2 += Buffer.from(r.value).toString();
  })().catch(() => {});
  await until(() => sse2.includes("TD-3 시작해") && sse2.includes("접수했습니다"), "다시 접속한 화면의 대화");
  const saved = readFileSync(join(dir, `office-chat-${today()}.jsonl`), "utf8");
  assert.match(saved, /"kind":"said".*TD-3 시작해/);
  assert.match(saved, /"kind":"reply".*접수했습니다/);

  // 6. 결재: 명령 내용까지 페이지로, 버튼 → PM 세션으로. 열리지 않은 번호는 거절
  rpc({ method: "notifications/claude/channel/permission_request", params: { request_id: "abcde", tool_name: "Bash", description: "설치", input_preview: '{"command":"npm install left-pad"}' } });
  await until(() => sse.includes("npm install left-pad"), "결재 요청");
  assert.equal((await post("/verdict", { request_id: "zzzzz", behavior: "allow" }, { cookie })).status, 400);
  assert.equal((await post("/verdict", { request_id: "abcde", behavior: "allow" }, { cookie })).status, 204);
  const verdict = await until(() => out.find((m) => m.method === "notifications/claude/channel/permission"), "결재 전달");
  assert.deepEqual(verdict.params, { request_id: "abcde", behavior: "allow" });
  assert.equal((await post("/verdict", { request_id: "abcde", behavior: "deny" }, { cookie })).status, 400, "같은 번호는 두 번 안 됨");

  // 7. 새 작업 기록 줄이 실시간으로 온다
  appendFileSync(join(dir, `events-${today()}.jsonl`), JSON.stringify({ v: 1, type: "task.result", actor: { role: "ainsof-office:qa" }, data: { status: "done" } }) + "\n");
  await until(() => sse.includes('"task.result"'), "새 기록");
  ac.abort();
});

test("디스코드가 없으면(간단 설치) 짝짓기 코드를 파일에 쓰고, 그 코드로 짝지어진다", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "office-"));
  const file = join(dir, "office-pairing.txt");
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, OFFICE_PORT: String(PORT + 1), OFFICE_LOG_DIR: dir, OFFICE_SECRETS: join(dir, "none.json"), OFFICE_PAIRING_FILE: file } });
  t.after(() => child.kill());
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  let code = "";
  for (let i = 0; i < 50 && !code; i++) {
    await wait(100);
    try { code = readFileSync(file, "utf8").trim(); } catch {}
  }
  assert.match(code, /^\d{6}$/);
  const origin = `http://127.0.0.1:${PORT + 1}`;
  const res = await fetch(origin + "/pair", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ code }) });
  assert.equal(res.status, 200);
});

// 공개 점검(2026-11-01): 깨진 주소 한 번에 서버가 꺼졌다. async 처리기의 오류가 프로세스를 끝낸다
test("깨진 주소를 받아도 사무실 서버는 꺼지지 않는다", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "office-"));
  const port = PORT + 2;
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, OFFICE_PORT: String(port), OFFICE_LOG_DIR: dir, OFFICE_SECRETS: join(dir, "none.json"), OFFICE_PAIRING_FILE: join(dir, "p.txt") } });
  t.after(() => child.kill());
  await new Promise((r) => child.stderr.once("data", r));
  const get = (path) =>
    new Promise((res) => {
      request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` } }, (x) => res(x.resume().statusCode)).on("error", (e) => res(e.code)).end();
    });
  for (const path of ["/%", "/%E0%A4%A"]) assert.equal(await get(path), 400, path);
  assert.equal(await get("/index.html"), 200);
});
