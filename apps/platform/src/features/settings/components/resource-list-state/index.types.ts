import type { ReactNode } from "react";

export type ResourceListStateProps = {
  /** Shown while the initial fetch is in flight. */
  isPending: boolean;
  skeletonCount?: number;
  /** Shown when the fetch failed; pairs with a Retry action. */
  isError: boolean;
  errorLabel: string;
  onRetry: () => void;
  /** Shown when the fetch succeeded but produced no rows. */
  isEmpty: boolean;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
};
