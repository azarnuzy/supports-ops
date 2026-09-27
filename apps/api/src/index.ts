import { serve } from "@hono/node-server";
import { apiConfig } from "./config";
import { logger } from "./utils/logger";
import { app } from "./app";
import { setStorageErrorReporter } from "@repo/storage";
import {
  externalErrorCode,
  externalHttpStatus,
  recordExternalError,
} from "./utils/external-errors";
import { unscopedPrisma } from "./utils/prisma";

setStorageErrorReporter((operation, error) =>
  recordExternalError(unscopedPrisma, {
    provider: "OBJECT_STORAGE",
    operation,
    code: externalErrorCode(error),
    httpStatus: externalHttpStatus(error),
  }),
);

serve(
  {
    fetch: app.fetch,
    port: apiConfig.port,
  },
  (info) => {
    logger.info({ port: info.port }, "API listening");
  },
);
