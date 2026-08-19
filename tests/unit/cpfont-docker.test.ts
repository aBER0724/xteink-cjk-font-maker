import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";


function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}


describe("production cpfont toolchain image", () => {
  it("pins and verifies the canonical toolkit in a Debian production image", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS production");
    expect(dockerfile).toContain("ARG CPFONT_TOOL_COMMIT=c242803dbd47f13fa5886bf0701db72871709d23");
    expect(dockerfile).toContain("git checkout --detach \"$CPFONT_TOOL_COMMIT\"");
    expect(dockerfile).toContain("python3 -m venv /opt/cpfont-venv");
    expect(dockerfile).toContain("pip install --no-cache-dir -r requirements.txt");
    expect(dockerfile).toContain("python scripts/fetch_fallback.py");
    expect(dockerfile).toContain("CPFONT_TOOL_ROOT=/opt/crosspoint-cjk-fonts");
    expect(dockerfile).toContain("CPFONT_PYTHON=/opt/cpfont-venv/bin/python");
    expect(dockerfile).toContain("CPFONT_VERSION == 4");
  });

  it("passes the toolkit pin through production compose and compiles all worker sources in dev", () => {
    const compose = read("docker-compose.yml");
    const dev = read("docker-compose.dev.yml");

    expect(compose).toContain("CPFONT_TOOL_COMMIT:");
    expect(dev).toContain("worker/src/**/*.ts");
  });

  it("defines CI for tests, build, Docker image, and capability smoke", () => {
    const workflow = read(".github/workflows/ci.yml");

    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("docker build");
    expect(workflow).toContain("/api/capabilities");
    expect(workflow).toContain('"available":true');
  });
});
