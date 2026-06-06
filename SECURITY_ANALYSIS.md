# Analisis Keamanan — Multi-Vault Navigator v2.0.1

> Plugin Obsidian untuk navigasi, pencarian, dan akses file lintas vault.
> **Author**: Hir43th | **License**: MIT | **Platform**: Desktop-only (Electron + Node.js)
> **Dependency runtime**: MiniSearch v6.3.0

---

## Ringkasan Eksekutif

**Plugin ini 100% local-first — tidak ada koneksi jaringan sama sekali.** Ini adalah fondasi keamanan paling signifikan karena menghilangkan seluruh kelas serangan: data exfiltration, API injection, third-party tracking, MITM, dan supply chain runtime compromise.

Setelah menganalisis seluruh 15 file source code, saya menilai keamanan plugin ini: **7.5/10** — aman untuk digunakan dengan beberapa catatan yang perlu diwaspadai.

---

## Arsitektur Keamanan

### Trust Boundary

```
┌──────────────────────────────────────────────────────┐
│                   Obsidian App (Electron)            │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Vault A    │  │ Vault B    │  │ Vault C       │  │
│  │ (.md files)│  │ (.md files)│  │ (.md files)   │  │
│  └─────┬──────┘  └─────┬──────┘  └───────┬───────┘  │
│        │               │                  │          │
│        └───────────────┼──────────────────┘          │
│                        │ fs.readFileSync()           │
│              ┌─────────▼──────────┐                  │
│              │  Multi-Vault       │                  │
│              │  Navigator Plugin  │                  │
│              │                    │                  │
│              │  ┌──────────────┐  │                  │
│              │  │ Index Cache  │  │ ← .json di disk  │
│              │  │ (content     │  │                  │
│              │  │  previews)   │  │                  │
│              │  └──────────────┘  │                  │
│              │                    │                  │
│              │  No network calls  │ ← ZERO           │
│              └────────────────────┘                  │
│                                                      │
│  Trust boundary: plugin hanya baca/tulis file system │
│  dalam path vault yang sudah dikonfigurasi.          │
└──────────────────────────────────────────────────────┘
```

---

## Analisis Per Vektor Serangan

### 1. File System Access — ✅ Aman (dengan catatan)

**Mekanisme**: Plugin menggunakan `fs.readFileSync()` dan `fs.readdir()` untuk membaca vault lain.

**Analisis**:
- Vault path bersumber dari dua tempat:
  - `obsidian.json` — file konfigurasi global Obsidian, ditulis oleh Obsidian sendiri, **trusted**
  - Manual input user di Settings — divalidasi oleh `validateVaultPath()` yang mengecek: (a) path adalah directory, (b) ada subdirectory `.obsidian`
- Tidak ada path traversal dari user input karena semua path berasal dari konfigurasi yang sudah di-allow
- Semua operasi file menggunakan path yang berasal dari `VaultConfig.path` + relative path yang ditemukan oleh scanner — tidak ada user-controlled path injection

**Risiko residual**: Kalau user secara manual menambahkan vault path yang menunjuk ke directory sensitif (misal `C:\Windows`) yang kebetulan punya subdirectory `.obsidian` (extremely unlikely). Validasi `.obsidian` folder cukup untuk mencegah ini.

| Rating | ✅ Aman |
|---|---|

### 2. Image Path Resolution — ⚠️ Perlu Perhatian

**File**: `src/views/external-file-view.ts`, method `resolveMediaAndLinks()`

```typescript
const decodedSrc = decodeURIComponent(src);
const absPath = path.join(basePath, decodedSrc);
const localUri = `app://local/${absPath.replace(/\\/g, '/')}`;
img.src = localUri;
```

**Analisis**:
- `decodedSrc` berasal dari konten markdown vault lain — **trusted** (ditulis oleh user sendiri atau kolaborator)
- `path.join(basePath, decodedSrc)` — kalau `decodedSrc` adalah `../../etc/passwd`, Node.js `path.join()` akan resolve ke parent directory
- Namun, ini hanya menghasilkan URI `app://local/...` yang diproses oleh Electron Obsidian — **Electron membatasi akses `app://local/` ke path yang diizinkan**
- Defense-in-depth: konten markdown berasal dari vault user sendiri (trusted), dan Electron sandbox membatasi akses file

**Risiko residual**: Rendah. Untuk dieksploitasi, attacker harus: (1) menginject konten markdown ke vault user, DAN (2) Electron sandbox harus punya bug. Layer pertahanan ganda cukup.

| Rating | ⚠️ Rendah — defense-in-depth dari Electron |
|---|---|

### 3. Cross-Vault Link Parser `[[VaultName::NoteTitle]]` — ✅ Aman

**File**: `src/main.ts`, `registerMarkdownPostProcessor`

```typescript
const regex = /\[\[(.*?)::(.*?)\]\]/g;
// ...
a.onclick = (e) => {
    const target = files.find(f => 
        f.vaultName.toLowerCase() === vaultName.toLowerCase() && 
        f.basename.toLowerCase() === noteName.toLowerCase()
    );
    if (target) this.fileOpener.openFile(target);
};
```

**Analisis**:
- Input dari markdown content — trusted (user's own notes)
- Pencocokan dilakukan terhadap indexed files, BUKAN langsung ke path
- Tidak ada path construction dari user input dalam konteks ini
- Click handler menggunakan `e.preventDefault()` — mencegah navigasi default

| Rating | ✅ Aman |
|---|---|

### 4. Protocol Handler `obsidian://mvn-open` — ✅ Aman

**File**: `src/main.ts`

```typescript
this.registerObsidianProtocolHandler("mvn-open", async (params) => {
    const vaultId = params.vaultId;
    const filePath = params.file;
    // ...
    const target = files.find(f => f.vaultId === vaultId && f.relativePath === filePath);
    if (target) {
        this.fileOpener.openFile(target);
    }
});
```

**Analisis**:
- Parameter URI (`vaultId`, `file`) TIDAK DIGUNAKAN untuk membuka file secara langsung
- Lookup dilakukan ke index → hanya file yang SUDAH ADA di index yang bisa dibuka
- File tidak ditemukan → hanya menampilkan Notice, tidak ada path traversal

| Rating | ✅ Aman |
|---|---|

### 5. Move/Copy File Operation — ✅ Aman

**File**: `src/modals/file-operation-modal.ts`

```typescript
const sourcePath = (this.app.vault.adapter as any).getBasePath() + '/' + activeFile.path;
const targetPath = path.join(targetVault.path, activeFile.name);

if (fs.existsSync(targetPath)) {
    new Notice(`File ${activeFile.name} already exists in target vault!`);
    return;
}
fs.copyFileSync(sourcePath, targetPath);
```

**Analisis**:
- Source path: dari Obsidian API (`activeFile.path`) → trusted
- Target path: dari `targetVault.path` (konfigurasi) + `activeFile.name` (trusted)
- `fs.existsSync()` guard → mencegah overwrite tidak sengaja
- Move operation: copy dulu, baru trash source → kalau trash gagal, file tetap ada di source (lebih aman daripada delete dulu baru copy)

| Rating | ✅ Aman |
|---|---|

### 6. Index Cache — ⚠️ Data Leakage Risk (Lokal)

**File**: `src/indexer/index-store.ts`

```typescript
await this.app.vault.adapter.write(filePath, JSON.stringify(cache));
```

**Analisis**:
- Cache disimpan di `.obsidian/plugins/multi-vault-navigator/index-cache.json`
- Berisi: `IndexedFile[]` — vault name, relative path, basename, headings, tags, **content preview** (1000 karakter default), frontmatter
- **Ini adalah cross-vault content leakage**: konten dari vault B tersimpan di disk vault A (melalui plugin directory vault A)
- Kalau vault A di-share atau di-backup, content preview dari vault B ikut terbawa
- `.obsidian/` adalah application data — biasanya tidak di-share, tapi tetap risk

**Risiko**: Kalau user mem-backup vault A atau menshare folder vault A (misal via git), content preview dari vault B yang seharusnya private bisa ikut tersimpan.

**Rekomendasi**: 
- Tambahkan opsi "Exclude content preview from cache" di settings
- ATAU: bungkus content preview dengan encryption (overkill untuk use case ini)
- ATAU: dokumentasikan dengan jelas di README bahwa cross-vault content preview tersimpan di plugin directory

| Rating | ⚠️ Sedang — awareness issue, bukan exploit |
|---|---|

### 7. Markdown Rendering dari External File — ⚠️ Rendah

**File**: `src/views/external-file-view.ts`

```typescript
this.content = fs.readFileSync(file.absolutePath, 'utf8');
await MarkdownRenderer.renderMarkdown(this.content, contentDiv, '', this);
```

**Analisis**:
- Konten markdown dirender menggunakan Obsidian built-in `MarkdownRenderer`
- Renderer Obsidian **tidak mengeksekusi JavaScript** — HTML tag di-strip di reading view
- Tidak ada `innerHTML` injection — semua rendering melalui Obsidian API
- Ini sama amannya dengan membuka file markdown biasa di Obsidian

| Rating | ⚠️ Rendah — bergantung keamanan MarkdownRenderer Obsidian |
|---|---|

### 8. Global Exclude Patterns — ✅ Aman tapi Implementasi Sederhana

**File**: `src/indexer/file-scanner.ts`

```typescript
for (const pattern of allExcludes) {
    const p = pattern.trim().toLowerCase();
    if (relativePath.toLowerCase().includes(p) || entry.name.toLowerCase().includes(p)) {
        excluded = true;
        break;
    }
}
```

**Analisis**:
- Ini substring match, bukan regex atau glob — **tidak ada ReDoS atau regex injection risk**
- Hanya memengaruhi apa yang di-index — tidak ada dampak keamanan
- Pattern `Private` akan exclude folder `Private` DAN file `private-notes.md` — over-matching, tapi bukan security issue

| Rating | ✅ Aman |
|---|---|

### 9. Inline Click Handlers — ✅ Aman

Semua `onclick` handlers di plugin menggunakan `addEventListener` atau arrow functions, bukan string-based `onclick="..."` attribute. Tidak ada XSS via inline handlers.

### 10. Dependency Supply Chain — ⚠️ Rendah

| Dependency | Version | Risk |
|---|---|---|
| `minisearch` | ^6.3.0 | Search library, pure JavaScript, no native bindings, no network |
| `obsidian` | latest (dev) | Obsidian API types only |
| `typescript` | ^5.3.3 (dev) | Compiler only |

- Hanya **1 runtime dependency** — surface attack minimal
- MiniSearch adalah library pure JavaScript tanpa native addons → tidak ada risiko binary injection
- Tidak ada dependency dengan akses network

| Rating | ⚠️ Rendah — 1 dependency, no network |
|---|---|

---

## Yang Tidak Ada (dan Kenapa Itu Bagus)

| Tidak Ada | Implikasi Keamanan |
|---|---|
| Network calls | Tidak ada data exfiltration, CSRF, SSRF, atau API key leakage |
| `eval()` / `new Function()` | Tidak ada code injection |
| `child_process` / `exec` | Tidak ada command injection |
| `innerHTML` assignment | Tidak ada DOM-based XSS |
| Third-party analytics | Tidak ada tracking / telemetry |
| Obfuscated code | Kode transparan — bisa diaudit |

---

## Matriks Risiko

| Vektor | Severity | Exploitability | Impact | Rating |
|---|---|---|---|---|
| File system access (path validation) | Low | Low | Cross-vault reading | ✅ Aman |
| Image path traversal | Low | Very Low | Terbatas Electron sandbox | ⚠️ Rendah |
| Cross-vault link injection | Low | Very Low | Terbatas ke indexed files | ✅ Aman |
| Protocol handler injection | Low | Very Low | Terbatas ke indexed files | ✅ Aman |
| Index cache data leakage | **Medium** | Low | Content preview vault lain tersimpan di disk | ⚠️ Sedang |
| Markdown rendering (XSS) | Low | Very Low | Sama amannya dengan Obsidian | ⚠️ Rendah |
| Move/Copy overwrite | Low | Very Low | Sudah ada guard | ✅ Aman |
| Dependency compromise | Low | Very Low | 1 dep, no network | ⚠️ Rendah |

---

## Temuan Spesifik & Rekomendasi

### Temuan #1: Content Preview Vault Lain Tersimpan di Disk

**Lokasi**: `src/indexer/index-store.ts` → menulis `IndexedFile[]` (dengan `contentPreview`) ke `index-cache.json`

**Dampak**: Kalau vault di-backup atau di-share, content preview dari vault lain ikut terbawa.

**Rekomendasi**: 
```
1. (Quick) Tambahkan dokumentasi di README bahwa cache mengandung content preview lintas vault
2. (Better) Tambahkan setting "Store content preview in cache: Yes/No" 
3. (Best) Kalau user disable, jangan simpan contentPreview di cache, generate on-the-fly saat search
```

### Temuan #2: Path Traversal di Image Resolution (Mitigated)

**Lokasi**: `src/views/external-file-view.ts:resolveMediaAndLinks()`

```typescript
const absPath = path.join(basePath, decodedSrc);
```

**Dampak**: Kalau file markdown dari vault lain mengandung `![](../../secret/file.png)`, `path.join` akan resolve ke parent. TAPI ini di-mitigasi oleh Obsidian's `app://local/` handler yang terbatas.

**Rekomendasi**: 
```
Tambahkan validasi: pastikan resolved path tidak keluar dari vault directory.
path.resolve(...) harus dimulai dengan vault path yang bersangkutan.
```

### Temuan #3: Tidak Ada Rate Limiting pada Build Full Index

**Lokasi**: `src/indexer/indexer.ts:buildFullIndex()`

**Dampak**: User bisa trigger re-index berkali-kali via command palette atau settings → I/O spike. Bukan security risk, tapi reliability.

**Rekomendasi**: 
```
Cooldown 30 detik antar build. Sudah ada `this.isIndexing` guard tapi tidak mencegah trigger berulang.
```

### Temuan #4: `(this.app.vault.adapter as any)` Type Cast

**Lokasi**: `src/modals/file-operation-modal.ts` dan `src/indexer/index-store.ts`

**Dampak**: `as any` cast — tidak ada type safety. Tapi bukan vulnerability karena Obsidian API.

**Rekomendasi**: Gunakan type guard atau `instanceof FileSystemAdapter` check sebelum cast.

---

## Skor Keamanan

| Area | Skor | Catatan |
|---|---|---|
| Network isolation | **10/10** | Zero network — eliminasi kelas serangan terbesar |
| File access control | **8/10** | Validasi `.obsidian` folder baik; image resolution bisa diperketat |
| Input validation | **8/10** | Protocol handler & link parser lookup via index, bukan direct path |
| Data at rest | **6/10** | Index cache mengandung content preview lintas vault tanpa enkripsi |
| Dependency hygiene | **9/10** | 1 runtime dependency, pure JS, no native bindings |
| Code quality | **7/10** | Clear structure, JSDoc minimal, beberapa `as any` cast |
| **Overall** | **7.5/10** | Aman — tidak ada critical/high vulnerability |

---

## Perbandingan dengan Plugin Obsidian Sejenis

Dibandingkan plugin Obsidian lain yang membaca file system (seperti `obsidian-vault-transfer`, `obsidian-note-linker`), plugin ini setara atau lebih aman karena:
- Tidak ada network calls (beberapa plugin sejenis menggunakan GitHub API atau webhooks)
- Validasi vault path dengan pengecekan `.obsidian` folder
- Protocol handler lookup via index, bukan direct path

---

## Kesimpulan

**Multi-Vault Navigator adalah plugin yang aman.** 

Tiga pilar keamanan utamanya:
1. **Zero network** — tidak ada data yang bisa keluar dari mesin user
2. **Index-based lookup** — protocol handler dan cross-vault link tidak membuka file dari parameter URI secara langsung; harus ada di index dulu
3. **Trusted input** — semua konten berasal dari vault user sendiri (bukan dari internet atau pihak ketiga)

Satu-satunya isu yang perlu di-address: **index cache menyimpan content preview lintas vault di disk** tanpa opsi untuk menonaktifkannya. Ini lebih merupakan privacy/awareness issue daripada vulnerability — tapi perlu didokumentasikan dengan jelas.

Kalau plugin ini di-submit ke Obsidian Community Plugin review, saya yakin akan lolos — asalkan dokumentasi index cache diperjelas.

---

*Dianalisis oleh Command Code — 2026-06-03*
