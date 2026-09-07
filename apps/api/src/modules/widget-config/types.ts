export type WebWidgetConfigDto = {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type WebWidgetConfigResponse = {
  webWidgetConfig: WebWidgetConfigDto;
  closingMessage: string | null;
};
