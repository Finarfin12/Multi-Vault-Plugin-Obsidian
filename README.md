# Multi-Vault Navigator

<img width="1920" height="1140" alt="Screenshot 2026-06-06 092829" src="https://github.com/user-attachments/assets/cf9b2071-9aa0-4f73-9107-07e2e20ddb42" />

**Multi-Vault Navigator** is a local-first Obsidian plugin designed to bridge the gap between multiple vaults. If you use multiple vaults (e.g., work vault, personal vault, and writing vault), this plugin allows you to search, view, and switch between vaults as if they were all in one unified workspace.

[Baca dalam Bahasa Indonesia](README_id.md)

---

## Obsidian Policies Disclosure

To comply with the [Obsidian Developer Policies](https://docs.obsidian.md/Plugins/Releasing/Developer+policies), please review the following disclosures regarding this plugin:

- **Accessing files outside of Obsidian vaults**: This plugin requires accessing files outside of the currently active Obsidian vault. 
  - **Why this is needed**: This plugin's core feature is searching and previewing notes from your *other* Obsidian vaults. To achieve this, it uses Node's native `fs` module to read the markdown contents of vaults you have configured or that were automatically detected from your OS's global Obsidian configuration (`obsidian.json`). 
  - **Privacy**: All operations are 100% local. No files, metadata, or telemetry are ever sent over the internet or uploaded to any server.

---

## Key Features

<img width="1920" height="1140" alt="Screenshot 2026-06-06 092905" src="https://github.com/user-attachments/assets/45b9cbfe-ea17-4478-bf35-847c16deffbf" />

### 1. Cross-Vault Command Center
Instead of remembering which vault a note is saved in, use the Command Center dashboard.
- Full-screen dashboard resembling a modern search engine.
- Displays notes across all your vaults with intelligent fuzzy search and snippet previews.
- Pin your favorite cross-vault notes and save frequent searches directly to the sidebar.

### 2. Read-Only Cross-Vault View
Natively, Obsidian does not allow you to open a note from outside the active vault in a tab. This plugin solves that safely:
- When clicking a search result from another vault, the note opens in a **new tab** within your current vault.
- The note is displayed in a native-feeling **Read-Only Mode** with full markdown rendering.
- Includes actions to quickly "Open in Source Vault" or "Copy Cross-Vault Link."

### 3. Natural Cross-Vault Links
Write `[[VaultName::NoteTitle]]` in any note. The plugin parses these references and allows you to click them to instantly open the cross-vault note in the read-only preview.

### 4. Recent Files & Quick Switch
- **Recent Files**: See the 50 most recently modified files across *all* your vaults.
- **Switch Vault**: Instantly launch your other vaults without going through the native Obsidian Vault Manager.

### 5. Smart Inbox Router (Move/Copy)
Easily move or copy a note from your current vault to another vault. The plugin includes a Smart Inbox Router that suggests the most relevant destination vault based on the tags present in your note.

### 6. Duplicate Note Detector
Scan all your connected vaults to find notes with the exact same name, helping you merge scattered information.

---

## Commands

Open the **Command Palette** (Ctrl/Cmd + P) and type `Multi-Vault Navigator` to see available commands:
- **Cross-Vault Command Center (Search Page)**
- **Search All Vaults**
- **Recent Files**
- **Switch Vault**
- **Move/Copy Current File to Vault**
- **Copy Cross-Vault Link for Current File**
- **Find Duplicate Notes**
- **Open Global Tag Explorer**
- **Open Cross-Vault Daily Notes**
- **Refresh Index**

---

## Settings

Go to **Settings > Multi-Vault Navigator** to configure:
- **Vault List**: Toggle indexing for specific vaults or remove them.
- **Add Manual Vault**: Add an absolute path to a vault if it wasn't auto-detected.
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
