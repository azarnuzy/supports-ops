/** Pasted drafts are separated by a line holding only `---`. Blank chunks are dropped. */
export function splitPastedMessages(text: string) {
  return text
    .split(/^[ \t]*---[ \t]*$/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The next free `case-N` ID, given the IDs already in the dataset. */
export function nextCaseKeys(existing: string[], count: number) {
  const taken = new Set(existing);
  const keys: string[] = [];
  for (let n = 1; keys.length < count; n++) {
    const key = `case-${n}`;
    if (!taken.has(key)) keys.push(key);
  }
  return keys;
}
