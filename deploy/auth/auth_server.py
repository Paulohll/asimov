import http.server
import urllib.parse
import hmac
import hashlib
import time
import os
import json
import secrets
import binascii
import subprocess
import re

PORT = 4005
USERS_FILE = "/opt/asimov/users.json"
INVITATIONS_FILE = "/opt/asimov/invitations.json"
SECRET_FILE = "/opt/asimov/.session_secret"
MANAGER_SCRIPT = "/opt/asimov/scripts/opencode_user_manager.sh"
USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,32}$")

if not os.path.exists(SECRET_FILE):
    with open(SECRET_FILE, "w") as f:
        f.write(secrets.token_hex(32))

with open(SECRET_FILE) as f:
    SECRET = f.read().strip()

PAGE_HEAD = """<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Affiliate Access OS - Consola OpenCode</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          fontFamily: { sans: ["Plus Jakarta Sans", "sans-serif"] },
          colors: {
            brand: { 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9" },
            dark: { bg: "#06080F", card: "#0F1424", border: "#1E2640", input: "#13192F" }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-dark-bg text-slate-100 min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans">
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
"""

PAGE_TAIL = """
</body>
</html>"""

LOGIN_TEMPLATE = PAGE_HEAD + """
  <div class="w-full max-w-md relative z-10">
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-900/60 to-purple-600/20 border border-purple-500/30 shadow-lg shadow-purple-500/10 mb-4">
        <svg class="w-7 h-7 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-white tracking-tight">Affiliate Access OS</h1>
      <p class="text-sm text-slate-400 mt-1">Consola de Agentes & Entorno de Trabajo</p>
    </div>

    <div class="bg-dark-card border border-dark-border rounded-2xl p-7 shadow-2xl backdrop-blur-xl">
      {{ERROR_BANNER}}
      <form method="POST" action="/login" class="space-y-4">
        <input type="hidden" name="next" value="{{NEXT_URL}}">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5" for="username">Usuario</label>
          <input type="text" id="username" name="username" required autocomplete="username" autofocus
            class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition duration-150"
            placeholder="usuario">
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400" for="password">Contraseña</label>
          </div>
          <input type="password" id="password" name="password" required autocomplete="current-password"
            class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition duration-150"
            placeholder="••••••••">
        </div>

        <button type="submit"
          class="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-purple-600/25 transition duration-200 flex items-center justify-center space-x-2">
          <span>Ingresar a la Consola</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </form>
    </div>

    <div class="mt-4 text-center text-xs text-slate-500">
      <span>¿Primera vez? Solicita tu Magic Link de invitación al administrador.</span>
    </div>

    <div class="mt-6 text-center text-xs text-slate-500">
      <span>Powered by Google Gemini 3.7 Flash</span> · <span>Seedlab Multi-agent</span>
    </div>
  </div>
""" + PAGE_TAIL

RESTRICTED_TEMPLATE = PAGE_HEAD + """
  <div class="w-full max-w-md relative z-10 text-center">
    <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-500/30 shadow-lg shadow-amber-500/10 mb-4">
      <svg class="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
    </div>
    <div class="bg-dark-card border border-dark-border rounded-2xl p-7 shadow-2xl backdrop-blur-xl">
      <h1 class="text-xl font-bold text-white mb-2">Acceso por Invitación Únicamente</h1>
      <p class="text-sm text-slate-400 mb-6">
        Se requiere un <strong>Magic Link de invitación válido</strong> para registrarse y aprovisionar un workspace de OpenCode en este servidor.
      </p>
      <div class="space-y-3">
        <a href="/login" class="inline-flex items-center justify-center w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-purple-600/25 transition duration-150 text-sm">
          Ir a Iniciar Sesión
        </a>
      </div>
    </div>
    <div class="mt-6 text-xs text-slate-500">
      <span>Contacta al Administrador de Infraestructura para obtener tu enlace.</span>
    </div>
  </div>
""" + PAGE_TAIL

ONBOARD_TEMPLATE = PAGE_HEAD + """
  <div class="w-full max-w-lg relative z-10">
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-900/60 to-purple-600/20 border border-purple-500/30 shadow-lg shadow-purple-500/10 mb-4">
        <svg class="w-7 h-7 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-white tracking-tight">Activa tu Workspace OpenCode</h1>
      <p class="text-sm text-slate-400 mt-1">Configuración personalizada de identidad, claves y repositorio</p>
    </div>

    <div class="bg-dark-card border border-dark-border rounded-2xl p-7 shadow-2xl backdrop-blur-xl">
      {{ERROR_BANNER}}
      <form method="POST" action="/onboard" class="space-y-4">
        <input type="hidden" name="token" value="{{INVITE_TOKEN}}">

        <div>
          <div class="flex justify-between items-center mb-1.5">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400">Usuario Asignado</label>
            <span class="text-xs text-purple-400 font-mono">🔒 Verificado por invitación</span>
          </div>
          <input type="text" name="username" value="{{USERNAME}}" readonly
            class="w-full bg-dark-input/60 border border-dark-border/80 rounded-xl px-4 py-3 text-sm text-purple-200 font-mono cursor-not-allowed">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Tu Contraseña</label>
            <input type="password" name="password" required minlength="8" autofocus
              class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              placeholder="mín. 8 caracteres">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Confirmar Contraseña</label>
            <input type="password" name="confirm_password" required minlength="8"
              class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              placeholder="repite contraseña">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nombre en Git (para tus commits)</label>
          <input type="text" name="git_name" value="{{GIT_NAME}}" required
            class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            placeholder="ej: Paulo Horna">
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Email en Git</label>
          <input type="email" name="git_email" value="{{GIT_EMAIL}}" required
            class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            placeholder="tu@euroaffiliati.com">
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">GitHub Personal Access Token (PAT)</label>
          <input type="password" name="github_token" autocomplete="off"
            class="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            placeholder="ghp_... o gho_... (con permisos de repo)">
          <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Permite a tu agente y a tu workspace sincronizar ramas, hacer <code>/sync</code> y empujar commits a <code>AffiliateAccess/affilliateSO</code>.
          </p>
        </div>

        <button type="submit"
          class="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-purple-600/25 transition duration-200 flex items-center justify-center space-x-2">
          <span>Aprovisionar y Entrar a mi Workspace</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </form>
    </div>

    <div class="mt-4 text-center text-xs text-slate-500">
      <span>Al activar tu workspace, este enlace de invitación quedará consumido.</span>
    </div>
  </div>
""" + PAGE_TAIL


def load_users() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE) as f:
        return json.load(f)


def load_invitations() -> dict:
    if not os.path.exists(INVITATIONS_FILE):
        return {}
    with open(INVITATIONS_FILE) as f:
        return json.load(f)


def save_invitations(invs: dict):
    with open(INVITATIONS_FILE, "w") as f:
        json.dump(invs, f, indent=2)


def validate_invitation(token: str) -> dict:
    if not token:
        return None
    invs = load_invitations()
    inv = invs.get(token)
    if inv and not inv.get("consumed", False):
        return inv
    return None


def consume_invitation(token: str):
    invs = load_invitations()
    if token in invs:
        invs[token]["consumed"] = True
        invs[token]["consumed_at"] = int(time.time())
        save_invitations(invs)


def verify_password(username: str, password: str, users: dict) -> bool:
    entry = users.get(username)
    if not entry:
        return False
    salt = binascii.unhexlify(entry["salt"])
    expected = binascii.unhexlify(entry["password_hash"])
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return hmac.compare_digest(derived, expected)


def make_token(user):
    exp = int(time.time()) + 30 * 86400
    msg = f"{user}:{exp}"
    sig = hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{sig}"


def verify_token(token):
    try:
        user, exp, sig = token.split(":")
        if int(exp) < time.time():
            return None
        msg = f"{user}:{exp}"
        expected = hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected):
            return user
    except Exception:
        pass
    return None


def provision_user(username, password, git_name, git_email, github_token):
    """Invoca el script de aprovisionamiento. Devuelve (ok, stdout, stderr)."""
    try:
        result = subprocess.run(
            [MANAGER_SCRIPT, "add", username, password, git_name, git_email, github_token],
            capture_output=True,
            text=True,
            timeout=180,
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Timeout aprovisionando el workspace (>180s)."


class AuthHandler(http.server.BaseHTTPRequestHandler):
    def get_cookie(self):
        cookies = self.headers.get("Cookie", "")
        for part in cookies.split(";"):
            part = part.strip()
            if part.startswith("opencode_session="):
                return part[len("opencode_session="):]
        return None

    def _send_html(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/check":
            token = self.get_cookie()
            user = verify_token(token) if token else None
            if user:
                users = load_users()
                entry = users.get(user)
                if not entry:
                    self.send_response(401)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("X-Auth-User", user)
                self.send_header("X-Upstream-Port", str(entry["port"]))
                self.end_headers()
            else:
                self.send_response(401)
                self.end_headers()
            return

        if path == "/logout":
            self.send_response(302)
            self.send_header("Set-Cookie", "opencode_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
            self.send_header("Location", "/login")
            self.end_headers()
            return

        if path == "/onboard":
            invite_token = query.get("token", [None])[0]
            invitation = validate_invitation(invite_token)

            if not invitation:
                self._send_html(RESTRICTED_TEMPLATE, status=403)
                return

            error = query.get("error", [None])[0]
            error_banner = ""
            if error:
                error_banner = f"""<div class="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800/50 text-red-200 text-sm flex items-center space-x-2">
                  <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span>{error}</span>
                </div>"""

            html = (
                ONBOARD_TEMPLATE.replace("{{ERROR_BANNER}}", error_banner)
                .replace("{{INVITE_TOKEN}}", urllib.parse.quote(invite_token))
                .replace("{{USERNAME}}", invitation.get("username", ""))
                .replace("{{GIT_NAME}}", invitation.get("git_name", ""))
                .replace("{{GIT_EMAIL}}", invitation.get("git_email", ""))
            )
            self._send_html(html)
            return

        if path == "/login":
            token = self.get_cookie()
            if token and verify_token(token):
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
                return

            next_url = query.get("next", ["/"])[0]
            error = query.get("error", [None])[0]
            error_banner = ""
            if error:
                error_banner = """<div class="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800/50 text-red-200 text-sm flex items-center space-x-2">
                  <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span>Usuario o contraseña incorrectos.</span>
                </div>"""

            html = LOGIN_TEMPLATE.replace("{{ERROR_BANNER}}", error_banner).replace("{{NEXT_URL}}", urllib.parse.quote(next_url))
            self._send_html(html)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/login":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = urllib.parse.parse_qs(body)
            username = data.get("username", [""])[0].strip()
            password = data.get("password", [""])[0].strip()
            next_url = data.get("next", ["/"])[0].strip()
            if not next_url.startswith("/"):
                next_url = "/"

            users = load_users()
            if verify_password(username, password, users):
                token = make_token(username)
                self.send_response(302)
                self.send_header("Set-Cookie", f"opencode_session={token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure")
                self.send_header("Location", next_url)
                self.end_headers()
            else:
                self.send_response(302)
                self.send_header("Location", f"/login?error=1&next={urllib.parse.quote(next_url)}")
                self.end_headers()
            return

        if parsed.path == "/onboard":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = urllib.parse.parse_qs(body)

            token = data.get("token", [""])[0].strip()
            invitation = validate_invitation(token)

            if not invitation:
                self.send_response(302)
                self.send_header("Location", "/onboard")
                self.end_headers()
                return

            # Always bind username to the invitation definition
            username = invitation.get("username", "").strip()
            password = data.get("password", [""])[0]
            confirm_password = data.get("confirm_password", [""])[0]
            git_name = data.get("git_name", [invitation.get("git_name", "")])[0].strip()
            git_email = data.get("git_email", [invitation.get("git_email", "")])[0].strip()
            github_token = data.get("github_token", [""])[0].strip()

            def fail(msg):
                self.send_response(302)
                self.send_header("Location", f"/onboard?token={urllib.parse.quote(token)}&error={urllib.parse.quote(msg)}")
                self.end_headers()

            if not USERNAME_RE.match(username):
                fail("Usuario inválido en la invitación.")
                return
            if password != confirm_password:
                fail("Las contraseñas no coinciden.")
                return
            if len(password) < 8:
                fail("La contraseña debe tener al menos 8 caracteres.")
                return
            if not git_name or not git_email:
                fail("Nombre y email de Git son obligatorios.")
                return

            users = load_users()
            if username in users:
                # If already exists, user must log in
                fail(f"El usuario '{username}' ya está activo. Usa /login.")
                return

            ok, stdout, stderr = provision_user(username, password, git_name, git_email, github_token)
            if not ok:
                print("ONBOARD ERROR:", stderr)
                fail("No se pudo aprovisionar el workspace. Contacta al administrador.")
                return

            # Mark token consumed
            consume_invitation(token)

            session_token = make_token(username)
            self.send_response(302)
            self.send_header("Set-Cookie", f"opencode_session={session_token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure")
            self.send_header("Location", "/")
            self.end_headers()
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), AuthHandler)
    print(f"Auth server listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
