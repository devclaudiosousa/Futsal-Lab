#!/usr/bin/env python3
"""Servidor de sincronização do Futsal Lab (só biblioteca padrão do Python 3.8+).

Guarda os registos numa base SQLite e serve também os ficheiros da app,
para que app e sincronização fiquem no mesmo endereço (HTTPS via Tailscale ou proxy).

    python3 sync_server.py --token UM-CODIGO-LONGO
    python3 sync_server.py --token ... --port 8787 --db banco.sqlite --app ..

Conflitos: por registo, fica o que tiver updatedAt mais recente.
"""
import argparse
import hmac
import json
import mimetypes
import os
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

STORES = {"atletas", "exercicios", "treinos", "jogos", "definicoes"}
MAX_BODY = 50 * 1024 * 1024
lock = threading.Lock()


def connect(path):
    con = sqlite3.connect(path, check_same_thread=False)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS records(
        store TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL,
        rev INTEGER NOT NULL, device TEXT, data TEXT NOT NULL,
        PRIMARY KEY(store, id))""")
    con.execute("CREATE INDEX IF NOT EXISTS records_rev ON records(rev)")
    con.execute("CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v INTEGER)")
    con.execute("INSERT OR IGNORE INTO meta VALUES('rev', 0)")
    con.commit()
    return con


def sync(con, body):
    since = int(body.get("since") or 0)
    device = str(body.get("device") or "")[:64]
    accepted = 0
    with lock:
        rev = con.execute("SELECT v FROM meta WHERE k='rev'").fetchone()[0]
        for ch in body.get("changes") or []:
            store, rec = ch.get("store"), ch.get("rec") or {}
            rid, upd = rec.get("id"), rec.get("updatedAt")
            if store not in STORES or not isinstance(rid, str) or not isinstance(upd, (int, float)):
                continue
            row = con.execute("SELECT updated_at FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
            if row and row[0] >= upd:
                continue  # o servidor já tem uma versão igual ou mais recente
            rev += 1
            accepted += 1
            con.execute("INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?)",
                        (store, rid, int(upd), rev, device, json.dumps(rec, ensure_ascii=False, separators=(",", ":"))))
        con.execute("UPDATE meta SET v=? WHERE k='rev'", (rev,))
        con.commit()
        rows = con.execute("SELECT store, data FROM records WHERE rev>? ORDER BY rev", (since,)).fetchall()
    return {"rev": rev, "accepted": accepted, "changes": [{"store": s, "rec": json.loads(d)} for s, d in rows]}


def make_handler(con, token, app_dir, cors):
    app_dir = os.path.realpath(app_dir) if app_dir else None

    class H(BaseHTTPRequestHandler):
        server_version = "FutsalLab/1"

        def log_message(self, fmt, *args):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

        def cors(self):
            if cors:
                self.send_header("Access-Control-Allow-Origin", cors)
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Max-Age", "86400")

        def json(self, code, obj):
            data = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.cors()
            self.end_headers()
            self.wfile.write(data)

        def authed(self):
            got = self.headers.get("Authorization", "")
            ok = got.startswith("Bearer ") and hmac.compare_digest(got[7:].encode(), token.encode())
            if not ok:
                self.json(401, {"error": "token"})
            return ok

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/ping":
                if self.authed():
                    with lock:
                        rev = con.execute("SELECT v FROM meta WHERE k='rev'").fetchone()[0]
                        n = con.execute("SELECT COUNT(*) FROM records").fetchone()[0]
                    self.json(200, {"ok": True, "rev": rev, "records": n})
                return
            if path.startswith("/api/"):
                return self.json(404, {"error": "not found"})
            self.static(path)

        def do_POST(self):
            if urlparse(self.path).path != "/api/sync":
                return self.json(404, {"error": "not found"})
            if not self.authed():
                return
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self.json(413, {"error": "too large"})
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self.json(400, {"error": "json"})
            self.json(200, sync(con, body))

        def static(self, path):
            if not app_dir:
                return self.json(404, {"error": "no app"})
            rel = unquote(path).lstrip("/") or "index.html"
            full = os.path.realpath(os.path.join(app_dir, rel))
            if not full.startswith(app_dir + os.sep) and full != app_dir:
                return self.json(403, {"error": "forbidden"})
            if os.path.isdir(full):
                full = os.path.join(full, "index.html")
            first = os.path.relpath(full, app_dir).split(os.sep)[0]
            if not os.path.isfile(full) or first in ("server", ".git"):
                return self.json(404, {"error": "not found"})
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            if full.endswith(".webmanifest"):
                ctype = "application/manifest+json"
            with open(full, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith(("text/", "application/javascript")) else ""))
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)

    return H


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Servidor de sincronização do Futsal Lab")
    ap.add_argument("--token", default=os.environ.get("BANCO_TOKEN"), help="código de acesso (ou variável BANCO_TOKEN)")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--db", default=os.path.join(here, "banco.sqlite"))
    ap.add_argument("--app", default=os.path.dirname(here), help="pasta da app a servir ('' para não servir)")
    ap.add_argument("--cors", default="", help="origem autorizada, ex.: https://utilizador.github.io (só se a app estiver noutro endereço)")
    a = ap.parse_args()
    if not a.token or len(a.token) < 12:
        sys.exit("Indica --token com pelo menos 12 caracteres (ou a variável BANCO_TOKEN).")
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    con = connect(a.db)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(con, a.token, a.app or None, a.cors))
    print(f"Futsal Lab · http://{a.host}:{a.port} · base de dados {a.db}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
