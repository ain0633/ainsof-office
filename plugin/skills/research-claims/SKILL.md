---
name: research-claims
description: 리서치봇의 조사 결과 형식. 모든 주장에 출처 URL과 원문 인용을 붙이고, 출처가 없는 것은 unknowns 로 보낸다.
---

# 조사 결과 JSON

```json
{
  "id": "R-0001",
  "task": "R-12",
  "question": "조사 질문",
  "claims": [
    {
      "claim": "앱 X는 무료로 쓸 수 있고 앱 안에서 구독을 판다",
      "kind": "fact",
      "source_url": "https://...",
      "quote": "원문 문장 그대로 (번역하지 않는다)",
      "accessed": "YYYY-MM-DD"
    }
  ],
  "unknowns": ["앱 Y의 월 사용자 수: 공개 자료 없음"]
}
```

- `kind` 는 `fact`(원문에 그대로 있음) 또는 `inference`(원문에서 추론함) 둘 중 하나.
- `quote` 는 페이지에 있는 문장을 그대로 옮긴다. 요약하거나 고치지 않는다.
- 수치는 원문에 있는 것만 쓴다. 새 수치를 만들지 않는다.
- JSON 다음 줄에 `status: done` 또는 `status: blocked` 를 적는다.
