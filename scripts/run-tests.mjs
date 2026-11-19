// Test runner: bundles tests/*.test.ts with esbuild (obsidian aliased to a stub)
// and runs them with the built-in `node --test`. No extra dependencies.
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const outDir = path.join(root, ".test-build");
fs.rmSync(outDir, { recursive: true, force: true });

const entries = fs
	.readdirSync(path.join(root, "tests"))
	.filter((f) => f.endsWith(".test.ts"))
	.map((f) => path.join(root, "tests", f));

if (entries.length === 0) {
	console.error("No tests found in tests/*.test.ts");
	process.exit(1);
}

await esbuild.build({
	entryPoints: entries,
	outdir: outDir,
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node20",
	logLevel: "warning",
	alias: { obsidian: path.join(root, "tests", "stubs", "obsidian.ts") },
	outExtension: { ".js": ".cjs" },
});

const built = fs.readdirSync(outDir).filter((f) => f.endsWith(".cjs")).map((f) => path.join(outDir, f));
const result = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit" });
process.exit(result.status ?? 1);
