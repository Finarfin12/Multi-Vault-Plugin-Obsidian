// Performance run on a synthetic fixture. Usage:
//   node scripts/gen-fixture-vault.mjs <dir> 5000
//   node scripts/bench.mjs <dir>
// Prints a JSON report (cold build, refresh, search latency, warm start, watcher latency, UI lag).
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const fixture = process.argv[2];
if (!fixture) {
	console.error("Usage: node scripts/bench.mjs <fixtureDir>");
	process.exit(1);
}

const outDir = path.join(root, ".test-build");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "bench.cjs");

await esbuild.build({
	entryPoints: [path.join(root, "scripts", "bench-entry.ts")],
	outfile: out,
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node20",
	logLevel: "warning",
	alias: { obsidian: path.join(root, "tests", "stubs", "obsidian.ts") },
});

const result = spawnSync(process.execPath, ["--expose-gc", out, path.resolve(fixture)], { stdio: "inherit" });
process.exit(result.status ?? 1);
