import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./config";
import { migrateBusinessSystem } from "./database";

await migrateBusinessSystem();
serve({ fetch: app.fetch, port: env.BUSINESS_SYSTEM_PORT });
