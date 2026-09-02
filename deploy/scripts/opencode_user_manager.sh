#!/usr/bin/env bash
set -euo pipefail

ASIMOV_DIR="/opt/asimov"
USERS_FILE="${ASIMOV_DIR}/users.json"
COMPOSE_FILE="${ASIMOV_DIR}/docker-compose.yml"
MASTER_REPO="/var/lib/docker/volumes/asimov_workspace/_data"
GITHUB_REPO_URL="github.com/AffiliateAccess/affilliateSO.git"
BASE_PORT=4001

function show_help() {
  echo "Uso: $0 {add|list|remove|reset-pass} <username> [password] [git_name] [git_email] [github_token]"
  exit 1
}

function next_free_port() {
  python3 -c "
import json
with open('${USERS_FILE}') as f:
    users = json.load(f)
used = {v['port'] for v in users.values()}
port = ${BASE_PORT}
while port in used:
    port += 1
print(port)
"
}

function username_exists() {
  python3 -c "
import json, sys
with open('${USERS_FILE}') as f:
    users = json.load(f)
sys.exit(0 if '$1' in users else 1)
"
}

function add_user() {
  local USERNAME="$1"
  local PASSWORD="${2:-$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)}"
  local GIT_NAME="${3:-${USERNAME}}"
  local GIT_EMAIL="${4:-${USERNAME}@euroaffiliati.com}"
  local GITHUB_TOKEN="${5:-}"
  local USER_DIR="${ASIMOV_DIR}/workspaces/${USERNAME}/affiliateSO"
  local PORT

  if username_exists "${USERNAME}"; then
    echo "ERROR: el usuario '${USERNAME}' ya existe" >&2
    exit 1
  fi

  PORT="$(next_free_port)"

  echo "[1/6] Workspace para ${USERNAME}..."
  mkdir -p "${ASIMOV_DIR}/workspaces/${USERNAME}"
  if [ ! -d "${USER_DIR}/.git" ]; then
    git clone "${MASTER_REPO}" "${USER_DIR}"
    (cd "${USER_DIR}" && git checkout -B "workspace/${USERNAME}")
  fi

  echo "[2/6] Configurando identidad Git y remote..."
  (
    cd "${USER_DIR}"
    git config user.name "${GIT_NAME}"
    git config user.email "${GIT_EMAIL}"
    if [ -n "${GITHUB_TOKEN}" ]; then
      git remote set-url origin "https://${GITHUB_TOKEN}@${GITHUB_REPO_URL}"
    else
      git remote set-url origin "https://${GITHUB_REPO_URL}"
    fi
  )

  echo "[3/6] Hasheando password..."
  local HASH_OUTPUT
  HASH_OUTPUT="$(python3 ${ASIMOV_DIR}/scripts/hash_password.py "${PASSWORD}")"
  local SALT_HEX HASH_HEX
  SALT_HEX="$(echo "${HASH_OUTPUT}" | grep '^salt=' | cut -d= -f2)"
  HASH_HEX="$(echo "${HASH_OUTPUT}" | grep '^password_hash=' | cut -d= -f2)"

  echo "[4/6] Registrando en users.json..."
  local GITHUB_CONNECTED_PY="False"
  if [ -n "${GITHUB_TOKEN}" ]; then
    GITHUB_CONNECTED_PY="True"
  fi
  python3 -c "
import json
with open('${USERS_FILE}') as f:
    users = json.load(f)
users['${USERNAME}'] = {
    'password_hash': '${HASH_HEX}',
    'salt': '${SALT_HEX}',
    'port': ${PORT},
    'container_name': 'opencode-${USERNAME}',
    'git_name': '${GIT_NAME}',
    'git_email': '${GIT_EMAIL}',
    'github_connected': ${GITHUB_CONNECTED_PY}
}
with open('${USERS_FILE}', 'w') as f:
    json.dump(users, f, indent=2)
"

  echo "[5/6] Anadiendo service a docker-compose.yml..."
  python3 - "${USERNAME}" "${PORT}" "${USER_DIR}" "${COMPOSE_FILE}" <<'PYEOF'
import sys

username, port, user_dir, compose_file = sys.argv[1:5]

service_block = f"""
  opencode-{username}:
    image: ${{DOCKER_IMAGE:-opencode-custom}}:${{DOCKER_TAG:-latest}}
    container_name: opencode-{username}
    restart: unless-stopped
    working_dir: /affiliateSO
    ports:
      - "127.0.0.1:{port}:4000"
    environment:
      OPENCODE_DISABLE_AUTOUPDATE: "true"
      GEMINI_API_KEY: ${{GEMINI_API_KEY}}
      GOOGLE_API_KEY: ${{GOOGLE_API_KEY}}
      GOOGLE_GENERATIVE_AI_API_KEY: ${{GEMINI_API_KEY}}
    volumes:
      - {user_dir}:/affiliateSO
      - opencode_config_{username}:/root/.config/opencode
      - opencode_data_{username}:/root/.local/share/opencode
    command:
      - web
      - --hostname
      - "0.0.0.0"
      - --port
      - "4000"
      - --cors
      - "https://code.euroaffiliati.com"
      - /affiliateSO
    deploy:
      resources:
        limits:
          memory: 1536M
          cpus: "1.0"
"""
volume_lines = f"  opencode_config_{username}:\n  opencode_data_{username}:\n"

with open(compose_file) as f:
    content = f.read()

if f"opencode-{username}:" in content:
    print(f"  service opencode-{username} already present, skip")
else:
    lines = content.split("\n")
    vol_idx = next(i for i, l in enumerate(lines) if l == "volumes:")
    new_lines = lines[:vol_idx] + service_block.split("\n") + lines[vol_idx:]
    content = "\n".join(new_lines)
    content = content.rstrip("\n") + "\n" + volume_lines
    with open(compose_file, "w") as f:
        f.write(content)
    print(f"  service opencode-{username} added")
PYEOF

  echo "[6/6] Levantando contenedor..."
  cd "${ASIMOV_DIR}"
  docker compose up -d "opencode-${USERNAME}"

  echo "Esperando a que el contenedor acepte conexiones (health-check)..."
  local MAX_WAIT=60
  local WAITED=0
  local READY=false
  while [ "${WAITED}" -lt "${MAX_WAIT}" ]; do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
      READY=true
      break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [ "${READY}" = "true" ]; then
    echo "Contenedor listo tras ${WAITED}s."
  else
    echo "ADVERTENCIA: el contenedor no respondio tras ${MAX_WAIT}s, puede tardar un poco mas en arrancar." >&2
  fi

  echo "============================================================"
  echo "Usuario creado con exito:"
  echo "URL: https://code.euroaffiliati.com (login con las credenciales abajo)"
  echo "Usuario: ${USERNAME}"
  echo "Password: ${PASSWORD}"
  echo "Puerto interno: ${PORT}"
  echo "Git identity: ${GIT_NAME} <${GIT_EMAIL}>"
  echo "GitHub conectado: $([ -n "${GITHUB_TOKEN}" ] && echo 'si' || echo 'no (fetch/push fallara hasta configurar token)')"
  echo "Workspace: ${USER_DIR} (Rama: workspace/${USERNAME})"
  echo "============================================================"
  echo "RESULT_JSON:{\"username\":\"${USERNAME}\",\"port\":${PORT},\"github_connected\":$([ -n "${GITHUB_TOKEN}" ] && echo 'true' || echo 'false')}"
}

function remove_user() {
  local USERNAME="$1"
  cd "${ASIMOV_DIR}"
  docker compose rm -f -s "opencode-${USERNAME}" 2>/dev/null || true
  docker volume rm "asimov_opencode_config_${USERNAME}" "asimov_opencode_data_${USERNAME}" 2>/dev/null || true
  python3 -c "
import json
with open('${USERS_FILE}') as f:
    users = json.load(f)
users.pop('${USERNAME}', None)
with open('${USERS_FILE}', 'w') as f:
    json.dump(users, f, indent=2)
"
  echo "Usuario ${USERNAME} eliminado (workspace en disco conservado por seguridad, borrar manualmente si se desea)."
}

function list_users() {
  echo "=== USUARIOS REGISTRADOS ==="
  python3 -c "
import json
with open('${USERS_FILE}') as f:
    users = json.load(f)
for name, u in users.items():
    print(f\"{name}: puerto={u['port']} container={u['container_name']} github={u.get('github_connected', 'n/a')}\")
"
  echo ""
  echo "=== ESTADO DE CONTENEDORES ==="
  cd "${ASIMOV_DIR}"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | grep opencode- || true
}

case "${1:-}" in
  add)
    [ -z "${2:-}" ] && show_help
    add_user "$2" "${3:-}" "${4:-}" "${5:-}" "${6:-}"
    ;;
  remove)
    [ -z "${2:-}" ] && show_help
    remove_user "$2"
    ;;
  list)
    list_users
    ;;
  *)
    show_help
    ;;
esac
