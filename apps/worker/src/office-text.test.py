import json
import subprocess
import unittest
import zipfile
from io import BytesIO
from pathlib import Path


class OfficeTextTest(unittest.TestCase):
    def test_docx_text_and_embedded_visual(self):
        output = BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr(
                "word/document.xml",
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p></w:body></w:document>',
            )
            archive.writestr("word/media/image1.png", b"image")
        result = subprocess.run(
            ["python3", str(Path(__file__).with_name("office-text.py")), "docx"],
            input=output.getvalue(),
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), {"text": "Hello world", "visual": True})


if __name__ == "__main__":
    unittest.main()
