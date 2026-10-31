# 등급 → 모델·생각 깊이 대응표

기준일: 2026-10-30 · 봇 계정 Claude Code 2.1.292 이상(CEO 확인) · 별칭이 풀리는 실제 모델: 확인 불가

**모델이 바뀌면 이 파일만 고친다.** PM 지침(operator.md)에는 모델 이름을 쓰지 않는다. PM은 세션을 시작할 때 이 파일을 읽고, 봇을 부를 때마다 Agent 도구의 model·effort 칸을 이 표대로 채운다.

| 등급 | model 칸 | 깊이 덜 | 깊이 보통 | 깊이 더 |
|---|---|---|---|---|
| T1 견습 | haiku | low | medium | high |
| T2 숙련 | sonnet | low | medium | high |
| T3 수석 | opus | low | medium | high |

- xhigh·max 는 넣지 않았다. 회고 기록에서 이득이 확인된 칸만 더한다(공식 문서도 "효과가 확인될 때만"이라고 함).
- fable 은 쓰지 않는다. 구독 한도를 많이 쓴다.
- PM 자신: opus, 깊이는 세션 기본값. start-office.cmd 에 --effort 를 넣지 않는다.
- 봇 계정에 CLAUDE_CODE_EFFORT_LEVEL 환경변수를 두지 않는다. 있으면 위 effort 칸이 모두 무시된다.
- 코드리뷰봇이 부르는 Codex 의 모델은 여기가 아니라 봇 계정 `~/.codex/config.toml` 에서 정한다(CEO).
- 다시 확인할 때: 새 모델 출시, 별칭이 가리키는 버전 변경, 공식 문서의 기본 effort 변경, 마지막 확인 뒤 6개월.

## 첫 기록

- 2026-10-30 시험: 리서치봇을 haiku·low 로 부름 → 배정 기록에 model·effort 가 남음, done. 검수에서 주장 6개 중 mismatch 1, unsourced 2. 표본 1장이라 결론 아님(넓은 조사의 기본 T2 와 같은 방향).
