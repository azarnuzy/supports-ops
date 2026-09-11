/** Seeded into every new Workspace so an Admin starts from something sensible and edits from
 * there. The fallback catches whatever the classifier is unsure about, so exactly one entry
 * carries `isFallback` and the UI refuses to delete it. */
export const defaultTicketCategories = [
  {
    description: "Sign-in problems, profile changes, access, and account security.",
    isFallback: false,
    key: "ACCOUNT",
    label: "Account",
  },
  {
    description: "Invoices, payments, refunds, and anything about money already charged.",
    isFallback: false,
    key: "BILLING",
    label: "Billing",
  },
  {
    description: "Plans, upgrades, downgrades, renewals, and cancellations.",
    isFallback: false,
    key: "SUBSCRIPTION",
    label: "Subscription",
  },
  {
    description: "Bugs, errors, outages, and the product not behaving as expected.",
    isFallback: false,
    key: "TECHNICAL",
    label: "Technical",
  },
  {
    description: "Anything that does not clearly belong to another category.",
    isFallback: true,
    key: "GENERAL",
    label: "General",
  },
] as const;

export const fallbackCategoryKey = "GENERAL";
