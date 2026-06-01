#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import open from "open";
import {
  createServer,
  loadProjectContext,
  ContextError,
  type ProjectContext,
} from "../index.js";

const USAGE = "usage: ledger <project-path> [--port N] [--no-open] [-h|--help]\n";

interface ParsedArgs {
  projectPath: string;
  port: number;
  open: boolean;
  help: boolean;
}

function parseCliArgs(argv: string[]): ParsedArgs {
  let positionals!: string[];
  let values!: { port: string; "no-open": boolean; help: boolean };
  try {
    ({ positionals, values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        port: { type: "string", default: process.env["LEDGER_PORT"] ?? "4180" },
        "no-open": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    process.stderr.write(`ledger: ${(e as Error).message}\n${USAGE}`);
    process.exit(2);
  }

  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (positionals.length !== 1) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  // After the length guard, positionals[0] is provably defined.
  // With noUncheckedIndexedAccess, TypeScript still sees `string | undefined`;
  // the non-null assertion is safe and matches the project's house idiom
  // (see leaf-workflow's "trust local invariants" pattern).
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const projectPath = positionals[0]!;

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(
      `ledger: invalid --port "${values.port}" (expected integer 0..65535)\n`
    );
    process.exit(2);
  }

  return {
    projectPath,
    port,
    open: !values["no-open"],
    help: false,
  };
}

function formatContextError(e: ContextError): string {
  const lines = [`ledger: ${e.message}`];
  for (const err of e.errors) {
    lines.push(`  ${err.path}: ${err.message}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  let project: ProjectContext;
  try {
    project = await loadProjectContext({
      projectPath: args.projectPath,
      port: args.port,
    });
  } catch (e) {
    if (e instanceof ContextError) {
      process.stderr.write(formatContextError(e));
      process.exit(1);
    }
    throw e;
  }

  const app = createServer(project);

  await new Promise<void>((resolve) => {
    const server = serve(
      { fetch: app.fetch, port: args.port, hostname: "127.0.0.1" },
      (info: AddressInfo) => {
        const boundPort = info.port;
        const url = `http://localhost:${boundPort.toString()}/`;
        process.stdout.write(`ledger: ${project.project.name} on ${url}\n`);

        if (args.open) {
          open(url).catch((err: unknown) => {
            process.stderr.write(
              `ledger: could not open browser (${(err as Error).message}); ${url} is ready\n`
            );
          });
        }

        // Graceful shutdown.
        const shutdown = () => {
          process.stdout.write("ledger: shutting down\n");
          project.daemon.stop();
          server.close(() => process.exit(0));
          // Force-exit if drain takes longer than 5s.
          setTimeout(() => process.exit(1), 5000).unref();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        resolve();
      }
    );
  });
}

main().catch((e: unknown) => {
  process.stderr.write(`ledger: unexpected error: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
