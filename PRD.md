---
name: multi-vault-navigator-prd
description: Product Requirement Document for Multi-Vault Navigator Obsidian plugin
created: 2026-06-05
status: drafting
tags: [plugin, obsidian, vault, search, navigation, pkm]
---

# Multi-Vault Navigator — Product Requirement Document (PRD)

## 1. Ringkasan

**Multi-Vault Navigator** adalah plugin Obsidian untuk navigasi lintas vault: quick switch vault, cross-vault search, recent files lintas vault, dan status ringkas tiap vault.

Tujuan utamanya: mengurangi friksi saat bekerja dengan beberapa vault terpisah tanpa harus memindahkan semua note ke satu vault besar.

---

## 2. Problem Statement

Saat workflow tersebar ke beberapa vault, ada beberapa friction utama:

1. **Switch vault lambat**  
   Obsidian native bisa switch vault, tapi flow-nya terasa terpisah dari kerja harian.

2. **Search terfragmentasi**  
   Search hanya efektif di vault aktif. Kalau lupa sebuah note ada di vault mana, harus buka vault satu per satu.

3. **Recent files tidak lintas vault**  
   File yang baru diedit di vault lain tidak muncul dalam konteks kerja vault aktif.

4. **Tidak ada status overview**  
   Sulit melihat vault mana yang paling aktif, terakhir diedit kapan, dan apakah ada file penting yang baru berubah.

5. **Context switching mental**  
   Banyak vault membantu pemisahan konteks, tapi navigasinya harus tetap cepat. Kalau tidak, struktur yang rapi malah jadi beban.

---

## 3. Goals

### Product Goals

- Membuat multi-vault workflow terasa seperti satu workspace terpadu.
- Mempertahankan pemisahan vault tanpa mengorbankan discoverability.
- Mempercepat pencarian note saat lokasi vault tidak diingat.
- Memberi overview aktivitas lintas vault.
- Tetap local-first: tidak butuh cloud, account, atau server eksternal.

### User Goals

- Saya bisa cari note dari semua vault lewat satu command.
- Saya bisa pindah vault cepat tanpa buka vault manager manual.
- Saya bisa lihat file terbaru dari semua vault.
- Saya bisa tahu vault mana yang terakhir berubah.
- Saya bisa membuka hasil search langsung di vault asalnya.

---

## 4. Non-Goals

MVP tidak mencakup:

- Sinkronisasi konten antar vault.
- Merge beberapa vault menjadi satu vault.
- Cloud sync atau remote indexing.
- Semantic/vector search.
- AI summarization.
- Edit file lintas vault dari vault aktif.
- Full graph lintas vault.

Semua itu bisa menjadi future phase, tapi MVP fokus ke navigasi dan pencarian cepat.

---

## 5. Target User

### Primary User

Pengguna Obsidian yang memakai beberapa vault untuk memisahkan domain kerja, misalnya:

- Memory/system vault
- Personal notes vault
- Writing vault
- Novel/worldbuilding vault
- Learning vault

### Secondary User

- Penulis yang memisahkan vault per proyek.
- Developer yang punya vault teknis, personal, dan project docs.
- PKM user yang ingin local-first multi-workspace search.

---

## 6. Core Use Cases

### UC-01 — Cross-Vault Search

**Scenario:** Saya ingin mencari note tentang `memory palace`, tapi lupa ada di vault mana.

**Flow:**
1. Trigger command: `Multi-Vault Navigator: Search All Vaults`
2. Search modal terbuka.
3. Ketik keyword: `memory palace`
4. Plugin menampilkan hasil dari semua configured vault.
5. Setiap hasil menampilkan:
   - note title
   - vault name
   - relative path
   - snippet matching text
   - last modified date
6. Pilih hasil.
7. Plugin membuka vault asal dan file terkait.

**Success:** User menemukan dan membuka note tanpa manual switch vault satu per satu.

---

### UC-02 — Quick Switch Vault

**Scenario:** Saya sedang di vault aktif, lalu ingin cepat pindah ke vault lain.

**Flow:**
1. Trigger command: `Multi-Vault Navigator: Switch Vault`
2. Modal menampilkan daftar vault configured.
3. User pilih vault.
4. Obsidian membuka vault tersebut.

**Success:** Switch vault selesai lewat command palette/modal, bukan vault manager manual.

---

### UC-03 — Recent Files Across Vaults

**Scenario:** Saya ingin lanjut file yang baru diedit kemarin, tapi lupa vault-nya.

**Flow:**
1. Trigger command: `Multi-Vault Navigator: Recent Files`
2. Modal/sidebar menampilkan file terbaru lintas vault.
3. User filter by vault atau keyword.
4. User pilih file.
5. Plugin membuka vault asal dan file.

**Success:** File terbaru lintas vault mudah ditemukan.

---

### UC-04 — Vault Status Overview

**Scenario:** Saya ingin melihat vault mana yang aktif berubah minggu ini.

**Flow:**
1. Buka sidebar view: `Multi-Vault Overview`
2. Tiap vault menampilkan:
   - total markdown files
   - last modified file
   - last modified time
   - indexed status
   - indexing error jika ada
3. User klik vault/file untuk membuka.

**Success:** User punya map ringkas semua vault.

---

## 7. Feature Requirements

## 7.1 Vault Registry

Plugin harus punya daftar vault yang dapat dikonfigurasi manual.

### Fields

```ts
interface VaultConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  color?: string;
  icon?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}
```

### Requirements

- User bisa add/edit/remove vault dari settings.
- Path harus divalidasi:
  - folder exists
  - berisi `.obsidian/`
  - readable
- Vault aktif otomatis terdeteksi.
- Default exclude:
  - `.obsidian/`
  - `.trash/`
  - `node_modules/`
  - `.git/`
  - file binary/non-markdown

---

## 7.2 Cross-Vault Indexer

Indexer membaca metadata file markdown dari semua vault enabled.

### Indexed Data

```ts
interface IndexedFile {
  id: string;
  vaultId: string;
  vaultName: string;
  absolutePath: string;
  relativePath: string;
  basename: string;
  extension: string;
  frontmatter?: Record<string, unknown>;
  headings?: string[];
  tags?: string[];
  links?: string[];
  mtime: number;
  size: number;
  contentPreview?: string;
}
```

### MVP Index Scope

- Markdown files only (`.md`)
- filename
- relative path
- headings
- frontmatter tags
- inline tags
- first N chars for preview/snippet
- mtime

### Performance Requirements

- Initial index 10k markdown files: target < 30 seconds on normal laptop.
- Incremental refresh after file change: target < 2 seconds.
- Search response after index ready: target < 300 ms for 10k files.
- Index stored locally in plugin data folder.

---

## 7.3 Cross-Vault Search Modal

Search modal adalah feature utama.

### Search Inputs

- Free text query
- Optional vault filter
- Optional tag filter
- Optional path filter

### Result Display

Each result:

```text
[Vault Name] Note Title
relative/path/to/note.md
matched snippet...
Last edited: 2026-06-05 18:30
```

### Ranking MVP

Ranking sederhana:

1. Exact title match
2. Title fuzzy match
3. Path match
4. Heading match
5. Tag match
6. Content snippet match
7. Recency boost

### Search Library

MVP: Fuse.js or MiniSearch.

Recommended:
- **Fuse.js** for quick fuzzy search MVP.
- **MiniSearch** if index grows and ranking needs more control.

---

## 7.4 Open File in Source Vault

Saat user memilih hasil lintas vault, plugin harus membuka vault asal dan file terkait.

### Strategy Options

1. **Obsidian URI**

```text
obsidian://open?vault=<vault-name>&file=<encoded-file-path>
```

Pros: simple, native.  
Cons: depends on vault name + OS URI handling.

2. **Internal adapter if same vault**

Jika hasil berasal dari vault aktif, buka langsung via `workspace.openLinkText()`.

3. **Reveal path fallback**

Jika URI gagal, copy absolute path atau reveal in system file explorer.

### MVP Decision

- Same vault: open directly.
- Other vault: use Obsidian URI.
- Fallback: show path + copy button.

---

## 7.5 Quick Switch Vault

Command untuk berpindah vault.

### Requirements

- Command: `Multi-Vault Navigator: Switch Vault`
- List vault by configured order.
- Show last modified time per vault.
- Use Obsidian URI to open selected vault.

---

## 7.6 Recent Files Across Vaults

### Requirements

- Command: `Multi-Vault Navigator: Recent Files`
- Show top 50 newest modified markdown files across vaults.
- Filter by vault.
- Open selected file.

---

## 7.7 Sidebar Overview

Sidebar view optional for MVP, but recommended as P1.

### Content

- Vault list
- File count per vault
- Last modified file per vault
- Index status: indexed / indexing / error
- Button: refresh index

---

## 7.8 Settings UI

### Required Settings

- Vault list manager
- Add vault path
- Enable/disable vault
- Include/exclude patterns
- Search indexing options:
  - index content preview: on/off
  - max preview chars
  - auto refresh interval
- Reset index

---

## 8. MVP Scope

### MVP Must-Have

1. Manual vault registry.
2. Cross-vault markdown index.
3. Search all vaults modal.
4. Open result in source vault.
5. Recent files across vaults.
6. Quick switch vault.
7. Basic settings UI.

### MVP Nice-to-Have

1. Sidebar overview.
2. Tag filter.
3. Heading extraction.
4. File watcher for incremental indexing.

### Post-MVP

1. Cross-vault backlinks.
2. Cross-vault graph view.
3. Semantic search.
4. AI-assisted note routing.
5. Duplicate note detection.
6. Broken link detection across vaults.
7. Cross-vault command: "move note to another vault".

---

## 9. UX Design

## 9.1 Commands

- `Multi-Vault Navigator: Search All Vaults`
- `Multi-Vault Navigator: Recent Files`
- `Multi-Vault Navigator: Switch Vault`
- `Multi-Vault Navigator: Refresh Index`
- `Multi-Vault Navigator: Open Overview`

## 9.2 Search Modal Layout

```text
┌──────────────────────────────────────────────┐
│ Search all vaults...                         │
├──────────────────────────────────────────────┤
│ [hermes-memory] Memory Palace                │
│ 06_Ide/Digital_Garden_Post/Episode_02...     │
│ ...vault sebagai external brain...           │
│ Last edited: today                           │
├──────────────────────────────────────────────┤
│ [Novel] Adara Timeline                       │
│ Worldbuilding/Timeline/Malam_Kelabu.md       │
│ ...                                         │
└──────────────────────────────────────────────┘
```

## 9.3 Empty State

If no vault configured:

```text
No vaults configured yet.
Add vault paths in settings to enable cross-vault search.
```

If index unavailable:

```text
Index is not ready.
Run Refresh Index or enable auto-indexing in settings.
```

---

## 10. Technical Architecture

## 10.1 Components

```text
MultiVaultNavigatorPlugin
├── SettingsManager
├── VaultRegistry
├── Indexer
│   ├── FileScanner
│   ├── MarkdownParser
│   └── IndexStore
├── SearchEngine
├── Commands
├── SearchModal
├── RecentFilesModal
├── SwitchVaultModal
└── OverviewView
```

## 10.2 Data Flow

```text
Configured vault paths
        ↓
FileScanner scans .md files
        ↓
MarkdownParser extracts title/headings/tags/snippet
        ↓
IndexStore persists local JSON index
        ↓
SearchEngine builds in-memory index
        ↓
SearchModal / RecentFilesModal display results
        ↓
Open via direct open or obsidian:// URI
```

## 10.3 Plugin Data Files

Stored in active vault plugin data dir:

```text
.obsidian/plugins/multi-vault-navigator/data.json
.obsidian/plugins/multi-vault-navigator/index-cache.json
```

### `data.json`

```json
{
  "vaults": [
    {
      "id": "hermes-memory",
      "name": "hermes-memory",
      "path": "C:/hermes-memory",
      "enabled": true,
      "includePatterns": ["**/*.md"],
      "excludePatterns": [".obsidian/**", ".git/**", ".trash/**"]
    }
  ],
  "indexOptions": {
    "maxPreviewChars": 1000,
    "autoRefreshOnStartup": true,
    "watchFileChanges": true
  }
}
```

### `index-cache.json`

```json
{
  "version": 1,
  "generatedAt": "2026-06-05T18:30:00.000Z",
  "files": []
}
```

---

## 11. Security & Privacy

### Principles

- Local-only indexing.
- No network requests.
- No telemetry.
- No cloud storage.
- No hidden file upload.

### Path Safety

- Only scan user-configured folders.
- Validate folder before indexing.
- Do not execute files.
- Do not follow symlinks by default unless user enables it.
- Exclude hidden/system folders by default.

### Content Safety

- Index markdown text only.
- Binary files ignored.
- Large files can be skipped with configurable max size.

---

## 12. Edge Cases

| Case | Expected Behavior |
|---|---|
| Vault path deleted | Mark vault as unavailable, keep config |
| Vault renamed | URI open may fail; show warning + path copy fallback |
| Duplicate vault names | Use internal `id`, warn user |
| Same file name in multiple vaults | Show vault name + path clearly |
| Huge markdown file | Skip content indexing, still index filename/path |
| Permission error | Show indexing error per vault |
| Windows path spaces | Encode URI correctly |
| WSL path vs Windows path | Normalize path display; user config decides source path |

---

## 13. Success Metrics

MVP dianggap sukses jika:

- Search lintas 5 vault bisa menemukan note target dalam < 5 detik dari command trigger.
- User tidak perlu manual open 3-5 vault untuk mencari note lama.
- Recent files lintas vault membantu melanjutkan kerja tanpa ingat vault asal.
- Tidak ada data keluar dari local machine.
- Plugin stabil untuk 10k markdown files.

---

## 14. Development Plan

### Phase 0 — Spike

- Validate Obsidian URI open behavior across OS.
- Test reading external vault folders from plugin context.
- Test search index library: Fuse.js vs MiniSearch.
- Confirm path handling Windows/WSL.

### Phase 1 — MVP

- Settings: manual vault registry.
- File scanner for configured vaults.
- Index cache builder.
- Search modal.
- Open selected result.
- Quick switch vault.
- Recent files modal.

### Phase 2 — Usability

- Sidebar overview.
- File watcher/incremental indexing.
- Better snippets.
- Tag/path filters.
- Index status UI.

### Phase 3 — Power Features

- Cross-vault backlinks.
- Duplicate note detection.
- Broken wikilink detection across vaults.
- Semantic search optional module.
- AI note-router integration.

---

## 15. Open Questions

1. Apakah vault registry harus auto-detect dari Obsidian global config, atau manual saja untuk MVP?
2. Apakah indexing content penuh perlu, atau cukup title/path/headings/snippet?
3. Apakah plugin perlu support vault path di WSL (`/mnt/c/...`) dan Windows (`C:/...`) sekaligus?
4. Apakah file watcher lintas vault stabil di semua OS?
5. Apakah user perlu preview markdown rendering di search result, atau snippet plain text cukup?

---

## 16. Recommendation

MVP paling realistis:

1. Manual vault registry.
2. Scan `.md` only.
3. Index title/path/headings/tags/first 1000 chars.
4. Search modal dengan Fuse.js.
5. Open via direct open for active vault, Obsidian URI for other vaults.
6. Recent files view.

Ini cukup untuk membuktikan value tanpa masuk dulu ke semantic search, graph, atau sync.

---

## Lihat Juga

- [[README]] — hub Multi-Vault Navigator
- [[../plugin_master_plan]] — master plan plugin Obsidian
- [[../../_INDEX]] — index teknis
- [[../../../06_Ide/Plugin_Webapp_Ideas_Backlog]] — backlog ide plugin dan webapp
