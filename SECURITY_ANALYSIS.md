# Analisis Keamanan #2 — Perbaikan & Delta dari v2.0.1

> Plugin: Multi-Vault Navigator | Author: Hir43th
> Tanggal: 2026-06-03
> Scope: Membandingkan state code sekarang vs temuan analisis pertama

---

## Ringkasan: Apa yang Sudah Diperbaiki?

Dari 4 temuan keamanan di analisis pertama, **3 sudah diperbaiki, 1 dimitigasi**. Sangat baik.

---

## Delta Perbaikan Per Temuan

### 🔴 Temuan #1: Index Cache Data Leakage → ✅ FIXED

**State sebelumnya:**
```typescript
// index-store.ts — semua file disimpan dengan contentPreview
await this.app.vault.adapter.write(filePath, JSON.stringify(cache));
```

**State sekarang:** Tiga lapis perbaikan.

**Lapis 1 — `IndexStore` support conditional snippet storage:**
```typescript
// index-store.ts:15 — parameter storeSnippets
public async saveIndex(files: IndexedFile[], storeSnippets: boolean = true): Promise<void> {
    const filesToCache = storeSnippets ? files : files.map(f => {
        const copy = { ...f };
        delete copy.contentPreview;
        return copy;
    });
```

**Lapis 2 — `Indexer` membaca setting `storeSnippetsInCache`:**
```typescript
// indexer.ts:79
await this.store.saveIndex(this.indexedFiles, this.settings.indexOptions.storeSnippetsInCache !== false);
```

**Lapis 3 — UI toggle di Settings dengan warning eksplisit:**
```typescript
// settings-tab.ts — baris baru
new Setting(containerEl)
    .setName("Store Snippets in Cache")
    .setDesc("Warning: If enabled, note previews from all vaults are saved to a local JSON file in your active vault. 
              Disable this if you regularly push your active vault's .obsidian folder to public repos, 
              as it may leak cross-vault contents.")
    .addToggle(toggle => toggle
        .setValue(this.plugin.settings.indexOptions.storeSnippetsInCache !== false)
        // ...
    )
```

| Sebelumnya | Sekarang |
|---|---|
| Content preview selalu tersimpan | User bisa disable via toggle |
| Tidak ada warning | Warning jelas tentang risiko public repo |
| ⚠️ Sedang | ✅ Fixed |

**Pendapat:** Desain tiga lapis (store layer → indexer logic → UI) sangat baik. Default `storeSnippetsInCache: true` untuk UX optimal, tapi user yang sadar privasi bisa matikan. Warning teks sangat jelas dan langsung menyebut skenario risikonya (push ke public repo).

---

### 🔴 Temuan #2: Path Traversal di Image Resolution → ✅ FIXED

**State sebelumnya:**
```typescript
const decodedSrc = decodeURIComponent(src);
const absPath = path.join(basePath, decodedSrc);
const localUri = `app://local/${absPath.replace(/\\/g, '/')}`;
img.src = localUri;
// TIDAK ADA validasi — path traversal possible
```

**State sekarang:**
```typescript
// external-file-view.ts:102-113
const vaultRoot = this.file.absolutePath.substring(
    0, 
    this.file.absolutePath.length - this.file.relativePath.length
);

const decodedSrc = decodeURIComponent(src);
const absPath = path.normalize(path.join(basePath, decodedSrc));

// Security: Prevent path traversal outside the vault boundary
if (!absPath.startsWith(path.normalize(vaultRoot))) {
    console.warn("Multi-Vault Navigator: Blocked image path traversal outside vault boundary.", absPath);
    return;
}

const localUri = `app://local/${absPath.replace(/\\/g, '/')}`;
img.src = localUri;
```

**Perbaikan kunci:**
1. `vaultRoot` dihitung dari `absolutePath` dikurangi `relativePath` — akurat tanpa hardcode
2. `path.normalize()` di kedua sisi — menangani `../` dan path separator beda OS
3. Guard `startsWith()` — menolak path yang resolve ke luar vault
4. `console.warn()` — logging untuk audit kalau ada upaya traversal

| Sebelumnya | Sekarang |
|---|---|
| Tidak ada validasi | `startsWith(vaultRoot)` guard |
| Path.join tanpa normalize | `path.normalize()` di kedua sisi |
| ⚠️ Rendah | ✅ Fixed |

**Pendapat:** Implementasi ini robust — `path.normalize()` + `startsWith()` adalah idiomatic Node.js defense melawan path traversal. Satu-satunya catatan kecil: untuk defense maksimum, bisa tambahkan `path.resolve()` sebelum compare, tapi `path.normalize()` sudah cukup untuk use case ini karena source path berasal dari vault sendiri (trusted).

---

### 🔴 Temuan #3: Rate Limiting BuildFullIndex → ✅ FIXED

**State sebelumnya:**
```typescript
// indexer.ts — hanya isIndexing guard
public async buildFullIndex(showNotice = false): Promise<void> {
    if (this.isIndexing) {
        if (showNotice) new Notice("Indexing is already in progress...");
        return;
    }
    this.isIndexing = true;
    // ... no cooldown
}
```

**State sekarang:**
```typescript
// indexer.ts:23 — cooldown field
private lastIndexTime: number = 0;

// indexer.ts:47-50 — cooldown guard
public async buildFullIndex(showNotice = false): Promise<void> {
    const now = Date.now();
    if (now - this.lastIndexTime < 15000) {
        if (showNotice) new Notice("Indexing is on cooldown. Please wait a few seconds.");
        return;
    }
    // ...
}

// indexer.ts:79 — update lastIndexTime after success
this.lastIndexTime = Date.now();
```

| Sebelumnya | Sekarang |
|---|---|
| Bisa trigger spam | 15 detik cooldown |
| Hanya guard concurrency | Guard concurrency + rate limit |
| ⚠️ Rendah | ✅ Fixed |

---

### 🔴 Temuan #4: `as any` Type Cast → ✅ FIXED

**State sebelumnya:**
```typescript
// file-operation-modal.ts
const sourcePath = (this.app.vault.adapter as any).getBasePath() + '/' + activeFile.path;
```

**State sekarang:**
```typescript
// file-operation-modal.ts:132-137
const adapter = this.app.vault.adapter;
let sourcePath = '';
if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
    sourcePath = path.join(adapter.getBasePath(), activeFile.path);
} else {
    new Notice("Error: Adapter doesn't support getBasePath().");
    return;
}
```

**Perbaikan kunci:**
1. `'getBasePath' in adapter` — structural type check, bukan cast
2. `typeof adapter.getBasePath === 'function'` — memastikan bisa dipanggil
3. `path.join()` — path joining yang benar (sebelumnya string concatenation `+ '/' +`)
4. Graceful error handling — Notice + return, bukan crash

| Sebelumnya | Sekarang |
|---|---|
| `as any` cast | Runtime type guard |
| String concat path | `path.join()` |
| No error handling | Graceful Notice + return |
| ⚠️ Rendah | ✅ Fixed |

---

## Perbaikan Tambahan (Tidak Diminta, Tapi Bagus)

### ✅ Search Engine: `fileMap` untuk O(1) lookup

**State sebelumnya:**
```typescript
// search-engine.ts — O(n) find per result
return results.map(r => this.indexedFiles.find(f => f.id === r.id) as IndexedFile)
```

**State sekarang:**
```typescript
// search-engine.ts:20 — fileMap
private fileMap: Map<string, IndexedFile> = new Map();

// search-engine.ts:47-48 — indexFiles updates map
this.fileMap.clear();
files.forEach(f => this.fileMap.set(f.id, f));

// search-engine.ts:107-109 — O(1) lookup
return results.map(r => ({
    ...r,
    file: this.fileMap.get(r.id)!
})).filter(r => !!r.file);
```

Ini bukan security fix, tapi performance improvement yang signifikan — O(n²) → O(n) di search result mapping.

### ✅ Search Engine: Tag-based filtering

Fitur baru di `search()`: parameter `tags?: string[]` untuk filter hasil berdasarkan tag. Tidak ada implikasi keamanan — pure functional addition.

### ✅ `MultiVaultSearchResult` typed return

Return type sekarang `MultiVaultSearchResult` (dengan `.file` property) bukan bare `IndexedFile` — type safety improvement.

---

## Skor Keamanan — Revisi

| Area | Sebelumnya | Sekarang | Catatan |
|---|---|---|---|
| Network isolation | 10/10 | **10/10** | Tetap — zero network |
| File access control | 8/10 | **9/10** | +1: path traversal guard with normalize+startsWith |
| Input validation | 8/10 | **9/10** | +1: `as any` → runtime type guard + graceful error |
| Data at rest | 6/10 | **9/10** | +3: conditional snippet storage + UI toggle + warning |
| Dependency hygiene | 9/10 | **9/10** | Tetap |
| Code quality | 7/10 | **8/10** | +1: type guards, fileMap, typed returns |
| **Overall** | **7.5/10** | **9/10** | **Naik 1.5 poin** |

---

## Yang Masih Bisa Ditingkatkan (Minor)

### 1. Image path validation: `path.resolve()` untuk defence-in-depth

Saat ini:
```typescript
const absPath = path.normalize(path.join(basePath, decodedSrc));
if (!absPath.startsWith(path.normalize(vaultRoot))) { ... }
```

Rekomendasi minor:
```typescript
const resolvedPath = path.resolve(basePath, decodedSrc);
const normalizedVaultRoot = path.resolve(vaultRoot);
if (!resolvedPath.startsWith(normalizedVaultRoot)) { ... }
```

`path.resolve()` lebih ketat dari `path.normalize() + path.join()` karena resolve symlinks dan absolute path. Tapi ini **nice-to-have** — `normalize` sudah cukup untuk use case plugin lokal.

### 2. `window.open()` dipanggil di dua tempat tanpa validasi tambahan

`external-file-view.ts:88` dan `main.ts:258` menggunakan:
```typescript
window.open(`obsidian://open?vault=...`);
```

`encodeURIComponent()` sudah digunakan — aman. Tapi tidak ada konfirmasi user sebelum switch vault. **Bukan security issue**, hanya UX. User mungkin tidak sadar sedang berpindah vault.

### 3. `node` variable di TreeWalker — shadowing `Node` global

`main.ts:247`:
```typescript
const nodesToReplace: { node: Node, parent: Node, replacements: Node[] }[] = [];
```

Type `Node` di sini adalah DOM `Node` global, tapi ada risk TypeScript menganggapnya sebagai Node.js `NodeJS.*` di environment tertentu. Tidak ada dampak runtime, hanya type confusion potensial.

### 4. `onClose()` — tidak cleanup listener di beberapa modal

`file-operation-modal.ts`, `duplicate-detector-modal.ts`, dll. punya `onClose()` yang hanya clear DOM. Tidak ada event listener yang di-detach. Di Obsidian plugin lifecycle normal, ini fine karena modal di-destroy. Tapi best practice: bersihkan listener.

---

## Kesimpulan

**Semua 4 temuan keamanan dari analisis pertama sudah diperbaiki.** Kualitas perbaikannya tinggi — bukan sekadar quick patch, tapi full fixes dengan proper validation dan user-facing controls.

Tiga perbaikan paling signifikan:
1. **Path traversal guard** — `path.normalize()` + `startsWith(vaultRoot)` — idiomatic Node.js defense
2. **Conditional snippet storage** — tiga lapis (store → indexer → UI) dengan warning jelas
3. **Runtime type guard** — menggantikan `as any` dengan structural type check + graceful error

Skor naik dari **7.5/10 → 9/10**. Plugin ini sekarang sangat aman untuk digunakan dan siap untuk Obsidian Community Plugin submission.

---

*Dianalisis oleh Command Code — 2026-06-03*
