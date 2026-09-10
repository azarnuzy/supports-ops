import { Hono } from "hono";
import { pool } from "./database";
import { defaultDemoCustomerId } from "./config";
import { handleMcpRequest } from "./mcp";

export const app = new Hono()
  .get("/health", (c) => c.json({ ok: true, service: "business-system" }))
  .all("/mcp", (c) => handleMcpRequest(c.req.raw))
  .get("/subscription-status", async (c) => {
    // ponytail: the AI Agent's required-Tool call carries no per-Ticket argument
    // (apps/api runtime always invokes required Tools with an empty input), so this
    // demo endpoint falls back to a fixed demo customer instead of the caller's own
    // account. Real per-Customer binding needs Ticket-context threading in the
    // orchestration layer (apps/api/src/modules/tools/orchestration.ts), out of
    // scope for this demo.
    const customerId = c.req.query("customerId")?.trim() || defaultDemoCustomerId;
    const result = await pool.query<{
      id: string;
      customerId: string;
      plan: string;
      status: string;
      renewalDate: string;
    }>(
      `SELECT id, customer_id AS "customerId", plan, status, renewal_date::text AS "renewalDate"
       FROM business_system.subscriptions WHERE customer_id = $1 ORDER BY renewal_date DESC LIMIT 1`,
      [customerId],
    );
    return result.rowCount ? c.json(result.rows[0]) : c.body(null, 404);
  })
  .get("/customers", async (c) => {
    const email = c.req.query("email")?.trim().toLowerCase();
    if (!email) return c.json({ error: "email is required" }, 400);
    const result = await pool.query<{ id: string; name: string; email: string }>(
      "SELECT id, name, email FROM business_system.customers WHERE email = $1",
      [email],
    );
    return result.rowCount ? c.json(result.rows[0]) : c.body(null, 404);
  })
  .get("/customers/:customerId/subscription", async (c) => {
    const result = await pool.query<{
      id: string;
      customerId: string;
      plan: string;
      status: string;
      renewalDate: string;
    }>(
      `SELECT id, customer_id AS "customerId", plan, status, renewal_date::text AS "renewalDate"
       FROM business_system.subscriptions WHERE customer_id = $1 ORDER BY renewal_date DESC LIMIT 1`,
      [c.req.param("customerId")],
    );
    return result.rowCount ? c.json(result.rows[0]) : c.body(null, 404);
  })
  .get("/customers/:customerId/invoices", async (c) => {
    const invoiceId = c.req.query("invoiceId");
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
      invoiceId ? [c.req.param("customerId"), invoiceId] : [c.req.param("customerId")],
    );
    return result.rowCount ? c.json(result.rows[0]) : c.body(null, 404);
  });
