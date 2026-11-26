"""Generate the conversation preview from the actual website sources.

The application sources stay separate; this derived file embeds resources because
the conversation preview cannot load files from the local project.
"""

import base64
import json
import mimetypes
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def build_preview():
    document = (PUBLIC / "index.html").read_text()
    fragment = document.split("<body>", 1)[1].split("</body>", 1)[0].strip()
    catalogue = json.loads((PUBLIC / "config/oeuvres.json").read_text())
    details = {}
    for artwork in catalogue["artworks"]:
        artwork_id = artwork["id"]
        details[artwork_id] = (PUBLIC / "ressources/oeuvres" / f"{artwork_id}.md").read_text()
        # Embed each compact reproduction once; the lightbox uses the same asset.
        image = PUBLIC / artwork["image"].get("previewLargeSrc", artwork["image"]["src"])
        mime_type = mimetypes.guess_type(image)[0] or {".webp": "image/webp"}.get(image.suffix.lower())
        if mime_type is None:
            raise ValueError(f"Type d’image inconnu : {image}")
        artwork["image"]["src"] = f"data:{mime_type};base64," + base64.b64encode(image.read_bytes()).decode()
        artwork["image"].pop("largeSrc", None)
        artwork["image"].pop("previewLargeSrc", None)

    dictionaries = {
        language: json.loads((PUBLIC / f"config/translations/{language}.json").read_text())
        for language in ("fr", "en")
    }

    data = json.dumps(catalogue, ensure_ascii=False).replace("<", "\\u003c")
    translations = json.dumps(dictionaries, ensure_ascii=False).replace("<", "\\u003c")
    markdown = json.dumps(details, ensure_ascii=False).replace("<", "\\u003c")
    css = (PUBLIC / "assets/styles.css").read_text()
    js = (PUBLIC / "js/app.js").read_text()
    output = ROOT / "design/preview.html"
    output.parent.mkdir(exist_ok=True)
    # The fragment is extracted from the authored page, never maintained by hand.
    output.write_text(
        "<style>\n" + css + "\n</style>\n" + fragment
        + '\n<script id="nyf-catalogue" type="application/json">' + data + "</script>\n"
        + '<script id="nyf-translations" type="application/json">' + translations + "</script>\n"
        + '<script id="nyf-details-data" type="application/json">' + markdown + "</script>\n"
        + "<script>\n" + js
        + "\nconst readPreviewData = (id) => JSON.parse(document.getElementById(id).textContent);\n"
        + "window.initNYF(readPreviewData('nyf-catalogue'), readPreviewData('nyf-translations'), readPreviewData('nyf-details-data'));\n</script>\n"
    )
    if output.stat().st_size >= 1_000_000:
        raise ValueError("La prévisualisation doit rester inférieure à 1 Mo.")
    print(output)


if __name__ == "__main__":
    build_preview()
