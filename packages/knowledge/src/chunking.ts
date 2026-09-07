const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;

export type TextChunk = {
  position: number;
  content: string;
};

export type ChunkTextOptions = {
  maxChars?: number;
  overlapChars?: number;
};

/**
 * Splits normalized text into ordered, deterministic chunks by paragraph,
 * packing adjacent paragraphs up to `maxChars` and falling back to a sliding
 * window for any single paragraph that exceeds it on its own.
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const normalized = text.trim().replace(/\r\n/g, "\n");

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length > maxChars) {
      chunks.push(...splitLongParagraph(paragraph, maxChars, overlapChars));
    } else {
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((content, position) => ({ content, position }));
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
