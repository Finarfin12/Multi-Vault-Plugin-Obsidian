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
  - **Writing files**: The plugin never silently edits notes in your other vaults. Writes only happen (a) inside the active vault via the Obsidian Vault API when you use "Copy to Current Vault & Edit", or (b) when you explicitly confirm a Move/Copy operation to another vault.
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
Write `[[VaultName::NoteTitle]]` in any note. In Reading View the plugin rewrites these references into clickable links that instantly open the cross-vault note in the read-only preview (right-click opens the source vault). Alias (`[[Vault::Note|text]]`), heading, and path forms are supported. Click-through in Live Preview is not yet supported.

### 4. Recent Files & Quick Switch
- **Recent Files**: See the 50 most recently modified files across *all* your vaults.
- **Switch Vault**: Instantly launch your other vaults without going through the native Obsidian Vault Manager.

### 5. Smart Inbox Router (Move/Copy)
Easily move or copy a note from your current vault to another vault. The plugin includes a Smart Inbox Router that suggests the most relevant destination vault based on the tags present in your note.

### 6. Duplicate Note Detector
Scan all your connected vaults to find notes with the exact same name, helping you merge scattered information. Each duplicate group now includes a **Compare** view with a line-by-line diff.

---

## Commands

Open the **Command Palette** (Ctrl/Cmd + P) and type `Multi-Vault Navigator` to see available commands:
- **Open search page** (Cross-Vault Command Center)
- **Search all vaults**
- **Recent files**
- **Switch vault**
- **Move/copy current file to vault**
- **Copy cross-vault link for current file**
- **Find duplicate notes across vaults**
- **Open global tag explorer**
- **Open cross-vault daily notes**
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
