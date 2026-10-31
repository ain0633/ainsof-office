---
name: task-card
description: ainsof Office에서 봇에게 일을 넘기는 작업 카드와, 봇이 돌려주는 결과 보고의 양식. 운영실이 봇을 부를 때와 봇이 결과를 돌려줄 때 쓴다.
---

# 작업 카드 (운영실 → 봇)

봇을 부를 때 prompt 는 이 형식 하나로 쓴다. `id` 는 로그에 남으므로 꼭 첫 줄에 둔다.

```yaml
id: R-12
milestone: M1
title: 독서 기록 앱 경쟁 서비스 5개 조사
owner: researcher
tier: T2              # 등급·깊이는 운영실 지침 "등급과 생각 깊이", 실제 모델은 model-tiers.md
effort: 보통
why: 크기 15분~1시간·자동 확인 예(원문 대조)·읽을 양 작음
inputs:
  - 질문: 읽은 책을 기록·공유하는 앱(국내·해외) 중 지금 서비스 중인 것
done_when:            # 실행이나 원문으로 확인할 수 있는 것만
  - "앱 5개 이상, 앱마다 공식 페이지 URL과 원문 인용"
limits: { max_turns: 30 }
out_of_scope: [가격 협상, 앱 설치, 로그인]
```

개발 일의 예:

```yaml
id: D-7
milestone: M1
title: 목록이 비었을 때 안내 문구 보여 주기
owner: developer
inputs:
  - 화면: 기록 목록. 항목이 0개일 때 지금은 빈 화면
done_when:
  - "npm test 통과(종료 코드 0)"
  - "항목 0개 상태의 화면 스크린샷에 안내 문구가 보인다"
limits: { max_turns: 40 }
out_of_scope: [디자인 바꾸기, 새 패키지]
```

# 결과 보고 (봇 → 운영실)

```yaml
task: R-12
status: done            # 아래 상태 중 하나
summary: (3줄 이내)
artifacts: [파일 경로 또는 bot/<작업 id> @ 커밋 해시]
evidence:
  - { cmd: "실행한 명령", exit: 0, log: "로그 경로" }
open_questions: []      # 모르는 것과 게이트에 막힌 것은 추측으로 채우지 않고 여기에 적는다
turns_used: 0
```

마지막 줄은 반드시 `status: <값>` 이어야 한다. 게이트가 이 줄로 작업 결과를 기록한다. 모든 봇이 같은 값을 쓴다.

| 상태 | 뜻 | 운영실이 다음에 할 일 |
|---|---|---|
| `done` | 카드의 일을 끝냈다 | 정해진 다음 단계(리뷰·QA·검수)로 넘기거나 CEO에게 보고 |
| `needs_approval` | CEO가 골라야 다음으로 갈 수 있다(예: 시안) | 고를 것을 CEO에게 보내고 답을 기다린다 |
| `blocked` | 막혀서 못 했다(게이트·권한·정보 부족) | 막힌 이유를 CEO에게 보고. 같은 카드를 그대로 다시 주지 않는다 |
| `failed` | 해 봤지만 기준을 못 넘었다 | 한 번 고쳐 다시 맡기거나 CEO에게 선택지로 묻는다 |

QA봇의 pass·fail·blocked 는 기준마다의 판정이고, 이 상태와 따로 적는다.

일은 끝냈지만 기준 문구가 애매하거나 걱정이 남으면 `done` 으로 내고 걱정은 `open_questions` 에 적는다. `blocked` 는 실제로 하지 못했을 때만 쓴다.
