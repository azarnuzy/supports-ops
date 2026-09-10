import type { HttpMethod, ToolRisk } from "@repo/api-client";

export type HttpToolFormState = {
  name: string;
  description: string;
  method: HttpMethod;
  url: string;
  risk: ToolRisk;
  inputSchema: string;
  bearerToken: string;
  secretHeaders: string;
  clearBearerToken: boolean;
  clearSecretHeaders: boolean;
};

export const emptyHttpToolForm: HttpToolFormState = {
  bearerToken: "",
  clearBearerToken: false,
  clearSecretHeaders: false,
  description: "",
  inputSchema: '{\n  "type": "object",\n  "properties": {}\n}',
  method: "GET",
  name: "",
  risk: "READ_ONLY",
  secretHeaders: "",
  url: "",
};
