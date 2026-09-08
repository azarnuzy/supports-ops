import { Pool } from "pg";
import { env } from "./config";

export const pool = new Pool({ connectionString: env.BUSINESS_SYSTEM_DATABASE_URL });

export async function migrateBusinessSystem() {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS business_system;
    CREATE TABLE IF NOT EXISTS business_system.customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS business_system.subscriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES business_system.customers(id),
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      renewal_date DATE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_system.invoices (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES business_system.customers(id),
      amount NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL,
      due_date DATE NOT NULL
    );
    INSERT INTO business_system.customers (id, name, email) VALUES
      ('cus_102', 'Budi Santoso', 'budi@example.com'),
      ('cus_103', 'Siti Aminah', 'siti@example.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO business_system.subscriptions (id, customer_id, plan, status, renewal_date) VALUES
      ('sub_102', 'cus_102', 'Pro', 'ACTIVE', '2026-10-01'),
      ('sub_103', 'cus_103', 'Starter', 'PAST_DUE', '2026-09-01')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO business_system.invoices (id, customer_id, amount, status, due_date) VALUES
      ('inv_102', 'cus_102', 49.00, 'PAID', '2026-09-01'),
      ('inv_103', 'cus_103', 19.00, 'OVERDUE', '2026-09-01')
    ON CONFLICT (id) DO NOTHING;
  `);
}
