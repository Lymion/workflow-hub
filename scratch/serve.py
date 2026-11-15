"""Scratch server: serves this folder, appends POST /notes to notes.txt, /v = scratch.html mtime."""
import http.server, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v":
            b = str(os.path.getmtime("scratch.html")).encode()
            self.send_response(200); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(b)
        else:
            if self.path == "/": self.path = "/scratch.html"
            super().do_GET()
    def do_POST(self):
        if self.path != "/notes": return self.send_error(404)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        with open("notes.txt", "a", encoding="utf-8") as f: f.write(body.strip() + "\n")
        print("NOTES RECEIVED", flush=True)
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass

print(f"Scratch on http://localhost:{PORT}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
