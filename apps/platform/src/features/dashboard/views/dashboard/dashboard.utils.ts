export const channelTypeLabels: Record<string, string> = { WEB: "Web", WHATSAPP: "WhatsApp" };

const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatRate(rate: number | null) {
  return rate === null ? "—" : percentFormat.format(rate);
}
