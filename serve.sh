#!/bin/sh
# Serve Vermillion locally at http://localhost:8642 (game) and http://localhost:8642/tests/ (tests).
# Sends no-cache headers so a normal reload always picks up the latest files.
cd "$(dirname "$0")" && exec python3 -c '
import http.server, socketserver
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("", 8642), H) as s:
    print("Vermillion at http://localhost:8642", flush=True); s.serve_forever()
'
