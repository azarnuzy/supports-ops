import { describe, expect, it } from "vitest";
import { connection, processExampleJob } from "./index";

describe("worker", () => {
  it("uses configured redis connection", () => {
    expect(connection).toEqual(expect.objectContaining({ maxRetriesPerRequest: null }));
  });

  it("processes example jobs", async () => {
    const result = await processExampleJob({
      data: { message: "hello" },
      id: "job-1",
    });

    expect(Date.parse(result.processedAt)).not.toBeNaN();
  });
});
