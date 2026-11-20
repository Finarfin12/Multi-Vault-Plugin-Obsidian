# Multi-Vault Navigator


**Multi-Vault Navigator** is a local-first Obsidian plugin designed to bridge the gap between multiple vaults. If you use multiple vaults (e.g., work vault, personal vault, and writing vault), this plugin allows you to search, view, and switch between vaults as if they were all in one unified workspace.

[Baca dalam Bahasa Indonesia](README_id.md)

---

## Obsidian Policies Disclosure

To comply with the [Obsidian Developer Policies](https://docs.obsidian.md/Plugins/Releasing/Developer+policies), please review the following disclosures regarding this plugin:

- **Accessing files outside of Obsidian vaults**: This plugin requires accessing files outside of the currently active Obsidian vault. 
  - **Why this is needed**: This plugin's core feature is searching and previewing notes from your *other* Obsidian vaults. To achieve this, it uses Node's native `fs` module to read the markdown contents of vaults you have configured or that were automatically detected from your OS's global Obsidian configuration (`obsidian.json`). Backlink detection and duplicate comparison also read those files locally to match `[[wikilinks]]`.
  - **Watching folders (2.4.0)**: To keep search current, the plugin watches your enabled vault folders for changes with Node's `fs.watch` (read-only; it only notices that a file changed and then re-reads that file). You can turn this off in settings; the plugin then re-checks only when you refresh.
  - **What is stored on disk (2.4.0)**: The search index, built from the full text of your notes, is saved in `.obsidian/plugins/multi-vault-navigator/index-cache.json` of the *active* vault so search is ready right after Obsidian starts. If you sync or publish that config folder, turn off **Store snippets in cache**: nothing from your notes is then written to the cache, and the index is rebuilt at every start instead.
  - **Writing files**: The plugin never silently edits notes in your other vaults. Writes only happen (a) inside the active vault via the Obsidian Vault API when you use "Copy to Current Vault & Edit" or "Insert summary into active note" (2.5.0), or (b) when you explicitly confirm a Move/Copy operation to another vault.
  - **Privacy**: All operations are 100% local. No files, metadata, or telemetry are ever sent over the internet or uploaded to any server.

---

## Key Features


### 1. Cross-Vault Command Center
Instead of remembering which vault a note is saved in, use the Command Center dashboard.
- Full-screen dashboard resembling a modern search engine.
- Displays notes across all your vaults with intelligent fuzzy search, vault-specific colors/icons, and snippet previews.
- Filter results by specific vaults or sort by Relevance, Newest, Oldest, or Vault Name.
- Pin your favorite cross-vault notes and save frequent searches directly to the sidebar.

### Full-text search and a live index (2.4.0)
- **Search the whole note, not just the title.** Any word in any note is found, and each result shows an excerpt cut around the part that matched (up to `Max indexed size per note`, default 200 KB, so one huge file cannot slow things down).
- **Incremental index.** A refresh only re-reads notes that changed (by modification time and size). Unchanged files are not parsed again, so refreshing ~5,000 notes takes well under a second.
- **Live updates.** With **Watch vaults for changes** on, edits, new files and deletions made in any enabled vault — even outside Obsidian — show up in search within a few seconds. Where the system cannot watch a folder, the plugin re-checks once a minute instead.
- **Fast start.** The search index is cached (format v3), so search works right after startup. An older cache is discarded and rebuilt automatically.
- **Exclude patterns match whole names.** See [Settings](#settings); this fixes `art` also hiding `smart/` and `Article/`.

### 2. Read-Only Cross-Vault View
Natively, Obsidian does not allow you to open a note from outside the active vault in a tab. This plugin solves that safely:
- When clicking a search result from another vault, the note opens in a **new tab** within your current vault.
- The note is displayed in a native-feeling **Read-Only Mode** with full markdown rendering.
- Includes actions to quickly "Open in Source Vault", "Copy Cross-Vault Link", or "Copy to Current Vault & Edit" (copies into the active vault via the Vault API — the source vault is never modified).
- Each preview now shows a **Backlinks** section listing cross-vault notes that link to it.

### 3. Natural Cross-Vault Links
Write `[[VaultName::NoteTitle]]` in any note. In Reading View the plugin rewrites these references into clickable links that instantly open the cross-vault note in the read-only preview (right-click opens the source vault). Alias (`[[Vault::Note|text]]`), heading, and path forms are supported.

Since 2.5.0 this works everywhere you write:
- **Live Preview and Source mode** — `[[Vault::Note]]` is shown as a link (links to notes that are not in the index look "unresolved"). A click opens the note read-only (in the current tab for notes of this vault, in the read-only view for other vaults), **Ctrl/Cmd+click** opens a new tab, right-click opens the note in its own vault. While the cursor is inside the raw `[[...]]` text a click just edits it, and in Source mode only Ctrl/Cmd+click opens. Links inside code are left alone.
- **Autocomplete** — type `[[Work::` (a registered vault name and `::`) to get that vault's notes (fuzzy, at most 20); add `#` after a note for its headings. Plain `[[` suggestions stay Obsidian's own.
- **Embeds** — `![[Vault::Note]]` and `![[Vault::Note#Heading]]` show the note (or just that heading's section) read-only in Reading View and Live Preview, with an **Open** button. Embeds nested inside embeds go at most 2 levels deep, so two notes embedding each other cannot loop. In Live Preview an embed is shown as a block when it is alone on its line and the cursor is elsewhere.

### 4. Recent Files & Quick Switch
- **Recent Files**: See the 50 most recently modified files across *all* your vaults.
- **Switch Vault**: Instantly launch your other vaults without going through the native Obsidian Vault Manager.

### 5. Smart Inbox Router (Move/Copy)
Easily move or copy a note from your current vault to another vault. The plugin includes a Smart Inbox Router that suggests the most relevant destination vault based on the tags present in your note.

### 6. Duplicate Note Detector
Scan all your connected vaults to find notes with the exact same name, helping you merge scattered information. Each duplicate group now includes a **Compare** view with a line-by-line diff.

Since 2.5.0 there is a second mode, **Similar content**: it finds notes whose text is mostly the same even when their names differ (default minimum similarity 80%, adjustable from 50%). It compares 5-word shingles with MinHash and verifies every candidate pair exactly, shows the similarity as a percentage, runs in small steps so Obsidian stays responsive (with a **Stop** button), skips notes under 8 words, and compares at most 20,000 notes. Nothing is changed or sent anywhere.

### 7. Search operators (2.5.0)
Type operators in the Command Center or the "Search all vaults" popup (a help list is shown in the Command Center while the box is empty):

| Operator | Meaning |
|---|---|
| `vault:Work` | only that vault (`vault:"My Vault"` for names with spaces; several `vault:` mean any of them) |
| `path:projects` | the path contains that text (several `path:` must all match) |
| `tag:idea` or `#idea` | has the tag, nested tags included (`#project` matches `#project/alpha`) |
| `-tag:draft`, `-vault:Old`, `-path:tmp` | leave those out |
| `-word`, `-"a phrase"` | leave out notes that contain it |
| `modified:>7d` | changed in the last 7 days (units `h d w m y`; `m` = 30 days) |
| `modified:<2026-01-01` | last changed before that date (`>`, `>=`, `<=` or a plain date = that day) |
| `"exact phrase"` | the words in exactly that order |

Operators combine, for example `meeting vault:Work tag:project -tag:draft modified:>30d`. Filters alone (no words) list the matching notes, newest first. Anything not understood is ignored and reported above the results. Saved searches now keep the whole query, operators included.

### 8. Cross-vault map (2.5.0)
**Open cross-vault map** draws your vaults as circles (size = number of notes) with arrows that count the `[[Vault::Note]]` links from one vault to another. Click an arrow to list the notes that make the connection and open them. Links inside one vault, or to vaults that are not indexed, are not drawn. The first start after updating re-reads every note once to collect these links.

### 9. Change summary (2.5.0)
**Open cross-vault daily notes** now starts with **What changed**: pick *Today*, *Last 7 days* or a *Custom range* and see the notes created or edited, grouped per vault, with an estimate of the words added. Created notes count all their words; for an edited note the estimate is its growth since the last version the plugin saw before the period (so it is only available once the plugin has seen the note before, and totals may say "or more"). **Insert summary into active note** writes the summary into the note that is open in the *current* vault through the Obsidian Vault API; inserting again replaces the earlier summary instead of adding another. Nothing is ever written to another vault.

---

## Commands

Open the **Command Palette** (Ctrl/Cmd + P) and type `Multi-Vault Navigator` to see available commands:
- **Open search page** (Cross-Vault Command Center)
- **Search all vaults**
- **Recent files**
- **Switch vault**
- **Move/copy current file to vault**
- **Copy cross-vault link for current file**
- **Find duplicate notes across vaults** (same name or similar content)
- **Open global tag explorer**
- **Open cross-vault map**
- **Open cross-vault daily notes** (with the change summary)
- **Refresh index**
- **Clear cross-vault index**

---

## Settings

Go to **Settings > Multi-Vault Navigator** to configure:
- **Vault List**: Toggle indexing for specific vaults, configure custom colors and icons, or remove them.
- **Add Manual Vault**: Add an absolute path to a vault if it wasn't auto-detected.
- **Appearance**: Choose between "Classic" and "Modern Card" layouts for search results.
- **Refresh & Clear Index**: Manually rebuild or wipe the cross-vault index cache.
- **Max Preview Characters**: Length of text snippets saved for search indexing.
- **Full-text search** (default on): Search the whole text of every note. Changing it re-reads all notes.
- **Max indexed size per note (bytes)** (default 200000, minimum 1000): Only the first part of a very large note is searched.
- **Watch vaults for changes** (default on): Update search automatically when notes change in any enabled vault.
- **Store Snippets in Cache** (default on): Also stores the search index built from your notes. Turn it off if the active vault's config folder is shared or published; the index is then rebuilt at every start.
- **Global Exclude Patterns**: Comma-separated list of patterns to ignore across all vaults. A pattern is matched against whole folder/file names, not parts of them:
  - `Private` excludes any folder or note named `Private` (any depth, any letter case), but not `Privateer/`.
  - `notes/archive` excludes that folder path wherever it appears.
  - `draft-*` and `**/draft-*` use globs: `*` = any characters within one name, `?` = one character, `**` = across folders.
  - **Changed in 2.4.0:** patterns used to match any part of a path (`art` also excluded `smart/` and `Article/`). If you relied on that, write the pattern as a glob, e.g. `*art*`.

---

## Development

- `npm test` runs the automated tests (Node's built-in test runner, no extra dependencies).
- `npm run lint` and `npm run build` must finish without errors. Set `MVN_SKIP_COPY=1` to build without copying the files into the author's local test vault.
- `node scripts/gen-fixture-vault.mjs <dir> 5000` creates a synthetic 3-vault fixture and `node scripts/bench.mjs <dir>` prints performance numbers (not part of the release).

---

## Installation

*(Currently manual installation only)*

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`).
2. Create a folder in your vault: `<your-vault-path>/.obsidian/plugins/multi-vault-navigator/`.
3. Paste the three files into the folder.
4. Go to **Settings > Community plugins** in Obsidian.
5. Disable **Safe mode**.
6. **Enable** the Multi-Vault Navigator plugin.

---

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
