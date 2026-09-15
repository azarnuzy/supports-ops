export function mutationIntentPrompt(params: {
  priorAiMessage: string | null;
  requireConfirmation: boolean;
  toolDescription: string;
  toolName: string;
}): string {
  const header = `You judge Customer intent for SupportOps' AI Agent, which is about to call a Tool named "${params.toolName}":
${params.toolDescription}

The Customer's current message is given as the prompt.`;

  if (params.requireConfirmation) {
    return `${header}

This Tool is irreversible (payment, checkout, or similar), so it needs a two-step confirmation. The Agent's own most recent message to the Customer was:
${params.priorAiMessage ?? "None — the Agent has not said anything yet."}

Answer explicit: true only if that prior message already proposed this exact action in plain terms (naming the item, quantity, price, or similar specifics) AND the Customer's current message clearly confirms proceeding (e.g. "yes", "confirm", "go ahead", "ya", "lanjutkan"). A first-time request alone is never enough — the Agent must propose it first, in a separate message, and the Customer must confirm afterward. Answer false whenever this two-step hasn't both happened, including when the prior message never proposed anything or the confirmation is ambiguous.`;
  }

  return `${header}

The Agent's own most recent message to the Customer was:
${params.priorAiMessage ?? "None — the Agent has not said anything yet."}

Answer explicit: true when either:
1. The Customer's current message itself clearly requests this specific action now; or
2. The prior Agent message proposed this exact action and the current message clearly confirms it (e.g. "yes please", "go ahead", "ya", "lanjutkan").

The prior proposal and confirmation must refer to the same specific action. Answer false for implied, past, vague, unrelated, or stale approval.`;
}
