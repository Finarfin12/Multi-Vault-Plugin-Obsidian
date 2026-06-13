# Multi-Vault Navigator — Analisis Fitur yang Diperlukan

**Versi saat ini:** 2.1.6 | **Status:** Production-ready untuk personal use

---

## A. Fitur yang SUDAH ADA (Tidak perlu dikerjakan ulang)

| Fitur | Status |
|-------|--------|
| Auto-detection vault dari `obsidian.json` | ✅ |
| Pencarian fuzzy lintas vault (MiniSearch) | ✅ |
| Cross-vault wikilinks `[[VaultName::NoteTitle]]` | ✅ |
| Command Center (dashboard pencarian) | ✅ |
| Cross-vault read-only file viewer | ✅ |
| Move/Copy file + Smart Inbox Router | ✅ |
| Duplicate detector (nama file sama) | ✅ |
| Tag Explorer & Daily Dashboard | ✅ |
| Sidebar (pinned notes + saved searches) | ✅ |
| Search modal, Recent files modal, Switch vault modal | ✅ |
| Protocol handler `obsidian://mvn-open` | ✅ |
| Snippet highlighting & tag pills | ✅ |
| Privacy toggle (store snippets in cache) | ✅ |

---

## B. Fitur DIKLAIM ADA tapi BELUM DIIMPLEMENTASI (Quick Wins)

### 1. `VaultConfig.includePatterns` — tidak pernah dipakai
- **File:** `src/types.ts:13` (deklarasi), `src/indexer/file-scanner.ts` (tidak digunakan)
- **Masalah:** Field sudah dideklarasikan di interface, ada di settings UI, tapi scanner tidak pernah membacanya
- **Perbaikan:** Wire `includePatterns` ke `FileScanner.scan()` sebagai filter — hanya scan file yang matching pattern

### 2. `VaultConfig.color` & `VaultConfig.icon` — tidak pernah dirender
- **File:** `src/types.ts:8-9`
- **Masalah:** Deklarasi ada tapi tidak dipakai di UI manapun
- **Perbaikan:** Tampilkan warna/icon vault sebagai badge di hasil pencarian, sidebar, dan Command Center

### 3. `Indexer.clearIndex()` — tidak ada trigger UI
- **File:** `src/indexer/indexer.ts:92-96`
- **Masalah:** Method publik ada tapi tidak pernah dipanggil dari command atau tombol
- **Perbaikan:** Tambahkan tombol "Clear Index" di settings tab + command palette

### 4. Cache versioning — hardcoded ke `1`
- **File:** `src/indexer/index-store.ts`, `src/types.ts:52`
- **Masalah:** `IndexCache.version` selalu `1`, tidak ada logic migrasi cache
- **Perbaikan:** Implement version check + cache invalidation saat struktur berubah

---

## C. Fitur BELUM ADA (Prioritas Tinggi)

### 5. Incremental / delta indexing
- **Masalah:** Setiap refresh selalu full re-scan semua vault — lambat untuk vault besar
- **Solusi:** Bandingkan `mtime` file dengan timestamp cache terakhir; hanya re-index file yang berubah
- **File yang diubah:** `src/indexer/indexer.ts`, `src/indexer/file-scanner.ts`, `src/indexer/index-store.ts`

### 6. Background file watcher
- **Masalah:** Tidak ada `fs.watch` atau periodic polling — user harus manual refresh
- **Solusi:** Gunakan `fs.watch()` atau polling 30-detik di background untuk auto-update index saat file berubah
- **File yang diubah:** `src/main.ts` (register watcher), `src/indexer/indexer.ts` (debounced re-index)

### 7. Vault filter dropdown di Command Center
- **Masalah:** `SearchEngine.search()` sudah support parameter `vaultId`, tapi tidak ada UI filter vault di Command Center
- **Solusi:** Tambahkan dropdown/pill selector vault di atas hasil pencarian
- **File yang diubah:** `src/views/search-page-view.ts`

### 8. Sort options di hasil pencarian
- **Masalah:** Hasil selalu sort by relevance, tidak ada opsi sort by date atau by vault
- **Solusi:** Tambahkan tombol toggle (Relevance / Date / Vault Name) di Command Center
- **File yang diubah:** `src/views/search-page-view.ts`

---

## D. Fitur BELUM ADA (Prioritas Menengah)

### 9. Cross-vault backlinks
- **Masalah:** Tidak ada "what links here" lintas vault
- **Solusi:** Saat membuka file, scan semua vault untuk `[[link]]` yang mengarah ke file ini
- **File yang diubah:** `src/views/external-file-view.ts` (tambah panel backlinks), `src/search-engine.ts` (query backlinks)

### 10. Content diff untuk duplicate files
- **Masalah:** Duplicate detector hanya menunjukkan nama file yang sama, tidak bisa bandingkan isi
- **Solusi:** Tambahkan tombol "Compare" di duplicate modal untuk menampilkan perbedaan konten
- **File yang diubah:** `src/modals/duplicate-detector-modal.ts`

### 11. Batch file operations (multi-select)
- **Masalah:** Move/Copy hanya 1 file per operasi
- **Solusi:** Tambahkan checkbox di hasil pencarian untuk multi-select file, lalu bulk move/copy
- **File yang diubah:** `src/views/search-page-view.ts`, `src/modals/file-operation-modal.ts`

### 12. Keyboard shortcut untuk pin/unpin
- **Masalah:** Pin hanya bisa lewat right-click context menu
- **Solusi:** Register hotkey (misal `Ctrl+Shift+P`) untuk pin/unpin file yang sedang dihover/dipilih
- **File yang diubah:** `src/main.ts` (register command)

---

## E. Fitur BELUM ADA (Prioritas Rendah / Nice-to-Have)

### 13. Cross-vault graph view
- **Ide:** Visualisasi graf koneksi antar vault
- **Kompleksitas:** Tinggi — butuh renderer graf kustom
- **File baru:** `src/views/graph-view.ts`

### 14. Unit tests
- **Masalah:** Tidak ada test framework sama sekali
- **Solusi:** Setup Jest/Vitest, tulis test untuk search-engine, vault-registry, markdown-parser
- **File baru:** `tests/`, `jest.config.js`

### 15. CI/CD pipeline
- **Masalah:** Tidak ada GitHub Actions
- **Solusi:** Setup workflow untuk lint, test, build, dan auto-release
- **File baru:** `.github/workflows/`

### 16. i18n / internasionalisasi
- **Masalah:** Semua string hardcoded English
- **Solusi:** Ekstrak string ke file locale, support Bahasa Indonesia & English
- **File baru:** `src/i18n/`

---

## F. Bug / Code Quality Items

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | Obfuscated `.obsidian` string di default excludes | `file-scanner.ts:14` | Trivial |
| 2 | Hardcoded dev machine path di esbuild config | `esbuild.config.mjs:53` | Dev-only |
| 3 | Modal event listener tidak di-cleanup | `file-operation-modal.ts` | Low |
| 4 | `Node` type shadowing | `main.ts:247` | Low |

---

## G. Rekomendasi Prioritas Implementasi

```
Phase 1 (Quick Wins):
  1. Wire includePatterns ke scanner
  2. Render vault color/icon di UI
  3. Tambah tombol "Clear Index"
  4. Cache versioning

Phase 2 (High Impact):
  5. Incremental indexing
  6. Background file watcher
  7. Vault filter dropdown
  8. Sort options

Phase 3 (Power User):
  9. Cross-vault backlinks
  10. Content diff
  11. Batch operations
  12. Keyboard shortcuts

Phase 4 (Polish):
  13-16: Graph view, tests, CI/CD, i18n
```

---

## H. Verifikasi

- Phase 1: `includePatterns` berfungsi, warna vault muncul di hasil pencarian, tombol Clear Index muncul di settings
- Phase 2: Index auto-update tanpa manual refresh, filter vault muncul di Command Center, sort toggle berfungsi
- Phase 3: Backlinks tampil di external file view, diff muncul di duplicate modal, multi-select berfungsi
- Phase 4: Test suite lolos, CI/CD berjalan, locale file berfungsi
