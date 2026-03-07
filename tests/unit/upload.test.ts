import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultBinaryUpload } from "../../web/app";

describe("defaultBinaryUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries with POST when PUT returns 404", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(defaultBinaryUpload("/api/uploads?object_key=uploads%2Ffoo.ttf", new Uint8Array([1, 2]))).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });
});

describe("vite proxy config", () => {
  const originalProxyTarget = process.env.VITE_API_PROXY_TARGET;

  const loadViteConfig = async () => {
    vi.resetModules();
    return import("../../web/vite.config.mjs");
  };

  afterEach(() => {
    if (originalProxyTarget === undefined) {
      delete process.env.VITE_API_PROXY_TARGET;
    } else {
      process.env.VITE_API_PROXY_TARGET = originalProxyTarget;
    }
  });

  it("defaults /api proxy target to http://127.0.0.1:3000 when env is unset", async () => {
    delete process.env.VITE_API_PROXY_TARGET;

    const { default: config } = await loadViteConfig();

    expect(config.server?.proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:3000",
    });
  });

  it("prefers VITE_API_PROXY_TARGET when it is set", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:4567";

    const { default: config } = await loadViteConfig();

    expect(config.server?.proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:4567",
    });
  });
});
