// 이벤트 로그(덧붙이기만)와 반복·일일 카운터.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export const today = () => new Date().toLocaleDateString("sv-SE"); // 로컬 날짜 YYYY-MM-DD

export function appendEvent(dir, event) {
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ v: 1, ts: new Date().toISOString(), id: randomUUID(), ...event });
  appendFileSync(join(dir, `events-${today()}.jsonl`), line + "\n", "utf8");
}

// 운영실이 디스코드로 CEO 에게 보낸 글. CEO 세션의 Claude 가 붙여 넣기 없이 읽는다(2026-10-16). 가리는 건 부르는 쪽이 한다
export function appendReport(dir, who, text) {
  mkdirSync(dir, { recursive: true });
  const time = new Date().toLocaleTimeString("sv-SE").slice(0, 5);
  appendFileSync(join(dir, `reports-${today()}.md`), `## ${time} ${who}\n\n${text}\n\n`, "utf8");
}

// ponytail: 상태 파일 하나를 읽고 쓰므로 병렬 호출이면 카운트가 조금 틀릴 수 있다. 보조 상한이라 받아들인다.
// 진짜 비용 상한은 사용 크레딧을 꺼 둔 Pro 한도다(추가 비용 0원, 결정로그 D19).
export function bumpCounters(dir, input) {
  const sdir = join(dir, "state");
  mkdirSync(sdir, { recursive: true });
  const file = join(sdir, `${today()}.json`);
  let s;
  try {
    s = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    s = { daily: 0, last: {} };
  }
  const key = input.agent_id ?? input.session_id ?? "?";
  const hash = createHash("sha256").update(String(input.tool_name) + JSON.stringify(input.tool_input ?? {})).digest("hex").slice(0, 16);
  const prev = s.last[key];
  const repeat = prev && prev.hash === hash ? prev.count + 1 : 1;
  s.last[key] = { hash, count: repeat };
  s.daily += 1;
  writeFileSync(file, JSON.stringify(s), "utf8");
  return { repeat, daily: s.daily };
}
