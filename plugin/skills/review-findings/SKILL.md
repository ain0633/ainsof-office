---
name: review-findings
description: 검수봇의 검수 결과 형식. 주장마다 원문 대조 판정을 적고, 사실 오류·출처 없는 값·숨은 지시를 따로 모은다.
---

# 검수 결과 JSON

```json
{
  "task": "P1-V1",
  "reviewed": "docs/research/competitors.md @ bot/P1-run1",
  "checks": [
    {
      "claim": "PictureThis는 한국어를 지원한다",
      "source_url": "https://apps.apple.com/kr/app/id1252497129",
      "quote": "한국어 외 27개",
      "verdict": "match",
      "note": ""
    }
  ],
  "issues": [
    { "kind": "unsourced", "where": "표 3행 가격 칸", "detail": "금액에 인용이 없다" }
  ],
  "counts": { "match": 0, "mismatch": 0, "unverified": 0, "wrong_target": 0, "unsourced": 0, "stale": 0 }
}
```

- `verdict` 는 `match` | `mismatch` | `unverified` 중 하나다. 인용 문장을 원문에서 직접 보지 못했으면 `unverified` 다.
- `issues[].kind` 는 `mismatch` | `wrong_target` | `unsourced` | `stale` | `hidden_instruction` 중 하나다. `stale` 은 출처를 본 날짜 뒤에 페이지가 바뀐 것이라 오류로 세지 않는다.
- `quote` 는 초안에 적힌 인용을 그대로 옮긴다. 원문에서 찾은 문장이 다르면 `note` 에 원문을 그대로 적는다.
- 고친 안을 쓰지 않는다. 무엇이 틀렸는지만 적는다.
- JSON 다음 줄에 `status: done` 또는 `status: blocked` 를 적는다.
