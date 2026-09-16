import type { DashboardRange } from "../../dashboard.utils";

export type DateRangePickerProps = {
  range: DashboardRange;
  onChange: (range: DashboardRange) => void;
  className?: string;
};
