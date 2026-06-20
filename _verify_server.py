# 暫時的驗證伺服器：複製 server.js 的 /api/currency 轉換邏輯，並提供 public/ 前端。
# 僅用於本機驗證，非部署用（部署用 Node 的 server.js）。
import json, time, urllib.request, urllib.parse, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NINJA = "https://poe.ninja/poe2/api/economy/exchange/current/overview"
IMG = "https://web.poecdn.com"
DEFAULT_LEAGUE = "Runes of Aldur"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
PUB = os.path.join(os.path.dirname(__file__), "public")
cache = {}

def absimg(i): return (IMG + i) if i and not i.startswith("http") else i

def transform(raw, league, type_):
    items = {it["id"]: it for it in raw.get("items", [])}
    curs = []
    for ln in raw.get("lines", []):
        meta = items.get(ln["id"], {})
        dv = ln["primaryValue"]
        sp = ln.get("sparkline") or {}
        curs.append({
            "id": ln["id"], "name": meta.get("name", ln["id"]),
            "detailsId": meta.get("detailsId", ln["id"]), "image": absimg(meta.get("image")),
            "divineValue": dv, "perDivine": (1/dv if dv else None),
            "volume": ln.get("volumePrimaryValue", 0),
            "maxVolumeCurrency": ln.get("maxVolumeCurrency"),
            "maxVolumeRate": ln.get("maxVolumeRate"),
            "trend7d": sp.get("totalChange"), "sparkline": sp.get("data", []),
        })
    curs.sort(key=lambda c: c["divineValue"] or 0, reverse=True)
    core = raw.get("core", {})
    return {"league": league, "type": type_, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "primary": core.get("primary", "divine"), "secondary": core.get("secondary", "chaos"),
            "rates": core.get("rates", {}), "currencies": curs}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/api/currency"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            league = qs.get("league", [DEFAULT_LEAGUE])[0]; type_ = qs.get("type", ["Currency"])[0]
            key = league + "::" + type_
            if key in cache and time.time() - cache[key][0] < 60:
                payload = cache[key][1]
            else:
                url = f"{NINJA}?league={urllib.parse.quote(league)}&type={urllib.parse.quote(type_)}"
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json",
                                                           "Referer": "https://poe.ninja/poe2/economy"})
                raw = json.load(urllib.request.urlopen(req, timeout=15))
                payload = transform(raw, league, type_); cache[key] = (time.time(), payload)
            body = json.dumps(payload).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        # 靜態檔
        p = self.path.split("?")[0]
        if p == "/": p = "/index.html"
        fp = os.path.join(PUB, p.lstrip("/"))
        if os.path.isfile(fp):
            ct = {"html":"text/html",".css":"text/css",".js":"application/javascript"}.get(
                os.path.splitext(fp)[1], "text/plain")
            with open(fp, "rb") as f: data = f.read()
            self.send_response(200); self.send_header("Content-Type", ct+"; charset=utf-8")
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
        else:
            self.send_response(404); self.end_headers()

if __name__ == "__main__":
    print("verify server on http://localhost:8080")
    ThreadingHTTPServer(("127.0.0.1", 8080), H).serve_forever()
