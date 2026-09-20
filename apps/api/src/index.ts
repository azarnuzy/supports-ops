import { serve } from "@hono/node-server";
import { apiConfig } from "./config";
import { logger } from "./utils/logger";
import { app } from "./app";

serve(
  {
    fetch: app.fetch,
    port: apiConfig.port,
  },
  (info) => {
    logger.info({ port: info.port }, "API listening");
  },
);
