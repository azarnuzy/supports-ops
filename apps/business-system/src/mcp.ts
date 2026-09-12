import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { pool } from "./database";

function createInvoiceServer() {
  const server = new McpServer({ name: "business-system", version: "0.1.0" });
  server.registerTool(
    "getInvoiceStatus",
    {
      description:
        "Look up a customer's invoice status by customer ID, optionally a specific invoice ID. " +
        'This demo Workspace has one linked account: customerId "cus_102".',
      inputSchema: {
        customerId: z.string().describe("The Business System customer ID, e.g. cus_102."),
        invoiceId: z
          .string()
          .optional()
          .describe("A specific invoice ID; defaults to the most recent."),
      },
    },
    async ({ customerId, invoiceId }) => {
      const result = await pool.query<{
        id: string;
        customerId: string;
        amount: string;
        status: string;
        dueDate: string;
      }>(
        invoiceId
          ? `SELECT id, customer_id AS "customerId", amount::text AS amount, status, due_date::text AS "dueDate"
             FROM business_system.invoices WHERE customer_id = $1 AND id = $2`
          : `SELECT id, customer_id AS "customerId", amount::text AS amount, status, due_date::text AS "dueDate"
             FROM business_system.invoices WHERE customer_id = $1 ORDER BY due_date DESC LIMIT 1`,
        invoiceId ? [customerId, invoiceId] : [customerId],
      );
      if (!result.rowCount) {
        return {
          content: [{ type: "text", text: "No invoice found for that customer." }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.rows[0]) }] };
    },
  );
  return server;
}

/** Stateless: a fresh server+transport per request, matching the demo's single-tool scope. */
export async function handleMcpRequest(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  const server = createInvoiceServer();
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();
  return response;
}
