export type McpServerFormState = {
  name: string;
  url: string;
  bearerToken: string;
  secretHeaders: string;
  clearBearerToken: boolean;
  clearSecretHeaders: boolean;
};

export const emptyMcpServerForm: McpServerFormState = {
  bearerToken: "",
  clearBearerToken: false,
  clearSecretHeaders: false,
  name: "",
  secretHeaders: "",
  url: "",
};
