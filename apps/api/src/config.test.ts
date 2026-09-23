import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./config";

const productionEnv = {
  BETTER_AUTH_URL: "http://localhost:8000",
  CLIENT_ORIGINS: "http://localhost:3000,http://localhost:4000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:15432/supportops?schema=public",
  NODE_ENV: "production",
  OPERATOR_AUTH_SECRET: "a-different-production-secret-with-32-chars",
} satisfies NodeJS.ProcessEnv;

describe("API environment config", () => {
  it("rejects the default auth secret in production", () => {
    expect(() =>
      parseApiEnv({
        ...productionEnv,
        BETTER_AUTH_SECRET: "dev-change-me",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be changed in production.");
  });

  it("rejects short auth secrets in production", () => {
    expect(() =>
      parseApiEnv({
        ...productionEnv,
        BETTER_AUTH_SECRET: "short-secret",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be at least 32 characters in production.");
  });

  it("requires a separate Operator auth secret in production", () => {
    const { OPERATOR_AUTH_SECRET: _operatorAuthSecret, ...environment } = productionEnv;
    expect(() => parseApiEnv(environment)).toThrow(
      "OPERATOR_AUTH_SECRET must be set in production.",
    );
  });

  it("accepts a strong auth secret in production", () => {
    expect(() =>
      parseApiEnv({
        ...productionEnv,
        BETTER_AUTH_SECRET: "a-production-secret-with-32-chars",
      }),
    ).not.toThrow();
  });
});
