# serve_json.py  (CORS‑enabled)
import http.server
import json
from pathlib import Path

JSON_PATH = Path("data.json")
PORT = 8000

class JSONHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")  # or 'http://localhost:4200'
        super().end_headers()

    def do_GET(self):
        if self.path not in ("/", "/data.json"):
            self.send_error(404, "Not found")
            return

        payload = JSON_PATH.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

if __name__ == "__main__":
    http.server.HTTPServer(("", PORT), JSONHandler).serve_forever()
