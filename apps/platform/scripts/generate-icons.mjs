import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "assets");
const publicDir = resolve(root, "public");
const logo = resolve(assets, "support-ops-logo-source.png");
const background = resolve(assets, "auth-background-source.png");

await mkdir(publicDir, { recursive: true });

const icon = (size) =>
  sharp(logo).resize(size, size, { fit: "contain" }).png({ palette: true, quality: 90 }).toBuffer();
const icoImages = await Promise.all([16, 32, 48].map(icon));
const headerSize = 6 + icoImages.length * 16;
let offset = headerSize;
const icoHeader = Buffer.alloc(headerSize);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoImages.length, 4);
icoImages.forEach((image, index) => {
  const entry = 6 + index * 16;
  const size = [16, 32, 48][index];
  icoHeader.writeUInt8(size, entry);
  icoHeader.writeUInt8(size, entry + 1);
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(image.length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});

const logoBuffer = await sharp(logo)
  .resize(512, 512, { fit: "contain" })
  .png({ palette: true, quality: 90 })
  .toBuffer();
const ogOverlay = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <style>.title{fill:white;font:700 68px system-ui,sans-serif}.tagline{fill:#dbeafe;font:32px system-ui,sans-serif}</style>
    <text x="440" y="285" class="title">SupportOps</text>
    <text x="440" y="345" class="tagline">Support, resolved with confidence.</text>
  </svg>`);

await Promise.all([
  writeFile(resolve(publicDir, "favicon.ico"), Buffer.concat([icoHeader, ...icoImages])),
  writeFile(resolve(publicDir, "support-ops-logo.png"), logoBuffer),
  sharp(logo)
    .resize(180, 180, { fit: "contain" })
    .png({ palette: true, quality: 90 })
    .toFile(resolve(publicDir, "apple-touch-icon.png")),
  sharp(logo)
    .resize(192, 192, { fit: "contain" })
    .png({ palette: true, quality: 90 })
    .toFile(resolve(publicDir, "icon-192.png")),
  sharp(logo)
    .resize(512, 512, { fit: "contain" })
    .png({ palette: true, quality: 90 })
    .toFile(resolve(publicDir, "icon-512.png")),
  sharp(logo)
    .resize(410, 410, { fit: "contain" })
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "transparent" })
    .png({ palette: true, quality: 90 })
    .toFile(resolve(publicDir, "icon-512-maskable.png")),
  sharp({ create: { width: 1200, height: 630, channels: 4, background: "#071a4d" } })
    .composite([
      {
        input: await sharp(logo).resize(320, 320, { fit: "contain" }).png().toBuffer(),
        left: 80,
        top: 155,
      },
      { input: ogOverlay, left: 0, top: 0 },
    ])
    .png({ palette: true, quality: 90 })
    .toFile(resolve(publicDir, "og-image.png")),
  sharp(background)
    .resize(1280, 1600, { fit: "cover" })
    .webp({ quality: 75 })
    .toFile(resolve(publicDir, "auth-background.webp")),
  sharp(background)
    .resize(1280, 1600, { fit: "cover" })
    .avif({ quality: 50 })
    .toFile(resolve(publicDir, "auth-background.avif")),
  writeFile(
    resolve(publicDir, "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#19b5f5"/><stop offset=".55" stop-color="#1769ee"/><stop offset="1" stop-color="#5b31f4"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#g)"/><path d="M17 23c0-5 4-9 9-9h21v9H27v5h11c5 0 9 4 9 9s-4 9-9 9H17v-9h20v-5H26c-5 0-9-4-9-9Z" fill="white"/></svg>`,
  ),
  writeFile(
    resolve(publicDir, "site.webmanifest"),
    `${JSON.stringify(
      {
        name: "SupportOps",
        short_name: "SupportOps",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        theme_color: "#1769ee",
        background_color: "#ffffff",
        display: "standalone",
      },
      null,
      2,
    )}\n`,
  ),
]);

for (const file of [
  "apple-touch-icon.png",
  "auth-background.avif",
  "auth-background.webp",
  "icon-192.png",
  "icon-512-maskable.png",
  "icon-512.png",
  "og-image.png",
  "support-ops-logo.png",
]) {
  if ((await stat(resolve(publicDir, file))).size > 150 * 1024) {
    throw new Error(`${file} exceeds 150 KB`);
  }
}
