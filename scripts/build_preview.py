"""Generate the conversation preview from the actual website sources.

The application sources stay separate; this derived file embeds resources because
the conversation preview cannot load files from the local project.
"""

import base64
import json
import mimetypes
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def build_preview():
    document = (ROOT / "index.html").read_text()
    fragment = document.split("<body>", 1)[1].split("</body>", 1)[0].strip()
    catalogue = json.loads((ROOT / "config/oeuvres.json").read_text())
    for artwork in catalogue["artworks"]:
        # Embed each compact reproduction once; the lightbox uses the same asset.
        image = ROOT / artwork["image"].get("previewLargeSrc", artwork["image"]["src"])
        mime_type = mimetypes.guess_type(image)[0] or {".webp": "image/webp"}.get(image.suffix.lower())
        if mime_type is None:
            raise ValueError(f"Type d’image inconnu : {image}")
        artwork["image"]["src"] = f"data:{mime_type};base64," + base64.b64encode(image.read_bytes()).decode()
        artwork["image"].pop("largeSrc", None)
        artwork["image"].pop("previewLargeSrc", None)

    dictionaries = {
        language: json.loads((ROOT / f"config/translations/{language}.json").read_text())
        for language in ("fr", "en")
    }

    data = json.dumps(catalogue, ensure_ascii=False).replace("<", "\\u003c")
    translations = json.dumps(dictionaries, ensure_ascii=False).replace("<", "\\u003c")
    css = (ROOT / "assets/styles.css").read_text()
    js = (ROOT / "js/app.js").read_text()
    output = ROOT / "design/preview.html"
    output.parent.mkdir(exist_ok=True)
    # The fragment is extracted from the authored page, never maintained by hand.
    output.write_text(
        "<style>\n" + css + "\n</style>\n" + fragment
        + '\n<script id="nyf-catalogue" type="application/json">' + data + "</script>\n"
        + '<script id="nyf-translations" type="application/json">' + translations + "</script>\n"
        + "<script>\n" + js
        + "\nwindow.initNYF(JSON.parse(document.getElementById('nyf-catalogue').textContent), JSON.parse(document.getElementById('nyf-translations').textContent));\n</script>\n"
    )
    if output.stat().st_size >= 1_000_000:
        raise ValueError("La prévisualisation doit rester inférieure à 1 Mo.")
    print(output)


if __name__ == "__main__":
    build_preview()
