import type { ReactNode } from "react";

export type SettingsHeaderProps = {
  /** Rendered on the right of the title row, e.g. a primary action button. */
  action?: ReactNode;
  description: string;
  /** Small uppercase label above the title; only pages that need the extra context set it. */
  eyebrow?: string;
  title: string;
};
