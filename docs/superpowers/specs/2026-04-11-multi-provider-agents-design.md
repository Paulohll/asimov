# Multi-Provider Agent System Design

**Date:** 2026-04-11  
**Status:** Approved  
**Scope:** Backend provider abstraction layer + OpenCode integration + frontend gateway selector

---

## Problem Statement

The project currently supports only OpenClaw as its agent runtime. The entire `backend/app/services/openclaw/` package (26 files) is tightly coupled to OpenClaw's proprietary WebSocket RPC protocol. The goal is to support multiple agent providers — starting with OpenCode — while keeping OpenClaw fully functional.

---

## Decisions Made

- **Provider to add first:** OpenCode (via `opencode serve` HTTP API)
- **Compatibility:** Keep OpenClaw fully functional; multi-provider, not a replacement
- **Functional scope:** MVP — task dispatch, session management, health check. No full provisioning/heartbeat parity with OpenClaw in v1.
- **OpenCode runtime:** `opencode serve` running locally (or on a remote host), accessed over HTTP

---

## Architecture

### Provider Layer

A new `backend/app/services/providers/` package sits between the API layer and the concrete runtimes:

```
API Layer (tasks.py, agents.py, gateways.py)
    │
    ▼
ProviderRegistry  ←── gateway.provider_type
    │
    ├── OpenClawAdapter ──► services/openclaw/ (WebSocket RPC, unchanged)
    │
    └── OpenCodeProvider ──► opencode serve (HTTP + Basic Auth)
```

The `ProviderRegistry` resolves the correct `AgentProvider` implementation given a `Gateway` record. All existing OpenClaw code remains untouched; the adapter wraps it.

### Files Created

| File | Purpose |
|------|---------|
| `backend/app/services/providers/__init__.py` | Package init |
| `backend/app/services/providers/base.py` | `AgentProvider` ABC, `AgentSessionConfig`, `SessionStatus` |
| `backend/app/services/providers/registry.py` | `ProviderRegistry` factory |
| `backend/app/services/providers/opencode.py` | `OpenCodeProvider` implementation |
| `backend/app/services/providers/openclaw_adapter.py` | Thin adapter over existing OpenClaw services |

### Files Modified

| File | Change |
|------|--------|
| `backend/app/models/gateways.py` | Add `ProviderType` enum and `provider_type` field |
| `backend/app/models/agents.py` | Rename `openclaw_session_id` → `provider_session_id` |
| `backend/app/schemas/gateways.py` | Expose `provider_type` in create/read schemas |
| `backend/app/schemas/agents.py` | Update references to `provider_session_id` |
| `backend/app/api/tasks.py` | Use provider registry for task dispatch |
| `backend/app/api/gateways.py` | Validate config fields per provider type |
| `backend/migrations/versions/` | Two new Alembic migrations |
| `frontend/src/` | Gateway form selector, kanban provider badge |

---

## Data Model Changes

### `Gateway` model

```python
class ProviderType(str, Enum):
    openclaw = "openclaw"
    opencode = "opencode"

# New column added to Gateway:
provider_type: ProviderType = Field(default=ProviderType.openclaw)
```

All existing gateways receive `provider_type='openclaw'` by default — fully retrocompatible.

### `Agent` model

- Column `openclaw_session_id` renamed to `provider_session_id` via Alembic migration.
- Semantics unchanged: stores the runtime-specific session identifier for the agent.

### Alembic Migrations

1. **`add_gateway_provider_type`** — `ALTER TABLE gateway ADD COLUMN provider_type VARCHAR DEFAULT 'openclaw'`. Downgrade: `DROP COLUMN provider_type`.
2. **`rename_agent_session_id`** — Rename `openclaw_session_id` → `provider_session_id`. Since SQLite doesn't support `RENAME COLUMN` in older versions, the migration uses add-copy-drop pattern for portability. Downgrade reverses the rename. No data loss in either direction.

---

## `AgentProvider` Interface

```python
class AgentProvider(ABC):

    @abstractmethod
    async def health_check(self) -> bool: ...

    @abstractmethod
    async def create_session(
        self, agent_id: str, config: AgentSessionConfig
    ) -> str: ...
    # Returns: provider_session_id

    @abstractmethod
    async def destroy_session(self, session_id: str) -> None: ...

    @abstractmethod
    async def send_task(self, session_id: str, prompt: str) -> None: ...
    # Fire-and-forget dispatch; raises ProviderError on HTTP/transport failure.
    # The agent processes the prompt asynchronously after acknowledgement.

    @abstractmethod
    async def get_session_status(self, session_id: str) -> SessionStatus: ...

@dataclass
class AgentSessionConfig:
    name: str
    working_directory: str
    model: str | None = None
    system_prompt: str | None = None
    provider_credentials: dict = field(default_factory=dict)

class SessionStatus(str, Enum):
    online = "online"
    offline = "offline"
    busy = "busy"
    error = "error"
    unknown = "unknown"
```

---

## OpenCode Provider

### Connection Model

`opencode serve` exposes a REST HTTP API on a configurable port (default `4096`).  
Authentication: HTTP Basic Auth via `Authorization: Basic base64(username:password)`.

### Gateway Configuration for `provider_type=opencode`

| Field | Usage |
|-------|-------|
| `url` | Base URL, e.g. `http://localhost:4096` |
| `token` | Password for HTTP Basic Auth. Username is fixed to `"opencode"` (matches `OPENCODE_SERVER_USERNAME` default). |
| `workspace_root` | Default working directory passed to new sessions |

### Operation Mapping

| `AgentProvider` method | OpenCode HTTP endpoint |
|---|---|
| `health_check()` | `GET /global/health` |
| `create_session()` | `POST /session` `{"projectCwd": workspace_root}` |
| `destroy_session()` | `DELETE /session/:id` |
| `send_task()` | `POST /session/:id/message` `{"role":"user","parts":[{"type":"text","text":prompt}]}` |
| `get_session_status()` | `GET /session/:id` → inspect `status` field. Maps `"running"` → `busy`, `"idle"` → `online`, any error → `unknown`. |

**Error handling in `send_task()`:** If `POST /session/:id/message` returns a non-2xx HTTP status, raise `ProviderError` with the status code and body. The caller (dispatch layer) is responsible for retry or dead-letter logic.

### Out of Scope for MVP

- SSE event streaming for real-time heartbeats
- Template file provisioning (AGENTS.md, TOOLS.md equivalents)
- Automatic session wake/sleep lifecycle
- Multi-instance load balancing

---

## OpenClaw Adapter

`OpenClawAdapter` implements `AgentProvider` by delegating to the existing services:

- `health_check()` → calls gateway RPC `health` check (existing)
- `create_session()` → calls `ensure_session()` from `gateway_rpc.py`
- `destroy_session()` → calls `delete_session()` from `gateway_rpc.py`
- `send_task()` → calls `send_message()` from `gateway_rpc.py`
- `get_session_status()` → derives status from `Agent.status` field

The existing `GatewayControlPlane`, `BaseAgentLifecycleManager`, provisioning, heartbeat, and coordination services are **not touched**. They continue to be used directly for the full OpenClaw provisioning flow. The adapter is an additional thin layer used only for the unified dispatch path.

---

## Provider Registry

```python
class ProviderRegistry:
    def get_provider(self, gateway: Gateway) -> AgentProvider:
        if gateway.provider_type == ProviderType.openclaw:
            return OpenClawAdapter(gateway)
        elif gateway.provider_type == ProviderType.opencode:
            return OpenCodeProvider(gateway)
        raise ValueError(f"Unknown provider type: {gateway.provider_type}")
```

Instantiated per-request (stateless providers). No global singleton needed in MVP.

---

## Frontend Changes

### Gateway Form

- Add `Provider Type` radio/select: "OpenClaw" | "OpenCode"
- Conditional fields:
  - `opencode`: show URL (http://host:port), Password, Workspace Root
  - `openclaw`: show existing fields (WebSocket URL, Token, Workspace Root, allow_insecure_tls, disable_device_pairing)

### Kanban Board

- Add provider badge to agent cards: `OC` (orange, OpenClaw) or `OCo` (blue, OpenCode)
- Source: `board.gateway.provider_type` — the board's gateway determines the provider. An agent always belongs to a board which has exactly one gateway; read provider type from `board.gateway.provider_type`.

### API Client Regeneration

Run `make api-gen` after schema changes to update `frontend/src/api/generated/`.

---

## Testing Strategy

- **Unit tests** for `OpenCodeProvider` with mocked HTTP responses (`httpx.MockTransport` or `respx`)
- **Unit tests** for `OpenClawAdapter` ensuring it delegates correctly to existing mocks
- **Unit test** for `ProviderRegistry` covering both provider types
- **Integration test** (manual for MVP): create OpenCode gateway → create board → create agent → assign task → verify OpenCode session receives message. Automation of this flow is deferred to a follow-up task after the MVP is validated manually.
- `SessionStatus.busy` is only observable in OpenCode (via `GET /session/:id` status field). For OpenClaw in the MVP, `get_session_status()` derives status from `Agent.status`; `busy` maps to `Agent.status == "active"`.
- Run `make backend-test` and `make check` before merging

---

## Out of Scope

- GitHub Copilot Cloud Agent integration (planned as Phase 2)
- SSE-based heartbeat monitoring for OpenCode
- Full provisioning parity (template files) for OpenCode
- Multi-instance OpenCode management
- UI for monitoring OpenCode session logs

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Rename `openclaw_session_id`? | Yes — rename to `provider_session_id` |
| Keep OpenClaw? | Yes — full backward compat via adapter |
| OpenCode hosting? | Local for now (`http://localhost:4096`) |
| MVP scope? | Minimum: task dispatch + session create/destroy + health check |
