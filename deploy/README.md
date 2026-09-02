# Multi-user OpenCode deployment

Self-hosted, per-user OpenCode instances behind a session-authenticated
nginx gateway. Rescued from the production VM (`/opt/asimov`), which had
no version control until this was added.

## Architecture

```
nginx (TLS, code.euroaffiliati.com)
  │
  ├─ /login /logout /onboard ──► auth_server.py  (127.0.0.1:4005)
  │
  └─ /  ── auth_request /_auth_check ──► auth_server.py /check
                                            returns X-Upstream-Port
       proxy_pass http://127.0.0.1:$upstream_port
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
        opencode-<user1>              opencode-<user2>              opencode-<user3>
         127.0.0.1:4001                127.0.0.1:4002                127.0.0.1:4003
```

nginx's `auth_request` directive calls `auth_server.py`'s `/check` endpoint
with the visitor's session cookie. The gateway validates the session and
responds with an `X-Upstream-Port` header; nginx captures it via
`auth_request_set` and proxies the real request to that port. This is what
gives each logged-in user their own isolated container after login.

## Components

| Path | Role |
|---|---|
| `auth/auth_server.py` | Stdlib-only HTTP gateway on `:4005`. Login, logout, onboarding, `/check`. Sessions are HMAC-signed using `.session_secret`. |
| `auth/users.example.json` | Template for `users.json` (password hash + salt + assigned port per user). Real file stays on the host. |
| `compose/docker-compose.yml` | One `opencode` container per user, each bound to `127.0.0.1:<port>` only — never `0.0.0.0`. |
| `scripts/opencode_user_manager.sh` | Provisions a new user: creates the workspace dir, adds a compose service, adds a `users.json` entry. |
| `scripts/hash_password.py` | Generates the password hash + salt for `users.json`. |
| `scripts/backup_opencode_db.py` | Dumps each user's SQLite DB. Run daily by `systemd/opencode-db-backup.timer`. |
| `systemd/opencode-auth.service` | Runs `auth_server.py` at boot. |
| `systemd/opencode-db-backup.{service,timer}` | Daily backup at 03:00. |
| `nginx/code.euroaffiliati.com.conf` | The site config described above. |
| `.env.example` | Template for `/opt/asimov/.env` (image, CORS origin, provider API keys, legacy basic-auth credentials). |

`packages/opencode/Dockerfile` and `build-docker.sh` (repo root) build the
image these containers run: a debian-slim (glibc) base instead of upstream's
default alpine, because the previous deployment needed glibc-only tooling.

## Deploying / updating on the VM

```bash
# 1. Build and push a new image
./build-docker.sh                                  # pushes to the default Artifact Registry image
# or
./build-docker.sh <registry/image:tag>

# 2. On the VM
cd /opt/asimov
DOCKER_IMAGE=<same image> DOCKER_TAG=<same tag> docker compose pull
DOCKER_IMAGE=<same image> DOCKER_TAG=<same tag> docker compose up -d
```

`/opt/asimov/.env`, `/opt/asimov/.session_secret`, and `/opt/asimov/users.json`
live only on the host and are gitignored. Never commit populated versions of
these files.

## Adding a user

Run `scripts/opencode_user_manager.sh` on the VM (as root, from
`/opt/asimov`). It provisions the workspace directory, appends a service
block to `docker-compose.yml`, and adds the user's entry to `users.json`.
After it runs, `docker compose up -d` picks up the new service.

## Known issues to resolve on next deploy

- **`asimov-allow-4000` firewall rule** (GCP) opens TCP 4000 to
  `0.0.0.0/0` on `asimov-vm`. Nothing in the nginx config proxies to
  `:4000` — the legacy `opencode` service it exposes is unused by the
  authenticated flow. The service itself has HTTP basic auth configured, so
  it isn't wide open, but it bypasses the gateway entirely. Recommended:
  delete the firewall rule (or at minimum restrict its source range) once
  confirmed nothing external depends on direct port-4000 access, and
  eventually remove the `opencode` service from compose.
- The compose file previously bound every service to different interfaces
  inconsistently (one `0.0.0.0`, three `127.0.0.1`). This has been fixed:
  all four now bind `127.0.0.1` only. Redeploy (`docker compose up -d`) to
  apply this on the VM — the running containers still reflect the old
  binding until then.
