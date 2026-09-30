import { expect, it } from "vitest";
import {
  EVAL_CSV_TEMPLATE,
  historyBefore,
  keyAllocator,
  parseCsv,
  previewCsv,
  previewPaste,
} from "./import";

it("splits paste only on a line of three hyphens and keeps multiline content", () => {
  const p = previewPaste("Line one\nstill one\n---\na --- b\n---\n\n---\nlast", keyAllocator([]));
  expect(p.rows.map((r) => r.case?.message ?? r.errors[0])).toEqual([
    "Line one\nstill one",
    "a --- b",
    "Empty message block.",
    "last",
  ]);
  expect(previewPaste("  \n", keyAllocator([])).error).toMatch(/at least one/);
});

it("parses quoted commas, newlines and escaped quotes; rejects malformed CSV", () => {
  expect(parseCsv('message,category\n"a, ""b""\nc",x\r\n')).toEqual([
    ["message", "category"],
    ['a, "b"\nc', "x"],
  ]);
  expect(parseCsv('message\n"open')).toBeNull();
  expect(parseCsv('message\nab"c')).toBeNull();
});

it("imports message-only CSV as drafts using any alias, or a single unnamed column", () => {
  for (const alias of ["message", "USER_MESSAGE", "prompt", "input", "text"]) {
    const p = previewCsv(`${alias}\nhello\nworld`, keyAllocator([]));
    expect(p.rows.map((r) => r.case?.message)).toEqual(["hello", "world"]);
    expect(p.rows[0].case?.metric).toBeNull();
  }
  const single = previewCsv("How do I refund?\nWhere is my order?", keyAllocator([]));
  expect(single.rows.map((r) => r.case?.message)).toEqual([
    "How do I refund?",
    "Where is my order?",
  ]);
  expect(previewCsv("a,b\n1,2", keyAllocator([])).error).toMatch(/message column/);
});

it("keeps structured fields and reports row-level errors", () => {
  const csv = [
    "case_id,message,metric,expected,history,metadata,clarification_count",
    `c1,Hi,decision,,"[{""role"":""user"",""content"":""x""}]","{""decisions"":[""REPLY""]}",1`,
    "c1,Dup,contains,x,,,",
    "c3,Bad,nonsense,,,,",
    "c4,Bad json,,,{oops,,",
  ].join("\n");
  const p = previewCsv(csv, keyAllocator([]));
  expect(p.rows[0].case).toMatchObject({
    caseKey: "c1",
    clarificationCount: 1,
    history: [{ content: "x", role: "user" }],
    metadata: { decisions: ["REPLY"] },
    metric: "decision",
  });
  expect(p.rows[1].errors[0]).toMatch(/already used/);
  expect(p.rows[2].errors[0]).toMatch(/^metric/);
  expect(p.rows[3].errors).toEqual(["history is not valid JSON."]);
});

it("reports truncation past 100 rows instead of dropping silently", () => {
  const text = Array.from({ length: 130 }, (_, i) => `m${i}`).join("\n---\n");
  const p = previewPaste(text, keyAllocator([]));
  expect(p.rows).toHaveLength(100);
  expect(p.truncated).toEqual({ limit: 100, total: 130 });
});

it("uses the supported schema for the download template and keeps AI replies as history only", () => {
  const preview = previewCsv(EVAL_CSV_TEMPLATE, keyAllocator([]));
  expect(preview.error).toBeNull();
  expect(preview.rows[0].errors).toEqual([]);
  expect(preview.rows[0].case).toMatchObject({ metric: "contains", expected: "reset" });
  const history = historyBefore(
    [
      { content: "Old question", id: "m1", position: 1, senderType: "CUSTOMER", sessionId: "s1" },
      {
        content: "Old AI response",
        id: "m2",
        position: 2,
        senderType: "AI_AGENT",
        sessionId: "s1",
      },
      { content: "New question", id: "m3", position: 3, senderType: "CUSTOMER", sessionId: "s1" },
    ],
    3,
  );
  expect(history).toEqual([
    { content: "Old question", role: "user" },
    { content: "Old AI response", role: "assistant" },
  ]);
});
