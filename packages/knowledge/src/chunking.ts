const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;
const HEADING = /^#{1,6}\s/;

export type TextChunk = {
  position: number;
  content: string;
};

export type ChunkTextOptions = {
  maxChars?: number;
  overlapChars?: number;
};

/**
 * Splits normalized text into ordered, deterministic chunks. Markdown headings
 * (what PDF OCR emits) bound a chunk: a section is never packed together with
 * the next one, and every chunk of a long section repeats its heading. Packing
 * purely by size used to leave a heading at the tail of one chunk and its body
 * in the next (e.g. "### 6.1 No first scan" apart from its paragraph), so the
 * body's embedding never carried the topic it answers. Within a section,
 * adjacent paragraphs pack up to `maxChars`, with a sliding window for any
 * single paragraph that exceeds it on its own.
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const normalized = stripRepeatedLines(text.trim().replace(/\r\n/g, "\n"));

  if (!normalized) {
    return [];
  }

  return splitSections(normalized)
    .flatMap((section) => packSection(section, maxChars, overlapChars))
    .map((content, position) => ({ content, position }));
}

type Section = { heading: string; body: string };

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let body: string[] = [];

  const close = () => {
    if (heading || body.join("").trim()) sections.push({ body: body.join("\n").trim(), heading });
  };

  for (const line of text.split("\n")) {
    if (!HEADING.test(line)) {
      body.push(line);
      continue;
    }
    // A heading with no body of its own ("## 6. Tracking" right before
    // "### 6.1 …") stays attached to the next heading instead of becoming an
    // empty chunk.
    if (heading && !body.join("").trim()) {
      heading = `${heading}\n${line.trim()}`;
      continue;
    }
    close();
    heading = line.trim();
    body = [];
  }
  close();

  return sections;
}

function packSection({ heading, body }: Section, maxChars: number, overlapChars: number) {
  if (!body) return [heading];

  const prefix = heading ? `${heading}\n\n` : "";
  const budget = Math.max(1, maxChars - prefix.length);
  const pieces: string[] = [];
  let current = "";

  for (const paragraph of body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }

    if (current) {
      pieces.push(current);
      current = "";
    }

    if (paragraph.length > budget) {
      pieces.push(...splitLongParagraph(paragraph, budget, overlapChars));
    } else {
      current = paragraph;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces.map((piece) => `${prefix}${piece}`);
}

/**
 * Drops page furniture that OCR repeats on every page ("Northstar Outfitters
 * Demo Documentation | Page 3", a running header). It lands mid-section and
 * pulls every chunk's embedding toward the same boilerplate.
 */
// ponytail: frequency heuristic (≥3 repeats, ≥20 chars, not a table row or
// heading); switch to per-page header/footer detection at extraction if it
// ever eats a real sentence.
function stripRepeatedLines(text: string): string {
  const key = (line: string) => line.trim().replace(/\d+/g, "#");
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    counts.set(key(line), (counts.get(key(line)) ?? 0) + 1);
  }

  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length < 20 || trimmed.startsWith("|") || HEADING.test(trimmed)) return true;
      return (counts.get(key(line)) ?? 0) < 3;
    })
    .join("\n")
    .trim();
}

function splitLongParagraph(paragraph: string, maxChars: number, overlapChars: number): string[] {
  const pieces: string[] = [];
  // Overlap must never reach maxChars, or `start` stops advancing and the
  // loop never terminates.
  const safeOverlap = Math.max(0, Math.min(overlapChars, maxChars - 1));
  let start = 0;

  while (start < paragraph.length) {
    const end = Math.min(start + maxChars, paragraph.length);
    pieces.push(paragraph.slice(start, end));

    if (end === paragraph.length) {
      break;
    }

    start = end - safeOverlap;
  }

  return pieces;
}
