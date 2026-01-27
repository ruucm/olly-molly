# Ticket 작업 완료 판단 로직

## 개요

Olly Molly에서 AI agent가 ticket 작업을 완료하면, 프론트엔드에서 500ms마다 job 상태를 polling하여 완료 여부를 판단하고 ticket 상태를 `IN_REVIEW`로 변경합니다.

---

## 상태 전이 흐름

```
TODO → IN_PROGRESS (작업 시작) → IN_REVIEW (성공) 또는 IN_PROGRESS 유지 (실패)
```

---

## Provider별 완료 판단 기준

### 1. Claude (claude)

| 판단 기준 | 설명 |
|-----------|------|
| **Stream JSON 파싱** | `--output-format=stream-json` 옵션으로 실시간 스트림 수신 |
| **Result 메시지 수신** | `type === 'result'` 메시지에서 `is_error` 필드 확인 |
| **성공 조건** | `claudeResultReceived === true` && `claudeResultIsError === false` |

**Claude 전용 로직** (`lib/agent-jobs.ts:499-511`):
```javascript
if (parsed?.type === 'result') {
    claudeResultReceived = true;
    claudeResultIsError = parsed.is_error === true;
}
```

---

### 2. Codex (codex)

| 판단 기준 | 설명 |
|-----------|------|
| **Exit code** | 프로세스 종료 코드 `0`이면 성공 |
| **키워드 기반** | output에서 성공/실패 키워드 검사 |
| **Commit hash** | output에서 git commit hash 발견 시 성공 |

**실행 방식**:
```bash
codex exec --dangerously-bypass-approvals-and-sandbox - < prompt
```

---

### 3. OpenCode (opencode)

| 판단 기준 | 설명 |
|-----------|------|
| **Exit code** | 프로세스 종료 코드 `0`이면 성공 |
| **키워드 기반** | output에서 성공/실패 키워드 검사 |
| **Commit hash** | output에서 git commit hash 발견 시 성공 |

**실행 방식**:
```bash
OPENCODE_PERMISSION="allow" opencode run - < prompt
```

---

## 공통 성공/실패 판단 로직

### 성공 키워드 (hasSuccessIndicators)

`lib/agent-jobs.ts:561-572`에서 검사:

```javascript
const hasSuccessIndicators =
    job.output.includes('commit') ||
    job.output.includes('committed') ||
    job.output.includes('completed') ||
    job.output.includes('successfully') ||
    job.output.includes('Created') ||
    job.output.includes('Modified') ||
    job.output.includes('Updated') ||
    job.output.includes('Implemented') ||
    job.output.includes('Fixed') ||
    job.output.includes('✅') ||
    /files?\s+(created|modified|updated|changed)/i.test(job.output);
```

### 실패 키워드 (hasFailureIndicators)

```javascript
const hasFailureIndicators =
    job.output.includes('[stderr] fatal:') ||
    job.output.includes('[stderr] Error:') ||
    job.output.includes('[error]') ||
    job.output.includes('FAILED') ||
    job.output.includes('❌ Task failed');
```

### 최종 성공 판단 (`lib/agent-jobs.ts:592-596`)

```javascript
const success =
    code === 0 ||                                    // Exit code 0
    commitHash !== undefined ||                       // Commit hash 발견
    claudeSuccess ||                                  // Claude 전용 성공 조건
    (code === null && hasSuccessIndicators && !hasFailureIndicators) ||
    (hasSuccessIndicators && !hasFailureIndicators && job.output.length > 500);
```

---

## 프론트엔드 상태 변경

### Polling 로직 (`components/kanban/TicketModal.tsx:141-184`)

```javascript
// 500ms마다 job 상태 확인
const checkJobStatus = async () => {
    const res = await fetch(`/api/agent/status?ticket_id=${ticket.id}`);
    const data = await res.json();

    if (data.job.status !== 'running') {
        // 완료 시 상태 변경
        setStatus(data.job.status === 'completed' ? 'IN_REVIEW' : status);
    }
};

pollIntervalRef.current = setInterval(checkJobStatus, 500);
```

### 상태 변경 결과

| Job Status | Ticket Status |
|------------|---------------|
| `running` | `IN_PROGRESS` 유지 |
| `completed` | → `IN_REVIEW` |
| `failed` | `IN_PROGRESS` 유지 (변경 없음) |

---

## 요약 비교표

| Provider | 완료 판단 방식 | 특이사항 |
|----------|---------------|----------|
| **Claude** | `is_error: false` in result message | Stream JSON 파싱 필요 |
| **Codex** | Exit code + 키워드 | stdin으로 prompt 전달 |
| **OpenCode** | Exit code + 키워드 | `OPENCODE_PERMISSION="allow"` 환경변수 |

---

## 관련 파일

- `lib/agent-jobs.ts`: 백그라운드 작업 실행 및 완료 판단
- `app/api/agent/status/route.ts`: Job 상태 조회 API
- `components/kanban/TicketModal.tsx`: 프론트엔드 polling 및 상태 변경
