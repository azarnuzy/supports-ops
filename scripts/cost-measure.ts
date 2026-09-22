/**
 * Measures what a Session really costs: drives scripted Sessions through the
 * real Web Widget HTTP API against EVAL_WORKSPACE_ID, with the API server and
 * the attachment / Ticket Knowledge workers running in this process, and
 * records every provider call's reported usage by tapping `fetch`. Also
 * ingests the eight Knowledge PDFs into a throwaway Workspace to price
 * ingestion. Writes a token profile — no prices — to docs/research/cost-runs/.
 *
 * To measure another model, change EVAL_WORKSPACE_ID's AI Agent's Agent Model
 * (the reply tier) or LLM_MODEL_FAST / EMBEDDING_MODEL in .env.local, and run
 * again; the profile name carries them.
 *
 *   pnpm cost:measure                  # all scripts ×3 + ingest
 *   pnpm cost:measure faq-short ingest # a subset
 *   COST_RUNS=1 pnpm cost:measure      # fewer runs
 *
 * Progress is saved after every run. Running again resumes the newest
 * unfinished profile for the same models and COST_RUNS, skipping every run
 * already measured. After changing a script's steps, delete that script's
 * entry (or the whole file) so stale runs are not reused.
 *
 * The dev worker must be stopped first: it would consume this run's
 * attachment and Ticket Knowledge jobs outside the tap.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const apiPort = 18_787;
process.env.API_PORT = String(apiPort);
process.env.API_INTERNAL_URL = `http://localhost:${apiPort}`;
process.env.ENABLE_TELEMETRY = "false";

// ─── Provider usage tap ─────────────────────────────────────────────────────

type CallKind = "main" | "fast" | "embedding" | "ocr" | "transcription" | "other-llm";

export type ProviderCall = {
  kind: CallKind;
  model: string;
  status: number;
  inputTokens: number;
  cachedInputTokens: number;
  /** null when the gateway does not report it. */
  cacheWriteTokens: number | null;
  outputTokens: number;
  reasoningTokens: number;
  pages: number;
  usage: unknown;
};

let calls: ProviderCall[] = [];
let inFlight = 0;
const realFetch = globalThis.fetch;

function providerKind(url: string, model: string): CallKind | null {
  if (url.includes("api.mistral.ai/v1/ocr")) return "ocr";
  if (url.includes("/audio/transcriptions")) return "transcription";
  if (url.includes("/embeddings")) return "embedding";
  if (!url.includes("/chat/completions")) return null;
  if (model === mainModelId) return "main";
  if (model === process.env.LLM_MODEL_FAST) return "fast";
  return "other-llm";
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const rawBody =
    typeof init?.body === "string"
      ? init.body
      : input instanceof Request
        ? await input.clone().text()
        : "";
  const model = (parseJson(rawBody) as { model?: string } | undefined)?.model ?? "";
  const kind = providerKind(url, model);
  if (!kind) return realFetch(input, init);

  inFlight += 1;
  try {
    const response = await realFetch(input, init);
    void response
      .clone()
      .text()
      .then((text) => calls.push(toCall(kind, model, response.status, text)))
      .catch(() => calls.push(toCall(kind, model, response.status, "")))
      .finally(() => {
        inFlight -= 1;
      });
    return response;
  } catch (error) {
    inFlight -= 1;
    throw error;
  }
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Streaming responses carry usage in their last SSE chunk. */
function lastUsage(text: string): Record<string, unknown> | undefined {
  const whole = parseJson(text) as Record<string, unknown> | undefined;
  if (whole) return whole;
  let found: Record<string, unknown> | undefined;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const chunk = parseJson(line.slice(5).trim()) as Record<string, unknown> | undefined;
    if (chunk?.usage) found = chunk;
  }
  return found;
}

type UsageInfo = {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  pages_processed?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number | null;
    cache_creation_tokens?: number | null;
  };
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number | null;
    cache_creation_tokens?: number | null;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

function toCall(kind: CallKind, model: string, status: number, text: string): ProviderCall {
  const body = (lastUsage(text) ?? {}) as {
    usage?: UsageInfo;
    usage_info?: UsageInfo;
    pages?: unknown[];
  };
  const usage = body.usage ?? body.usage_info ?? null;
  const promptDetails = usage?.prompt_tokens_details ?? usage?.input_tokens_details;
  const completionDetails = usage?.completion_tokens_details ?? usage?.output_tokens_details;
  const cacheWrite =
    promptDetails?.cache_write_tokens ??
    promptDetails?.cache_creation_tokens ??
    usage?.cache_creation_input_tokens ??
    null;
  return {
    cacheWriteTokens: typeof cacheWrite === "number" ? cacheWrite : null,
    cachedInputTokens: promptDetails?.cached_tokens ?? 0,
    inputTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? 0,
    kind,
    model: model || (kind === "ocr" ? "mistral-ocr-latest" : ""),
    outputTokens: usage?.completion_tokens ?? usage?.output_tokens ?? 0,
    pages: kind === "ocr" ? (usage?.pages_processed ?? body.pages?.length ?? 0) : 0,
    reasoningTokens: completionDetails?.reasoning_tokens ?? 0,
    status,
    usage,
  };
}

// ─── Platform, loaded after the tap so every client sees it ─────────────────

await import("../apps/api/src/index");
const { unscopedPrisma: prisma } = await import("../apps/api/src/utils/prisma");
const { withWorkspaceContext } = await import("../apps/api/src/utils/workspace-context");
const { isTicketGenerating } = await import("../apps/api/src/modules/widget/realtime");
const { getAttachmentProcessQueue } = await import(
  "../apps/api/src/modules/widget/attachment-queue"
);
const { getTicketKnowledgeIndexQueue } = await import("../apps/api/src/modules/tickets/queue");
const { cancelFollowUpTimers } = await import("../apps/api/src/modules/follow-up/queue");
const { claimTicket, completeHandoff } = await import("../apps/api/src/modules/tickets/services");
const { storageConfig } = await import("../apps/api/src/config");
const { createStorage } = await import("../packages/storage/src/index");
const { resolveAgentModelId } = await import("../apps/api/src/modules/ai-agent/model-catalog");
const worker = await import("../apps/worker/src/index");
const { processKnowledgeIngestJob } = await import("../apps/worker/src/knowledge-ingest");

if (!process.env.EVAL_WORKSPACE_ID) throw new Error("EVAL_WORKSPACE_ID is required.");
const workspaceId: string = process.env.EVAL_WORKSPACE_ID;
// The reply model is the eval Workspace's Agent Model (ADR-0022), not an
// environment variable — resolved once, before any provider call is tapped.
const mainModelId = resolveAgentModelId(
  (await prisma.aiAgent.findFirst({ select: { agentModel: true }, where: { workspaceId } }))
    ?.agentModel,
);
const queues = [getAttachmentProcessQueue(), getTicketKnowledgeIndexQueue()];
for (const queue of queues) {
  if ((await queue.getWorkers()).length) {
    throw new Error(`Stop the dev worker first: "${queue.name}" already has a consumer.`);
  }
}
const workers = [worker.startAttachmentProcessWorker(), worker.startTicketKnowledgeIndexWorker()];
const storage = createStorage(storageConfig);

// ─── Session scripts, mirroring the eval Cases ──────────────────────────────

type Step =
  | { say: string }
  | { attach: string; say: string }
  /** Human side: claim, then Handoff, which generates the Escalation Summary.
   * Suggested Replies are not measured: in this Workspace the Copilot runs
   * every READ_ONLY Tool, including the Business System ones, and fails whole
   * without it. Their cost is estimated in the method doc instead. */
  | { handoff: true };

const scripts: Record<string, { description: string; steps: Step[] }> = {
  "small-talk": {
    description: "Small talk only; should never become a Ticket",
    steps: [{ say: "Hi there!" }, { say: "Just browsing today." }, { say: "Ok, bye!" }],
  },
  "faq-short": {
    description: "One knowledge question, then the Customer confirms it is solved",
    steps: [
      { say: "Once my refund is approved, how long until the money is back?" },
      { say: "Great, that answers it. Thanks, all sorted!" },
    ],
  },
  "faq-multi": {
    description: "Five knowledge questions in one Session, then resolved",
    steps: [
      { say: "How long does it take before my order actually ships?" },
      { say: "What is the daily order cutoff time for same-day processing?" },
      { say: "Only part of my order arrived. Was the rest cancelled?" },
      { say: "If I just changed my mind, who pays for the return shipping?" },
      { say: "How should I measure my feet before buying shoes?" },
      { say: "Thanks, that's everything, problem solved." },
    ],
  },
  "order-tool": {
    description: "Catalog and order lookups through Shopify Tools (support loadout)",
    // The unknown order goes last: its lookup failure escalates, which would
    // otherwise end the Session before the catalog turns are measured.
    steps: [
      { say: "Which product has SKU MEN-NIK-NIK-088, and what is its current price?" },
      { say: "Do you sell any Nike sneakers? What do you have?" },
      { say: "Where is order NS-99999999 right now?" },
    ],
  },
  purchase: {
    description: "Purchase intent: the full Tool manifest for every later turn",
    steps: [
      { say: "I'd like to buy the Nike Air Jordan 1 Red And Black. Can you add it to my cart?" },
      { say: "EU size 42 please." },
      { say: "What would the total be with standard shipping?" },
      { say: "OK thanks, I'll finish checkout later." },
    ],
  },
  attachment: {
    description: "Customer sends an invoice PDF, then a payment screenshot (OCR)",
    steps: [
      {
        attach: "invoice-ns-10482.pdf",
        say: "What order number, item, and total are shown on the attached invoice?",
      },
      {
        attach: "payment-screenshot.png",
        say: "This screenshot shows I was charged twice. Please review it.",
      },
    ],
  },
  escalation: {
    description: "AI escalates; a Human Agent claims it (Escalation Summary)",
    steps: [
      { say: "Hi, I have a billing problem." },
      {
        say: "My bank shows two completed charges for the same order, both settled. Fix this and refund one.",
      },
      { handoff: true },
      { say: "Any update on this?" },
    ],
  },
  "long-session": {
    description: "Worst case: 15 turns, full Tool manifest, growing Agent Memory",
    steps: [
      "Hi, I'm looking for sneakers to buy.",
      "Do you sell any Nike sneakers? What do you have?",
      "Which product has SKU MEN-NIK-NIK-088, and what is its current price?",
      "What chest measurement does size S cover?",
      "How should I measure my feet before buying shoes?",
      "What is the approximate foot length in cm for EU size 42?",
      "How long does it take before my order actually ships?",
      "What is the daily order cutoff time for same-day processing?",
      "Where is order NS-99999999 right now?",
      "Only part of my order arrived. Was the rest cancelled?",
      "When I return something, do I get the original shipping fee back too?",
      "If I just changed my mind, who pays for the return shipping?",
      "How do I care for a waterproof shell jacket?",
      "How much is the Puma Future Rider Trainers? Just the price please.",
      "Great, thanks for all the help, that's everything.",
    ].map((say) => ({ say })),
  },
};

// ─── Driving a Session ──────────────────────────────────────────────────────

const api = `http://localhost:${apiPort}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(done: () => Promise<boolean>, what: string, timeoutMs = 240_000) {
  const startedAt = Date.now();
  let stableSince: number | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    const idle = (await done()) && inFlight === 0;
    stableSince = idle ? (stableSince ?? Date.now()) : null;
    if (stableSince && Date.now() - stableSince >= 1_500) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

async function queuesIdle() {
  for (const queue of queues) {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "prioritized");
    if (Object.values(counts).some(Boolean)) return false;
  }
  return true;
}

/** Idle once the AI Agent answered the Customer message at `position` — or
 * can no longer answer it — and nothing is still running in the background. */
async function settled(sessionId: string, position: number) {
  const session = await prisma.session.findUniqueOrThrow({
    select: { ticket: { select: { id: true, status: true } } },
    where: { id: sessionId },
  });
  const ticket = session.ticket;
  if (ticket && isTicketGenerating(ticket.id)) return false;
  if (!(await queuesIdle())) return false;
  if (ticket?.status !== "AI_HANDLING") return true;
  const pendingAttachments = await prisma.attachment.count({
    where: { processingStatus: "PROCESSING", ticketId: ticket.id },
  });
  if (pendingAttachments) return false;
  return Boolean(
    await prisma.message.findFirst({
      select: { id: true },
      where: { position: { gt: position }, senderType: { not: "CUSTOMER" }, sessionId },
    }),
  );
}

type SessionResponse = {
  id: string;
  accessToken: string;
};

type MessageResponse = {
  position?: number;
  message?: { position?: number };
  reply?: { position?: number };
};

async function post<T = Record<string, unknown>>(
  path: string,
  body: BodyInit,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await realFetch(`${api}${path}`, { body, headers, method: "POST" });
  const json = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw new Error(`${path} → ${response.status} ${JSON.stringify(json)}`);
  return json;
}

async function runSession(scriptId: string, run: number) {
  const widget = await prisma.webWidgetConfig.findFirstOrThrow({ where: { workspaceId } });
  const origin = `http://${widget.allowedDomains[0]}`;
  const humanAgent = await prisma.user.findFirstOrThrow({
    where: { role: "HUMAN_AGENT", workspaceId },
  });
  const session = await post<SessionResponse>(
    `/widget/pre-chat?key=${widget.widgetKey}`,
    JSON.stringify({
      email: `cost-${scriptId}-${run}-${randomUUID().slice(0, 8)}@example.com`,
      name: "Cost Measurement",
      widgetKey: widget.widgetKey,
    }),
    { "Content-Type": "application/json", Origin: origin },
  );
  const sessionId = session.id;
  const token = session.accessToken;
  calls = [];
  let customerMessages = 0;
  let handedOff = false;

  try {
    for (const step of scripts[scriptId].steps) {
      if ("handoff" in step) {
        const ticket = await prisma.ticket.findUnique({ where: { sessionId } });
        if (ticket?.status !== "ESCALATED") continue;
        await withWorkspaceContext(workspaceId, async () => {
          await claimTicket(ticket.id, humanAgent.id, workspaceId);
          await completeHandoff(ticket.id, humanAgent.id, workspaceId);
        });
        handedOff = true;
        continue;
      }
      customerMessages += 1;
      const message =
        "attach" in step
          ? await postAttachment(token, step.attach, step.say)
          : await post<MessageResponse>(
              `/widget/messages?token=${token}`,
              JSON.stringify({ content: step.say, idempotencyKey: randomUUID() }),
              { "Content-Type": "application/json" },
            );
      const position = (message.message ?? message).position ?? message.reply?.position ?? 0;
      await waitUntil(() => settled(sessionId, position), `${scriptId} "${step.say}"`);
    }
    await waitUntil(queuesIdle, `${scriptId} background jobs`);
    const ticket = await prisma.ticket.findUnique({
      select: { escalationReason: true, resolvedBy: true, status: true },
      where: { sessionId },
    });
    const aiTurns = await prisma.message.count({
      where: { senderType: { in: ["AI_AGENT", "SYSTEM"] }, sessionId },
    });
    const toolActivity = await prisma.aiActivity.findMany({
      orderBy: { createdAt: "asc" },
      select: { eventType: true, metadata: true },
      where: { eventType: { in: ["TOOL_CALLED", "TOOL_FAILED"] }, ticket: { sessionId } },
    });
    return {
      calls: [...calls],
      toolCalls: toolActivity.map(({ eventType, metadata }) => {
        const { error, origin, tool } = metadata as Record<string, string>;
        return { error, ok: eventType === "TOOL_CALLED", origin, tool };
      }),
      customerMessages,
      handedOff,
      outcome: ticket
        ? { escalationReason: ticket.escalationReason, status: ticket.status }
        : { status: "NO_TICKET" },
      replies: aiTurns,
    };
  } finally {
    await deleteSession(sessionId);
  }
}

async function postAttachment(token: string, fileName: string, content: string) {
  const bytes = await readFile(join(import.meta.dirname, "cost-fixtures", fileName));
  const form = new FormData();
  form.set("content", content);
  form.append(
    "files",
    new File([bytes], fileName, {
      type: fileName.endsWith(".pdf") ? "application/pdf" : "image/png",
    }),
  );
  return post<MessageResponse>(`/widget/attachments?token=${token}`, form);
}

/** Leaves the eval Workspace exactly as it was: a measurement Session must
 * never become Ticket Knowledge that later eval runs retrieve. */
async function deleteSession(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    select: { customerIdentityId: true, ticket: { select: { id: true } } },
    where: { id: sessionId },
  });
  const ticketId = session.ticket?.id;
  if (ticketId) {
    await cancelFollowUpTimers(ticketId);
    const attachments = await prisma.attachment.findMany({ where: { ticketId } });
    await Promise.all(attachments.map((a) => storage.deleteObject(a.storageKey).catch(() => {})));
  }
  await prisma.$transaction(async (tx) => {
    if (ticketId) {
      await tx.chunk.deleteMany({ where: { ticketId } });
      await tx.attachment.deleteMany({ where: { ticketId } });
      await tx.aiActivity.deleteMany({ where: { ticketId } });
      await tx.ticketReadState.deleteMany({ where: { ticketId } });
    }
    await tx.message.deleteMany({ where: { sessionId } });
    if (ticketId) await tx.ticket.delete({ where: { id: ticketId } });
    await tx.conversation.deleteMany({ where: { sessionId } });
    await tx.session.delete({ where: { id: sessionId } });
    await tx.customerIdentity.delete({ where: { id: session.customerIdentityId } });
  });
}

// ─── Knowledge ingest into a throwaway Workspace ────────────────────────────

async function measureIngest() {
  const scratchId = randomUUID();
  const pdfDir = join(import.meta.dirname, "..", "docs", "knowledge");
  const files = [
    "01_Shopping_and_Product_Discovery_Guide.pdf",
    "02_Shipping_Delivery_and_Order_Tracking_Guide.pdf",
    "03_Returns_Exchanges_and_Refund_Policy.pdf",
    "04_Payments_Discounts_Gift_Cards_and_Checkout_Guide.pdf",
    "05_Sizing_Fit_Materials_and_Product_Care_Guide.pdf",
    "06_INTERNAL_Customer_Support_Escalation_SOP.pdf",
    "07_INTERNAL_Order_Fulfillment_and_Inventory_Exception_Runbook.pdf",
    "08_LEGACY_Returns_and_Exchanges_Policy.pdf",
  ];
  await prisma.workspace.create({
    data: { id: scratchId, name: "Cost measurement", slug: `cost-${scratchId}` },
  });
  const keys: string[] = [];
  calls = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const key = `knowledge/${scratchId}/${id}.pdf`;
      keys.push(key);
      await storage.putObject({
        body: await readFile(join(pdfDir, file)),
        contentType: "application/pdf",
        key,
      });
      await prisma.knowledgeSource.create({
        data: {
          id,
          sourceType: "PDF",
          sourceUrl: key,
          status: "PROCESSING",
          title: basename(file),
          visibility: file.includes("INTERNAL") ? "INTERNAL_ONLY" : "CUSTOMER_SAFE",
          workspaceId: scratchId,
        },
      });
      await processKnowledgeIngestJob({
        data: {
          kind: "PDF",
          knowledgeSourceId: id,
          title: file,
          visibility: file.includes("INTERNAL") ? "INTERNAL_ONLY" : "CUSTOMER_SAFE",
          workspaceId: scratchId,
        },
      });
    }
    await waitUntil(async () => true, "ingest usage");
    const chunks = await prisma.chunk.count({ where: { workspaceId: scratchId } });
    const failed = await prisma.knowledgeSource.count({
      where: { status: "FAILED", workspaceId: scratchId },
    });
    return { calls: [...calls], chunks, documents: files.length, failed };
  } finally {
    await deleteScratchWorkspace(scratchId);
  }
}

async function deleteScratchWorkspace(id: string) {
  const sources = await prisma.knowledgeSource.findMany({ where: { workspaceId: id } });
  await Promise.all(
    sources.map(
      (source) => source.sourceUrl && storage.deleteObject(source.sourceUrl).catch(() => {}),
    ),
  );
  await prisma.chunk.deleteMany({ where: { workspaceId: id } });
  await prisma.knowledgeSource.deleteMany({ where: { workspaceId: id } });
  await prisma.workspace.delete({ where: { id } });
}

/** A run killed mid-Session skips its `finally`; clear what it left behind. */
async function deleteLeftovers() {
  const sessions = await prisma.session.findMany({
    select: { id: true },
    where: { customerIdentity: { email: { endsWith: "@example.com", startsWith: "cost-" } } },
  });
  for (const session of sessions) await deleteSession(session.id);
  const workspaces = await prisma.workspace.findMany({ where: { slug: { startsWith: "cost-" } } });
  for (const workspace of workspaces) await deleteScratchWorkspace(workspace.id);
  if (sessions.length || workspaces.length) {
    console.log(
      `Removed ${sessions.length} Session(s), ${workspaces.length} Workspace(s) left by an earlier run.`,
    );
  }
}

// ─── Aggregation ────────────────────────────────────────────────────────────

const fields = [
  "calls",
  "inputTokens",
  "cachedInputTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "pages",
] as const;
type Totals = Record<(typeof fields)[number], number | null>;

function totalsByKind(list: ProviderCall[]) {
  const byKind: Record<string, Totals> = {};
  for (const call of list) {
    let totals = byKind[call.kind];
    if (!totals) {
      totals = {
        cacheWriteTokens: null,
        cachedInputTokens: 0,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        pages: 0,
        reasoningTokens: 0,
      };
      byKind[call.kind] = totals;
    }
    totals.calls = (totals.calls ?? 0) + 1;
    for (const field of fields.slice(1)) {
      const value = call[field as keyof ProviderCall] as number | null;
      if (value !== null) totals[field] = (totals[field] ?? 0) + value;
    }
  }
  return byKind;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median per kind and field across runs; a kind missing from a run counts as zero. */
function medianByKind(runs: Array<Record<string, Totals>>) {
  const kinds = [...new Set(runs.flatMap((run) => Object.keys(run)))];
  return Object.fromEntries(
    kinds.map((kind) => [
      kind,
      Object.fromEntries(
        fields.map((field) => {
          const values = runs.map((run) => run[kind]?.[field] ?? null);
          const known = values.filter((value): value is number => value !== null);
          return [field, known.length ? median(values.map((value) => value ?? 0)) : null];
        }),
      ),
    ]),
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

const selected = process.argv.slice(2).filter((arg) => arg !== "--");
const wanted = (id: string) => !selected.length || selected.includes(id);
const runs = Number(process.env.COST_RUNS ?? 3);
const models = {
  embedding: process.env.EMBEDDING_MODEL,
  fast: process.env.LLM_MODEL_FAST,
  main: mainModelId,
  ocr: "mistral-ocr-latest",
};
const slug = (value = "") => value.replace(/[^a-z0-9.]+/gi, "-");
const outDir = join(import.meta.dirname, "..", "docs", "research", "cost-runs");
const suffix = `-${slug(models.main)}-${slug(models.fast)}.json`;

type SessionToolCall = {
  error: string | undefined;
  ok: boolean;
  origin: string;
  tool: string;
};

type SessionOutcome =
  | {
      escalationReason: string | null;
      status: string;
    }
  | {
      status: "NO_TICKET";
    };

type SessionRunResult = {
  calls: ProviderCall[];
  toolCalls: SessionToolCall[];
  customerMessages: number;
  handedOff: boolean;
  outcome: SessionOutcome;
  replies: number;
};
type ScriptProfileEntry = {
  description: string;
  runs: SessionRunResult[];
  median?: Record<string, Totals>;
};

type IngestProfile = {
  calls: ProviderCall[];
  chunks: number;
  documents: number;
  failed: number;
  totals: Record<string, Totals>;
};

type CostProfile = {
  gateway: {
    completion: string;
    embedding: string;
  };
  measuredAt: string;
  completedAt?: string;
  models: typeof models;
  runsPerScript: number;
  scripts: Record<string, ScriptProfileEntry>;
  ingest?: IngestProfile;
};

/** Resumes the newest unfinished profile for the same models and run count,
 * so a run that dies midway never re-measures what it already measured. */
async function unfinishedProfile() {
  await mkdir(outDir, { recursive: true });
  const names = (await readdir(outDir))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .reverse();
  for (const name of names) {
    const existing = JSON.parse(await readFile(join(outDir, name), "utf8"));
    if (
      !existing.completedAt &&
      existing.runsPerScript === runs &&
      JSON.stringify(existing.models) === JSON.stringify(models)
    ) {
      return { file: join(outDir, name), profile: existing as CostProfile };
    }
  }
  return undefined;
}

const resumed = await unfinishedProfile();
const measuredAt = new Date().toISOString();
const outFile = resumed?.file ?? join(outDir, `${measuredAt.slice(0, 10)}${suffix}`);
const profile: CostProfile = resumed?.profile ?? {
  gateway: {
    completion: process.env.COMPLETION_GATEWAY_BASE_URL || "https://openrouter.ai/api/v1",
    embedding: "https://openrouter.ai/api/v1",
  },
  measuredAt,
  models,
  runsPerScript: runs,
  scripts: {},
};
if (resumed) console.log(`Resuming ${outFile}`);

async function saveProfile() {
  await writeFile(outFile, `${JSON.stringify(profile, null, 2)}\n`);
}

try {
  await deleteLeftovers();
  for (const [id, script] of Object.entries(scripts)) {
    if (!wanted(id)) continue;
    let entry = profile.scripts[id];
    if (!entry) {
      entry = { description: script.description, runs: [] };
      profile.scripts[id] = entry;
    }
    for (let run = entry.runs.length + 1; run <= runs; run += 1) {
      console.log(`▶ ${id} run ${run}/${runs}`);
      const result = await runSession(id, run);
      console.log(
        `  ${JSON.stringify(result.outcome)} ${JSON.stringify(totalsByKind(result.calls))}`,
      );
      for (const tool of result.toolCalls) {
        console.log(
          `  tool ${tool.ok ? "✓" : "✗"} ${tool.origin} ${tool.tool}${tool.error ? ` — ${tool.error}` : ""}`,
        );
      }
      entry.runs.push(result);
      entry.median = medianByKind(entry.runs.map((r) => totalsByKind(r.calls)));
      await saveProfile();
    }
    if (entry.runs.length >= runs) console.log(`✓ ${id} (${entry.runs.length} runs)`);
  }
  if (wanted("ingest") && !profile.ingest) {
    console.log("▶ ingest");
    const ingest = await measureIngest();
    profile.ingest = { ...ingest, totals: totalsByKind(ingest.calls) };
    console.log(`  ${JSON.stringify(profile.ingest.totals)} chunks=${ingest.chunks}`);
    await saveProfile();
  }
  const complete =
    Object.keys(scripts).every((id) => profile.scripts[id]?.runs.length >= runs) && profile.ingest;
  if (complete) {
    profile.completedAt = new Date().toISOString();
    await saveProfile();
  }
  console.log(`\n${complete ? "Profile complete" : "Profile saved, unfinished"}: ${outFile}`);
} catch (error) {
  console.error(error);
  console.error(`\nProgress kept in ${outFile}; run the same command again to resume.`);
  process.exitCode = 1;
} finally {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(process.exitCode ?? 0);
}
