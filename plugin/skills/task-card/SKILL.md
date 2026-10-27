---
name: task-card
description: ainsof Office에서 봇에게 일을 넘기는 작업 카드와, 봇이 돌려주는 결과 보고의 양식. 운영실이 봇을 부를 때와 봇이 결과를 돌려줄 때 쓴다.
---

# 작업 카드 (운영실 → 봇)

봇을 부를 때 prompt 는 이 형식 하나로 쓴다. `id` 는 로그에 남으므로 꼭 첫 줄에 둔다.

```yaml
id: P0-R1
milestone: P0
title: 식물병원 미니앱 경쟁 앱 5개 조사
owner: researcher
inputs:
  - 질문: 사진으로 식물 병을 진단해 주는 앱(국내·해외) 중 실제로 서비스 중인 것
done_when:            # 실행이나 원문으로 확인할 수 있는 것만
  - "앱 5개 이상, 앱마다 공식 페이지 URL과 원문 인용"
limits: { max_turns: 30 }
out_of_scope: [가격 협상, 앱 설치, 로그인]
```

# 결과 보고 (봇 → 운영실)

```yaml
task: P0-R1
status: done            # done | blocked | failed
summary: (3줄 이내)
artifacts: [파일 경로 또는 bot/<작업 id> @ 커밋 해시]
evidence:
  - { cmd: "실행한 명령", exit: 0, log: "로그 경로" }
open_questions: []      # 모르는 것과 게이트에 막힌 것은 추측으로 채우지 않고 여기에 적는다
turns_used: 0
```

마지막 줄은 반드시 `status: <값>` 이어야 한다. 게이트가 이 줄로 작업 결과를 기록한다.
