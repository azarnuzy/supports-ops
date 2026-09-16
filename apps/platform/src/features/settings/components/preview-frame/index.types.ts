import type { ReactNode } from "react";

export type BrowserFrameProps = {
  children: ReactNode;
  domain: string;
};

export type WidgetLauncherProps = {
  color: string;
  onClick: () => void;
};

export type WidgetPanelProps = {
  children: ReactNode;
  color: string;
  logoUrl?: string | null | undefined;
  name: string;
  onClose: () => void;
};

export type WidgetStageProps = {
  children: ReactNode;
  /** Click-away dismiss for the simulated page behind the widget; omit when the panel is closed. */
  onDismiss?: () => void;
};
