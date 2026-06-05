# Changelog

All notable changes to the **Multi-Vault Navigator** plugin will be documented in this file.

## [2.0.1] - 2026-06-05 (Stabilize Patch)
### Added
- Native Right Sidebar support for **Pinned Notes** & **Saved Searches**.
- Dedicated Ribbon Icon to quickly open the Multi-Vault Sidebar.
- Smooth CSS hover transitions for buttons, tags, and result items.
- Elegant empty states for the Command Center.

### Changed
- **Read-Only Mode Polish**: Refactored `ExternalFileView` to completely mimic Obsidian's native Reading View aesthetics (inline title, hidden bulky header, action buttons cleanly moved to the native view header).
- **Performance Overhaul**: Refactored `Indexer`, `FileScanner`, and `MarkdownParser` to be fully asynchronous (using `fs.promises`). The UI will no longer freeze or stutter when indexing massive vaults.

### Fixed
- Handled `ENOENT` gracefully when a folder or vault goes missing from the file system.
- Fixed an issue where the "Save Search" prompt was blocked by Electron's strict mode by implementing a native Obsidian `PromptModal`.

## [2.0.0] - 2026-06-05 (Pro Update)
### Added
- **Cross-Vault Command Center**: Centralized full-screen dashboard to search across all vaults and access quick actions.
- **Natural Cross-Vault Links**: Support for `[[VaultName::NoteTitle]]` syntax rendering as native internal links.
- **Smart Inbox Router**: Suggests the most relevant vault based on tags when moving/copying files.
- **Duplicate Note Detector**: New command to find duplicate note names across all connected vaults.
- **Enhanced External Preview**: Read-Only mode with "Open in Source Vault" and "Copy Link" buttons.
- **Saved Searches** and **Pinned Notes** functionalities.

## [1.0.0] - Initial Release
- Basic Vault Registry and File Scanner.
- Global Search modal using MiniSearch.
- Basic External File View.
- Tag Explorer and Recent Files.
