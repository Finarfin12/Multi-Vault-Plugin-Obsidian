# Changelog

All notable changes to the **Multi-Vault Navigator** plugin will be documented in this file.

## [2.4.0] - 2026-09-07
### Fixed
- `[[Vault::Note]]` cross-vault links now open the target note in Reading View.
  Obsidian core parses these into unresolved anchors before postprocessors run,
  so the plugin now rewrites those anchors instead of scanning raw text (which
  never matched). Supports alias (`|...`), heading (`#...`), and path forms;
  right-click opens the source vault.
### Known limitation
- Click-through in Live Preview is not yet supported.

## [2.3.2] - 2026-09-07
### Fixed
- Review-bot code reading warnings via minimal ambient Node.js type
  declarations (`src/node-types.d.ts`). No functional changes.

## [2.3.1] - 2026-09-06
### Changed
- **Review scorecard compliance**: All user-facing strings now use sentence case
  per the `obsidianmd/ui/sentence-case` guideline (command names, buttons,
  placeholders, view titles). No functional changes.

## [2.3.0] - 2026-09-06
### Added
- **Cross-Vault Backlinks**: External file view now shows a "Backlinks" section listing notes across all vaults that link to the open note (supports `[[Note]]`, `[[Note|alias]]`, `[[Note#heading]]`, and `[[Vault::Note]]`). Link targets are extracted at index time into a new `outgoingLinks` field.
- **Copy to Current Vault & Edit**: New action in the external file view that copies the read-only note into the active vault via the Vault API and opens it for editing. The source vault is never modified.
- **Duplicate Compare/Diff**: Duplicate Detector groups now include file selectors plus a Compare button rendering a local line-by-line diff (identical-file detection, 400-line cap for performance).

### Changed
- **Disclosure**: README now documents that backlink/duplicate features read other vaults locally, and that writes only target the active vault (Vault API) or explicit Move/Copy confirmations.

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
