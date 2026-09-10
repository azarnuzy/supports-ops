export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const ACRONYMS: Record<string, true> = { ai: true, api: true, id: true, sla: true, url: true };

/** Renders raw enum/database values as readable labels:
 * `CUSTOMER_REQUESTED_HUMAN` → "Customer requested human", `AI_HANDLING` → "AI handling". */
export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) =>
      ACRONYMS[word] ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
