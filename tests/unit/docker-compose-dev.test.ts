import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("docker-compose.dev.yml", () => {
  it("does not watch missing worker/src/types.ts", () => {
    const compose = readFileSync(resolve(process.cwd(), "docker-compose.dev.yml"), "utf8");

    expect(compose).not.toContain("worker/src/types.ts");
    expect(compose).toContain("worker/src/api.ts");
    expect(compose).toContain("worker/src/consumer.ts");
    expect(compose).toContain("worker/src/storage.ts");
  });
});
