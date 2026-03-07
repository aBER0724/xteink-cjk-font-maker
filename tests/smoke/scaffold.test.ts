import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVersion } from "../../worker/src/build-version";

function readText(relativePath: string) {
  return readFileSync(resolve(import.meta.dirname, relativePath), "utf8");
}

describe("scaffold", () => {
  it("exports buildVersion", () => {
    expect(buildVersion).toBeDefined();
  });

  it("removes Cloudflare-specific config from tooling", () => {
    const wranglerConfigPath = resolve(import.meta.dirname, "../../wrangler.toml");

    const packageJson = JSON.parse(readText("../../package.json")) as {
      scripts: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const tsconfig = JSON.parse(readText("../../tsconfig.json")) as {
      compilerOptions?: { types?: string[] };
      include?: string[];
    };

    expect(packageJson.scripts).toMatchObject({
      "server:dev": "node --watch server/index.js",
      "server:start": "node dist/server/index.js",
      build: "npm run web:build && npm run server:build",
      dev: 'concurrently -k -n app,web -c blue,green "npm run server:dev" "VITE_API_PROXY_TARGET=http://127.0.0.1:3000 npm run web:dev"',
      start: "npm run server:start",
    });
    expect(packageJson.scripts).not.toHaveProperty("deploy");
    expect(packageJson.scripts.dev).not.toContain("wrangler");
    expect(packageJson.devDependencies).not.toHaveProperty("wrangler");
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@cloudflare/workers-types",
    );

    expect(tsconfig.compilerOptions?.types).toEqual(["vitest/globals"]);
    expect(tsconfig.include).toEqual([
      "server/**/*.ts",
      "worker/src/**/*.ts",
      "tests/**/*.ts",
    ]);

    expect(existsSync(wranglerConfigPath)).toBe(false);
  });

  it("keeps dev compose dependencies outside startup commands", () => {
    const compose = readText("../../docker-compose.dev.yml");

    expect(compose).not.toContain("npm ci");
    expect(compose).toContain("app_node_modules:/app/node_modules");
    expect(compose).toContain("web_node_modules:/app/node_modules");
    expect(compose).toContain("volumes:");
    expect(compose).toContain("app_node_modules:");
    expect(compose).toContain("web_node_modules:");
  });

  it("removes Cloudflare references from current docs", () => {
    expect(readText("../../README.md")).not.toMatch(/Cloudflare|wrangler/i);
    expect(readText("../../README.zh.md")).not.toMatch(/Cloudflare|wrangler/i);
    expect(readText("../../README.ja.md")).not.toMatch(/Cloudflare|wrangler/i);
    expect(readText("../../AGENTS.md")).not.toMatch(/Cloudflare|wrangler/i);
    expect(existsSync(resolve(import.meta.dirname, "../../docs/deploy/cloudflare.md"))).toBe(false);
  });

  it("removes Vercel references and adapters", () => {
    expect(readText("../../README.md")).not.toMatch(/Vercel|vercel/i);
    expect(readText("../../README.zh.md")).not.toMatch(/Vercel|vercel/i);
    expect(readText("../../README.ja.md")).not.toMatch(/Vercel|vercel/i);
    expect(readText("../../AGENTS.md")).not.toMatch(/Vercel|vercel/i);
    expect(existsSync(resolve(import.meta.dirname, "../../vercel.json"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../../api/[...path].ts"))).toBe(false);
    expect(existsSync(resolve(import.meta.dirname, "../integration/vercel-api.test.ts"))).toBe(false);
  });

  it("removes Cloudflare runtime adapters and binding storage", () => {
    expect(existsSync(resolve(import.meta.dirname, "../../functions/api/[[path]].ts"))).toBe(false);
    expect(readText("../../worker/src/api.ts")).not.toContain("handleApiRequest(");
    expect(readText("../../worker/src/api.ts")).not.toContain("FONTS_BUCKET");
    expect(readText("../../worker/src/api.ts")).not.toContain("JOBS_KV");
    expect(readText("../../worker/src/storage.ts")).not.toContain("createBindingStorage");
    expect(readText("../../worker/src/storage.ts")).not.toContain("BucketLike");
    expect(readText("../../worker/src/storage.ts")).not.toContain("KVLike");
    expect(existsSync(resolve(import.meta.dirname, "../../worker/src/types.ts"))).toBe(false);
    expect(readText("../../tests/integration/api.test.ts")).not.toContain("KV/R2 bindings");
  });
});
