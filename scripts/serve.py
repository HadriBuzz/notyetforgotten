"""Serve the project locally without caching edited files."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PUBLIC = Path(__file__).resolve().parents[1] / "public"


class DevelopmentHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        # Always send the file, including when its timestamp matches a cached copy.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(DevelopmentHandler, directory=str(PUBLIC))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"NYF · http://localhost:{args.port} · cache désactivé", flush=True)
        print(f"Dossier servi : {PUBLIC}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
