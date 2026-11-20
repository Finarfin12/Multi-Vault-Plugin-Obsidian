# Changelog

All notable changes to the **Multi-Vault Navigator** plugin will be documented in this file.

## [2.4.0] - 2026-11-20 — "Foundation"
First phase of the 2.4 → 2.7 roadmap: a faster, always-current, full-text index.

### Added
- **Full-text search with excerpts (F1)**: the whole note text is indexed (not only title, tags and the first lines). Results show an excerpt cut around the matched word, read from the note on demand (the note text itself is never stored in the cache). New settings **Full-text search** (default on) and **Max indexed size per note** (default 200,000 bytes).
- **Incremental index (F2)**: a refresh diffs the disk against the index by modification time and size and re-reads only new or changed notes; vanished files are dropped. Search is updated per change instead of being rebuilt.
- **Vault watcher (F2)**: enabled vaults are watched (`fs.watch`, recursive) and changes reach search within a few seconds, including edits made outside Obsidian. Falls back to a once-a-minute check where watching is not possible. Stops when a vault is disabled or removed, when the setting **Watch vaults for changes** is turned off, and when the plugin unloads.
- **Automated tests (F6)**: `npm test` (Node's built-in runner, no new dependency) with 71 tests, including characterization tests of the 2.3.4 behaviour. `scripts/gen-fixture-vault.mjs` and `scripts/bench.mjs` build a 5,000-note fixture and measure performance (not shipped).

### Changed
- **Cache format v3 (F3)**: the search index is saved with the file list, so search is ready right after startup. A v2 (or damaged) cache is discarded and rebuilt automatically, with no error. With **Store Snippets in Cache** off, neither previews nor the search index are written to disk and the index is rebuilt at every start.
- **Async file reads (F4)**: the read-only view, the duplicate comparison, vault detection and the Move/Copy existence check no longer block Obsidian while reading files. Vault registration (`VaultRegistry.initialize`, `addVault`, `validateVaultPath`) is now asynchronous.
- **`obsidian` types pinned (F6)**: `devDependencies.obsidian` is `1.13.0` instead of `latest`, so builds are reproducible.
- Building with `MVN_SKIP_COPY=1` skips copying the files into the author's local test vault.

### Behavior change: exclude patterns (F5)
Exclude patterns (global and per vault) used to match **any part** of a path, case-insensitively, so `art` also hid `smart/` and `Article/`. They now match **whole folder/file names** (case-insensitive, any depth) and support globs:
- `Private` → any folder or note named `Private`; not `Privateer/`. A bare name also matches `Name.md`.
- `notes/archive` → that folder path anywhere; `draft-*` → any name starting with `draft-`; `**/draft-*` → matched against the whole path (`*` within one name, `?` one character, `**` across folders).
- If you relied on the old substring behaviour, write the pattern as a glob such as `*art*`. Include patterns are unchanged (still substring).
- Newly excluded notes disappear from the index on the next refresh; no manual rebuild is needed.

### Not verified yet
- Manual checks inside Obsidian (Command Center excerpts, settings screen, restart behaviour, mobile is not supported) were not run for this release; see the release report.

## [2.3.4] - 2026-10-30
### Fixed
- **Cross-vault links between vaults**: The active vault is now registered under
  Obsidian's own vault id, and "Copy cross-vault link" also includes the vault
  name, so `obsidian://mvn-open` links resolve when clicked from another vault.
- **Index settings apply immediately**: Changes to exclude patterns and max
  preview characters take effect on the next rebuild instead of after a restart.
- **Removed vaults stay removed**: Auto-detect no longer re-adds a vault you
  removed in settings. Adding it manually again lifts the removal.
- **Search stays in sync with the index**: Search results and the sidebar now
  refresh after every index change (Move/Copy, Clear index, settings). Enabling,
  disabling, adding, or removing a vault triggers a re-index, and a rebuild
  requested while one is running is queued instead of dropped.
- **External file tabs survive restart**: Read-only cross-vault tabs now save
  their file and reopen with content after Obsidian restarts.
- **Tag matching**: `#art` no longer matches `#smart`; a tag matches itself and
  its nested children (`#project` matches `#project/alpha`). Nested and unicode
  inline tags are now indexed, numeric-only tags are ignored, and `#` prefixes
  in frontmatter tags are stripped.
- Default settings are no longer mutated at runtime, and "Recent files" no
  longer reorders the shared index in place.

## [2.3.3] - 2026-09-07
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
