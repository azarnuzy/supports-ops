import { resolveRange } from "../analytics/services";
import type { AnalyticsRangeQuery } from "../analytics/schema";
import { unscopedPrisma } from "../../utils/prisma";

export async function getModelMargin(query: AnalyticsRangeQuery = {}) {
  const { from, to, startAt, endAt } = resolveRange(query);
  const rows = await unscopedPrisma.creditLedgerEntry.groupBy({
    by: ["agentModel", "credits"],
    where: { type: "SPEND", createdAt: { gte: startAt, lt: endAt } },
    _count: { _all: true },
    _sum: { providerCostUsd: true },
  });
  const models = new Map<string, {
    agentModel: string;
    aiTurns: number;
    unlimitedTurns: number;
    creditsCharged: number;
    providerCostUsd: number;
    chargedProviderCostUsd: number;
  }>();

  for (const row of rows) {
    const agentModel = row.agentModel ?? "unknown";
    const model = models.get(agentModel) ?? {
      agentModel, aiTurns: 0, unlimitedTurns: 0, creditsCharged: 0,
      providerCostUsd: 0, chargedProviderCostUsd: 0,
    };
    const cost = row._sum.providerCostUsd ?? 0;
    model.aiTurns += row._count._all;
    model.providerCostUsd += cost;
    if (row.credits === 0) model.unlimitedTurns += row._count._all;
    else {
      model.creditsCharged -= row.credits * row._count._all;
      model.chargedProviderCostUsd += cost;
    }
    models.set(agentModel, model);
  }

  return {
    range: { from, to },
    models: [...models.values()].sort((a, b) => a.agentModel.localeCompare(b.agentModel)).map(
      ({ chargedProviderCostUsd, ...model }) => ({
        ...model,
        usdPerCredit: model.creditsCharged ? chargedProviderCostUsd / model.creditsCharged : null,
      }),
    ),
  };
}
