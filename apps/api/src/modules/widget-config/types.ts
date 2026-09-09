export type WebWidgetConfigDto = {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  logoKey: string | null;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WebWidgetConfigResponse = {
  webWidgetConfig: WebWidgetConfigDto;
  closingMessage: string | null;
};
