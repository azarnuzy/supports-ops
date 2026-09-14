export type McpServerFormState = {
  name: string;
  url: string;
  bearerToken: string;
  secretHeaders: string;
  staticArguments: string;
  clearBearerToken: boolean;
  clearSecretHeaders: boolean;
  clearStaticArguments: boolean;
};

export const emptyMcpServerForm: McpServerFormState = {
  bearerToken: "",
  clearBearerToken: false,
  clearSecretHeaders: false,
  clearStaticArguments: false,
  name: "",
  secretHeaders: "",
  staticArguments: "",
  url: "",
};
