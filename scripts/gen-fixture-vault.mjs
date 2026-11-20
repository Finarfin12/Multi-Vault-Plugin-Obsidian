// Generates a synthetic 3-vault fixture (A/B/C, 5,000 notes total) for performance runs.
// Not shipped in the release. Usage: node scripts/gen-fixture-vault.mjs <outDir> [totalNotes]
//
// Features (see Test Plan "Fixture"): 10 notes > 50 KB, duplicate names across vaults,
// nested tags, [[Vault::Note]] links, folders smart/, Private/, Article/, and one unique
// word at about character 5,000 of a note (the T1 probe).
import fs from "fs";
import path from "path";

const outDir = process.argv[2];
const total = Number(process.argv[3] || 5000);
if (!outDir) {
	console.error("Usage: node scripts/gen-fixture-vault.mjs <outDir> [totalNotes]");
	process.exit(1);
}

// Deterministic PRNG so every run produces the same corpus
let seed = 123456789;
const rnd = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const syll = ["ka", "to", "mi", "ra", "su", "ne", "lo", "pa", "vi", "du", "re", "xo", "qua", "len", "tor", "mar", "bel", "cin", "dro", "fen"];
const vocab = Array.from({ length: 3000 }, () => {
	const n = 2 + Math.floor(rnd() * 3);
	let w = "";
	for (let i = 0; i < n; i++) w += pick(syll);
	return w;
});
const sentence = (words) => Array.from({ length: words }, () => pick(vocab)).join(" ");
const paragraph = (chars) => {
	let s = "";
	while (s.length < chars) s += sentence(12) + ". ";
	return s.slice(0, chars);
};

const vaults = ["A", "B", "C"];
const folders = ["projects", "journal", "ideas", "reference", "smart", "Private", "Article", "inbox/2024", "inbox/2025"];
const tagPool = ["project/alpha", "project/beta", "idea", "idea/draft", "reading", "art", "smart", "journal/daily"];
const sharedNames = ["Meeting Notes", "Reading List", "Ideas", "Todo", "Summary", "Roadmap", "Index", "Glossary"];

fs.rmSync(outDir, { recursive: true, force: true });
const perVault = Math.floor(total / vaults.length);
let created = 0;
let bigLeft = 10;

vaults.forEach((v, vi) => {
	const root = path.join(outDir, v);
	fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
	fs.writeFileSync(path.join(root, ".obsidian", "app.json"), "{}");
	const count = vi === vaults.length - 1 ? total - perVault * (vaults.length - 1) : perVault;
	for (let i = 0; i < count; i++) {
		const folder = pick(folders);
		const shared = i < sharedNames.length * 3 && i % 3 === vi;
		const name = shared ? sharedNames[i % sharedNames.length] : `${pick(vocab)}-${pick(vocab)}-${i}`;
		const tags = [pick(tagPool), pick(tagPool)];
		const other = vaults[(vi + 1) % vaults.length];
		let body = `# ${name}\n\n${paragraph(400 + Math.floor(rnd() * 1800))}\n\n## Links\n[[${other}::${pick(sharedNames)}]] and [[${pick(vocab)}]]\n\n${tags.map((t) => "#" + t).join(" ")}\n\n${paragraph(300 + Math.floor(rnd() * 1200))}\n`;
		// 10 big notes (> 50 KB) in total
		if (bigLeft > 0 && i % 500 === 7) {
			body += "\n" + paragraph(60000 + Math.floor(rnd() * 40000));
			bigLeft--;
		}
		// The T1 probe: unique word at about character 5,000 of one note in vault B
		if (v === "B" && i === 42) {
			body = `# Probe\n\n${paragraph(4980)} quasarfixtureword ${paragraph(300)}\n`;
		}
		const front = `---\ntitle: ${name}\ntags: [${tags.join(", ")}]\n---\n`;
		const rel = path.join(root, folder, `${name}.md`);
		fs.mkdirSync(path.dirname(rel), { recursive: true });
		// duplicate shared names land in the same folder name only once per vault
		if (!fs.existsSync(rel)) {
			fs.writeFileSync(rel, front + body);
			created++;
		}
	}
});

// Top-up in case duplicate names collided
let topup = 0;
while (created < total) {
	const v = vaults[topup % 3];
	const rel = path.join(outDir, v, "inbox/2025", `topup-${topup}.md`);
	fs.mkdirSync(path.dirname(rel), { recursive: true });
	fs.writeFileSync(rel, `# topup ${topup}\n\n${paragraph(800)}\n`);
	created++;
	topup++;
}

console.log(`Fixture written to ${outDir}: ${created} notes in ${vaults.length} vaults`);
