# -*- coding: utf-8 -*-
"""ポケカ一覧ビューア用ローカルサーバー。

  python server.py [--port 8000]

  GET  /            … web/index.html
  GET  /api/cards   … 保存済みカードデータ (data/cards.json)
  POST /api/update  … 差分更新をバックグラウンドで開始
  GET  /api/status  … 更新の進捗
"""
import argparse
import json
import os
import threading
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer

import scraper

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")

_status = {"running": False, "phase": "idle", "message": "", "done": 0, "total": 0,
           "last_diff": None, "error": None}
_status_lock = threading.Lock()


def _progress(kw):
    with _status_lock:
        _status.update({k: v for k, v in kw.items() if v is not None})


def _run_update():
    try:
        diff = scraper.update(progress=_progress)
        with _status_lock:
            _status["last_diff"] = diff
            _status["error"] = None
    except Exception as e:
        with _status_lock:
            _status["phase"] = "error"
            _status["error"] = str(e)
            _status["message"] = f"更新に失敗しました: {e}"
    finally:
        with _status_lock:
            _status["running"] = False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB_DIR, **kw)

    def log_message(self, fmt, *args):
        pass  # 静かに

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/cards":
            data = scraper.load_data()
            return self._json(data)
        if self.path == "/api/status":
            with _status_lock:
                return self._json(dict(_status))
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/update":
            with _status_lock:
                if _status["running"]:
                    return self._json({"started": False, "reason": "already running"})
                _status.update({"running": True, "phase": "start", "message": "開始中…",
                                "done": 0, "total": 0, "error": None})
            threading.Thread(target=_run_update, daemon=True).start()
            return self._json({"started": True})
        self.send_error(404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"pokecaList: {url} で起動しました (Ctrl+C で終了)")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
