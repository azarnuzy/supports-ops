import { aiAgentConfig } from "../../config";

export type ModelCatalogEntry = {
  id: string;
  name: string;
  rate: number;
  description: string;
  devscaleId: string;
  openRouterId?: string;
};

const availableModels: readonly ModelCatalogEntry[] = [
  // ponytail: one Credit for this eligible set; remeasure if provider prices or turn usage changes.
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    rate: 1,
    description: "Balanced support conversations and tool use.",
    devscaleId: "gpt-5.6-luna",
    openRouterId: "openai/gpt-5.6-luna",
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    rate: 1,
    description: "Fast support conversations and tool use.",
    devscaleId: "gpt-6-luna",
    openRouterId: "openai/gpt-6-luna",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    rate: 1,
    description: "Fast reasoning and support replies.",
    devscaleId: "deepseek-v4.1-flash",
    openRouterId: "deepseek/deepseek-v4.1-flash",
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731",
    rate: 1,
    description: "Efficient support replies and tool use.",
    devscaleId: "deepseek-v4-flash-0731",
    openRouterId: "deepseek/deepseek-v4-flash-0731",
  },
  {
    id: "xiaomi/mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    rate: 1,
    description: "Efficient support conversations.",
    devscaleId: "mimo-v2.6-flash",
    openRouterId: "xiaomi/mimo-v2.6-flash",
  },
  {
    id: "muse-spark-1.3-contributor",
    name: "Muse Spark 1.3 Contributor",
    rate: 1,
    description: "Available through Devscale.",
    devscaleId: "muse-spark-1.3-contributor",
  },
];

const isDevscale = new URL(aiAgentConfig.baseUrl).hostname === "gateway.devscale.id";
export const modelCatalog = availableModels.filter((model) => isDevscale || model.openRouterId);
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

export function gatewayModelId(modelId: string): string {
  const model = availableModels.find((entry) =>
    [entry.id, entry.devscaleId, entry.openRouterId].includes(modelId),
  );
  return (isDevscale ? model?.devscaleId : model?.openRouterId) ?? modelId;
}
