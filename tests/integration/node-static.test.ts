import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createServer } from "../../server/index";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createStaticRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "xteink-node-static-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "index.html"), "<!doctype html><html><body>app shell</body></html>");
  await writeFile(path.join(root, "assets", "app.js"), "console.log('asset');");
  return root;
}

async function request(pathname: string, staticRoot: string) {
  const server = createServer({ staticRoot });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  try {
    return await fetch(`http://127.0.0.1:${port}${pathname}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("node static server", () => {
  it("serves index.html at /", async () => {
    const staticRoot = await createStaticRoot();

    const response = await request("/", staticRoot);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("<!doctype html>");
  });

  it("serves built asset files", async () => {
    const staticRoot = await createStaticRoot();

    const response = await request("/assets/app.js", staticRoot);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("console.log('asset')");
  });

  it("falls back to index.html for SPA routes", async () => {
    const staticRoot = await createStaticRoot();
    const indexHtml = await readFile(path.join(staticRoot, "index.html"), "utf8");

    const response = await request("/settings/profile", staticRoot);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toBe(indexHtml);
  });

  it("returns 404 for missing asset files with an extension", async () => {
    const staticRoot = await createStaticRoot();

    const response = await request("/assets/missing.js", staticRoot);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("keeps api 404 responses outside the static fallback", async () => {
    const staticRoot = await createStaticRoot();

    const response = await request("/api/unknown", staticRoot);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ code: "ERR_NOT_FOUND" });
  });

  it("returns json 404 for unknown frontend routes when index.html is missing", async () => {
    const staticRoot = await createStaticRoot();
    await rm(path.join(staticRoot, "index.html"));

    const response = await request("/settings/profile", staticRoot);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });
});
