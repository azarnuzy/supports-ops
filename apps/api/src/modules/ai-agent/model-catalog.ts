export type ModelCatalogEntry = {
  id: string;
  name: string;
  rate: number;
};

/** Every entry has passed the Eval Suites and a `pnpm cost:measure` run
 * (ADR-0022). Adding one is a code change and a deploy, not a database write. */
export const modelCatalog: readonly ModelCatalogEntry[] = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", rate: 1 },
];

export const defaultAgentModelId = modelCatalog[0].id;

const catalogById = new Map(modelCatalog.map((entry) => [entry.id, entry]));

export function isCatalogModelId(modelId: string): boolean {
  return catalogById.has(modelId);
}

/** An Agent Model dropped from the catalog after being assigned falls back to
 * the default at call time, per ADR-0022 — never a call-time error. */
export function resolveAgentModelId(modelId: string | null | undefined): string {
  return modelId && catalogById.has(modelId) ? modelId : defaultAgentModelId;
}

/** The Model Rate for a resolved Agent Model id — how many Credits one AI Turn
 * costs. Call {@link resolveAgentModelId} first for an id that may not be in
 * the catalog. */
export function modelRateFor(modelId: string): number {
  return catalogById.get(modelId)?.rate ?? modelCatalog[0].rate;
}
