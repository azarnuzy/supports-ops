export type WebWidgetConfig = {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  logoKey: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateWebWidgetConfigInput = {
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  closingMessage: string | null;
  allowedDomains: string[];
  logoKey?: string | null;
};

export type WebWidgetConfigResult = {
  webWidgetConfig: WebWidgetConfig;
  closingMessage: string | null;
};

export type VerifyWhatsAppConfigInput = {
  accessToken: string;
  appSecret: string;
  businessAccountId: string;
  phoneNumberId: string;
};
