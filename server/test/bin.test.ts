import { describe, expect, it, beforeAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const binPath = resolve(serverRoot, "dist/bin/ledger.js");
const fixturePath = resolve(serverRoot, "__fixtures__/sample-project");
const invalidMetadataPath = resolve(serverRoot, "__fixtures__/invalid-metadata-project");

beforeAll(() => {
  const build = spawnSync("pnpm", ["-C", serverRoot, "build"], { stdio: "inherit" });
  if (build.status !== 0) throw new Error("server build failed");
});

function runSync(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [binPath, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("ledger CLI", () => {
  it("prints usage on --help and exits 0", () => {
    const r = runSync(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/usage: ledger/);
  });

  it("exits 2 with usage on bare invocation", () => {
    const r = runSync([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: ledger/);
  });

  it("exits 1 with formatted ContextError on nonexistent path", () => {
    const r = runSync(["/definitely/does/not/exist"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/missing.*project\.json/i);
  });

  it("exits 1 with ValidationError list on bad metadata", () => {
    const r = runSync([invalidMetadataPath]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/invalid project metadata/i);
  });

  it("exits 2 with port-error on invalid --port", () => {
    const r = runSync([fixturePath, "--port", "notanumber"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/invalid --port/);
  });

  it("exits 2 with port-error on out-of-range --port", () => {
    const r = runSync([fixturePath, "--port", "99999"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/0\.\.65535/);
  });

  it("exits 2 on unknown flag", () => {
    const r = runSync([fixturePath, "--unknown-flag"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: ledger/);
  });

  it("boots the server with --no-open and serves /api/_health", async () => {
    const proc = spawn(process.execPath, [binPath, fixturePath, "--port", "0", "--no-open"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise<number>((res, rej) => {
        const timer = setTimeout(() => { rej(new Error("boot timeout")); }, 5000);
        proc.stdout.on("data", (chunk: Buffer) => {
          const m = /:(\d+)\//.exec(chunk.toString());
          if (m) {
            clearTimeout(timer);
            res(Number(m[1]));
          }
        });
        proc.on("exit", (code) => {
          clearTimeout(timer);
          rej(new Error(`process exited with code ${String(code)} before boot`));
        });
      });
      const res = await fetch(`http://127.0.0.1:${port.toString()}/api/_health`);
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    } finally {
      proc.kill("SIGINT");
      await new Promise<void>((res) => { proc.on("exit", () => { res(); }); });
    }
  });

  it("respects LEDGER_PORT env var when --port absent", async () => {
    const proc = spawn(process.execPath, [binPath, fixturePath, "--no-open"], {
      env: { ...process.env, LEDGER_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise<number>((res, rej) => {
        const timer = setTimeout(() => { rej(new Error("boot timeout")); }, 5000);
        proc.stdout.on("data", (chunk: Buffer) => {
          const m = /:(\d+)\//.exec(chunk.toString());
          if (m) {
            clearTimeout(timer);
            res(Number(m[1]));
          }
        });
        proc.on("exit", (code) => {
          clearTimeout(timer);
          rej(new Error(`process exited with code ${String(code)} before boot`));
        });
      });
      expect(port).toBeGreaterThan(0);
    } finally {
      proc.kill("SIGINT");
      await new Promise<void>((res) => { proc.on("exit", () => { res(); }); });
    }
  });
});
