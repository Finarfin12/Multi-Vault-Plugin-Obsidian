# Multi-Vault Navigator


**Multi-Vault Navigator** is a local-first Obsidian plugin designed to bridge the gap between multiple vaults. If you use multiple vaults (e.g., work vault, personal vault, and writing vault), this plugin allows you to search, view, and switch between vaults as if they were all in one unified workspace.

[Baca dalam Bahasa Indonesia](README_id.md)

---

## Obsidian Policies Disclosure

To comply with the [Obsidian Developer Policies](https://docs.obsidian.md/Plugins/Releasing/Developer+policies), please review the following disclosures regarding this plugin:

- **Accessing files outside of Obsidian vaults**: This plugin requires accessing files outside of the currently active Obsidian vault. 
  - **Why this is needed**: This plugin's core feature is searching and previewing notes from your *other* Obsidian vaults. To achieve this, it uses Node's native `fs` module to read the markdown contents of vaults you have configured or that were automatically detected from your OS's global Obsidian configuration (`obsidian.json`). Backlink detection and duplicate comparison also read those files locally to match `[[wikilinks]]`.
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

### 2. Read-Only Cross-Vault View
Natively, Obsidian does not allow you to open a note from outside the active vault in a tab. This plugin solves that safely:
- When clicking a search result from another vault, the note opens in a **new tab** within your current vault.
- The note is displayed in a native-feeling **Read-Only Mode** with full markdown rendering.
- Includes actions to quickly "Open in Source Vault", "Copy Cross-Vault Link", or "Copy to Current Vault & Edit" (copies into the active vault via the Vault API — the source vault is never modified).
- Each preview now shows a **Backlinks** section listing cross-vault notes that link to it.

### 3. Natural Cross-Vault Links
Write `[[VaultName::NoteTitle]]` in any note. The plugin parses these references and allows you to click them to instantly open the cross-vault note in the read-only preview.

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
- **Global Exclude Patterns**: Comma-separated list of folder/file names to ignore across all vaults (e.g., `Private, secrets`).

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
