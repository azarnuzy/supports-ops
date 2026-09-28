"""Read text and detect embedded visuals in Office Open XML documents."""
import json
import re
import sys
import zipfile
from io import BytesIO
from xml.etree import ElementTree

kind = sys.argv[1]
data = sys.stdin.buffer.read(100 * 1024 * 1024 + 1)
if len(data) > 100 * 1024 * 1024:
    raise ValueError("Office document exceeds the processing limit")

with zipfile.ZipFile(BytesIO(data)) as archive:
    members = archive.namelist()
    if kind == "docx":
        parts = ["word/document.xml"]
        parts += sorted(name for name in members if re.fullmatch(r"word/(header|footer)\d+\.xml", name))
        visual = any(name.startswith(("word/media/", "word/charts/")) for name in members)
    else:
        parts = sorted(
            (name for name in members if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=lambda name: int(re.search(r"slide(\d+)", name).group(1)),
        )
        visual = any(name.startswith(("ppt/media/", "ppt/charts/")) for name in members)
    if sum(archive.getinfo(name).file_size for name in parts) > 20 * 1024 * 1024:
        raise ValueError("Office document text exceeds the processing limit")

    sections = []
    for index, name in enumerate(parts, 1):
        root = ElementTree.fromstring(archive.read(name))
        namespace = "{http://schemas.openxmlformats.org/drawingml/2006/main}" if kind == "pptx" else "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        text = "\n".join(
            "".join(value for element in paragraph.iter(namespace + "t") if (value := element.text))
            for paragraph in root.iter(namespace + "p")
        )
        if text.strip():
            sections.append((f"Slide {index}\n" if kind == "pptx" else "") + text)

print(json.dumps({"text": "\n\n".join(sections), "visual": visual}))
