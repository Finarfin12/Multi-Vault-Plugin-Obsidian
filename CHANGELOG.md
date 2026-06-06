# Changelog

All notable changes to the **Multi-Vault Navigator** plugin will be documented in this file.

## [2.1.0] - 2026-06-06 (Feature V0.2 & Security Audit)
### Added
- **Tag Filter**: Type `#tag` directly inside the Command Center search bar to filter results exclusively by metadata/inline tags.
- **Better Snippets (Google-style)**: Search results now dynamically extract and center the text snippet precisely around your keyword, complete with yellow `<mark>` highlighting.
- **Tag Pills**: Note tags are now beautifully rendered as pill elements below each search result snippet.
- **Privacy Controls**: Added `Store Snippets in Cache` toggle to the settings, allowing high-privacy vaults to scrub sensitive content from the search cache file.

### Changed
- **Rate Limiting**: Added a 15-second cooldown to the `Refresh Index` button to prevent accidental UI freezing and I/O spikes.
- **UI Refresh**: Centered the Command Center layout (`max-width: 800px`) and refined the Quick Action buttons to look more minimalist and less overwhelming on large screens.

### Fixed
- **Path Traversal Mitigation**: Implemented strict boundaries when resolving local `app://` image URIs, blocking malicious `../` requests from escaping the vault root.
- **Type Safety**: Removed dangerous type casts on Obsidian's internal `adapter.getBasePath()` to prevent future breaking changes.

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
