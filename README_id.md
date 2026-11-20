# Multi-Vault Navigator

**Multi-Vault Navigator** adalah plugin Obsidian *local-first* yang didesain untuk menjembatani batasan antar vault. Jika kamu menggunakan beberapa vault (misal: vault pekerjaan, vault personal, dan vault penulisan), plugin ini memungkinkanmu untuk mencari, melihat, dan berpindah antar vault layaknya semuanya berada dalam satu *workspace* terpadu.

Dibuat oleh **Hir43th**.

---

## Fitur Utama

### Pencarian teks penuh & indeks yang selalu segar (2.4.0)
- **Cari seluruh isi catatan, bukan hanya judul.** Kata apa pun di catatan mana pun bisa ditemukan, dan tiap hasil menampilkan cuplikan yang dipotong di sekitar bagian yang cocok (sampai batas `Max indexed size per note`, default 200 KB, agar satu file raksasa tidak memperlambat apa pun).
- **Indeks inkremental.** *Refresh* hanya membaca ulang catatan yang berubah (berdasarkan waktu ubah dan ukuran). File yang tidak berubah tidak diparse lagi, jadi me-*refresh* ±5.000 catatan selesai jauh di bawah satu detik.
- **Pembaruan langsung.** Dengan **Watch vaults for changes** aktif, perubahan, file baru, dan penghapusan di vault mana pun yang aktif — termasuk yang dilakukan di luar Obsidian — muncul di pencarian dalam beberapa detik. Jika sistem tidak bisa memantau sebuah folder, plugin memeriksa ulang setiap satu menit.
- **Start cepat.** Indeks pencarian disimpan di *cache* (format v3), sehingga pencarian langsung siap setelah Obsidian dibuka. *Cache* lama dibuang dan dibangun ulang otomatis.
- **Pola exclude cocok per nama utuh.** Lihat [Pengaturan](#pengaturan-settings); ini memperbaiki `art` yang ikut menyembunyikan `smart/` dan `Article/`.

### 1. Google-like Search Page (Pencarian Lintas Vault)
Daripada harus mengingat di vault mana kamu menyimpan sebuah catatan, cukup gunakan **Search Page**.
- Buka melalui tombol kaca pembesar (🔍) di **Ribbon Sidebar** kiri.
- Tampilan berukuran penuh yang mirip mesin pencari modern.
- Menampilkan judul (biru), lokasi vault & path (hijau), serta cuplikan isi catatan (*snippet*).
- Memiliki sistem pembobotan cerdas (judul file diberi prioritas lebih tinggi daripada isi catatan).

### 2. Read-Only Cross-Vault View
Natively, Obsidian tidak mengizinkan kamu membuka catatan dari luar vault aktif ke dalam tab. Plugin ini mengatasinya dengan aman:
- Saat kamu mengklik hasil pencarian dari vault lain, catatan tersebut akan dibuka di **Tab baru** di vault kamu yang sekarang.
- Catatan ditampilkan dalam mode **Read-Only** (hanya baca) dengan *render* Markdown penuh, sehingga kamu bisa membaca referensi silang tanpa harus menutup vault utama dan berpindah konteks.

### 3. Auto-Detect Vaults
Kamu tidak perlu mendaftarkan vault kamu satu per satu. Saat pertama kali diaktifkan, plugin akan membaca konfigurasi global OS kamu dan mendeteksi semua vault Obsidian yang pernah kamu buka, lalu menambahkannya secara otomatis.

### 4. Recent Files (File Terakhir Dibuka)
Ingin melanjutkan pekerjaan yang kamu lakukan kemarin tapi lupa di vault mana? Gunakan perintah **Recent Files**.
- Menampilkan daftar catatan yang paling baru dimodifikasi dari *seluruh* vault yang kamu miliki.

### 5. Quick Switch Vault
Fitur pencarian cepat (Fuzzy Finder) untuk berpindah ke vault lain secara instan tanpa harus membuka Vault Manager bawaan Obsidian.

---

## Penggunaan & Commands

Buka **Command Palette** (Ctrl/Cmd + P) dan ketik `Multi-Vault Navigator` untuk melihat semua perintah yang tersedia:

- **Cross-Vault Command Center (Search Page)**: Tampilan utama (dashboard) untuk mencari catatan lintas vault, melihat *Pinned Notes*, dan *Saved Searches*. Klik ikon 🔍 di sidebar.
- **Natural Cross-Vault Links**: Tulis `[[VaultName::NamaCatatan]]` di catatan mana saja, dan tautan akan otomatis menjadi aktif dan bisa diklik untuk membuka catatan dari vault lain!
- **Find Duplicate Notes**: Pindai seluruh vault untuk menemukan catatan dengan judul yang persis sama, dan bandingkan isinya.
- **Search All Vaults**: Membuka popup modal (dropdown) untuk mencari ke seluruh vault dengan cepat.
- **Recent Files**: Membuka popup modal berisi daftar 50 file terakhir diubah dari semua vault.
- **Switch Vault**: Membuka popup modal untuk berpindah antar vault dengan cepat.
- **Move/Copy Current File to Vault**: Membuka popup untuk memindahkan (Move) atau menyalin (Copy) catatan yang sedang dibuka ke vault lain. **(Dilengkapi Inbox Router yang merekomendasikan vault tujuan berdasarkan Tag!)**.
- **Copy Cross-Vault Link for Current File**: Membuat tautan spesial (`obsidian://mvn-open...`) ke clipboard.
- **Open Global Tag Explorer**: Membuka tab yang menampilkan kumpulan seluruh *tag* dari semua vault.
- **Open Cross-Vault Daily Notes**: Membuka tab *dashboard* yang mengurutkan semua *daily notes* (format `YYYY-MM-DD`) dari semua vault.
- **Refresh Index**: Membaca ulang isi semua vault dan memperbarui *cache* pencarian secara manual.

---

## Pengaturan (Settings)

Di menu **Settings > Multi-Vault Navigator**, kamu dapat mengatur:
- **Daftar Vault**: Menghidupkan/mematikan indeks untuk vault tertentu, atau menghapus vault dari daftar.
- **Add Manual Vault**: Menambahkan absolute path (`C:/...` atau `/Users/...`) jika ada vault yang tidak terdeteksi otomatis.
- **Max Preview Characters**: Menentukan seberapa panjang cuplikan teks (*snippet*) yang disimpan untuk pencarian (default: 1000 karakter).
- **Full-text search** (default aktif): Mencari seluruh isi setiap catatan. Mengubahnya akan membaca ulang semua catatan.
- **Max indexed size per note (bytes)** (default 200000, minimal 1000): Hanya bagian awal catatan yang sangat besar yang dicari.
- **Watch vaults for changes** (default aktif): Memperbarui pencarian otomatis saat catatan di vault aktif mana pun berubah.
- **Store Snippets in Cache** (default aktif): Ikut menyimpan indeks pencarian yang dibangun dari isi catatanmu. Matikan jika folder konfigurasi vault aktif dibagikan atau dipublikasikan; indeks lalu dibangun ulang setiap kali start.
- **Global Exclude Patterns**: Daftar pola yang dipisahkan koma untuk diabaikan di seluruh vault (sangat berguna untuk menjaga privasi catatan tertentu). Pola dicocokkan dengan nama folder/file yang utuh, bukan sebagian nama:
  - `Private` mengecualikan folder atau catatan bernama `Private` (di kedalaman berapa pun, huruf besar/kecil bebas), tetapi tidak `Privateer/`.
  - `notes/archive` mengecualikan jalur folder itu di mana pun muncul.
  - `draft-*` dan `**/draft-*` memakai glob: `*` = karakter apa pun dalam satu nama, `?` = satu karakter, `**` = lintas folder.
  - **Berubah di 2.4.0:** dulu pola cocok dengan bagian mana pun dari jalur (`art` ikut mengecualikan `smart/` dan `Article/`). Jika kamu mengandalkan itu, tulis pola sebagai glob, misalnya `*art*`.
- **Refresh Index**: Tombol manual untuk membangun ulang indeks pencarian.

---

## Keamanan & Privasi (Local-First)

Plugin ini 100% **Local-First**:
- Tidak ada data yang dikirim ke internet atau *cloud*.
- Indeks pencarian disimpan secara lokal dalam bentuk `.json` di dalam folder plugin `.obsidian/plugins/multi-vault-navigator/` milik vault yang *aktif*. Sejak 2.4.0 indeks ini dibangun dari teks penuh catatanmu; jika folder konfigurasi itu kamu sinkronkan atau publikasikan, matikan **Store Snippets in Cache** (tidak ada isi catatan yang ditulis ke *cache*, indeks dibangun ulang setiap start).
- Sejak 2.4.0 plugin memantau folder vault yang aktif dengan `fs.watch` bawaan Node (hanya-baca: ia hanya tahu sebuah file berubah, lalu membaca ulang file itu). Bisa dimatikan di pengaturan.
- Memanfaatkan library `minisearch` yang sangat ringan dan berjalan sepenuhnya di memori komputermu tanpa aplikasi *server* eksternal.

---

## Pengembangan

- `npm test` menjalankan tes otomatis (test runner bawaan Node, tanpa dependensi tambahan).
- `npm run lint` dan `npm run build` harus selesai tanpa error. Setel `MVN_SKIP_COPY=1` untuk *build* tanpa menyalin file ke vault uji lokal milik pembuat.
- `node scripts/gen-fixture-vault.mjs <dir> 5000` membuat fixture sintetis 3 vault dan `node scripts/bench.mjs <dir>` mencetak angka kinerja (bukan bagian dari rilis).

---

## Pemasangan (Installation)

*(Untuk saat ini, plugin dipasang secara manual)*

1. Unduh atau *build* plugin ini. Pastikan kamu memiliki file `main.js`, `manifest.json`, dan `styles.css`.
2. Buat folder baru di dalam vault kamu: `<path-ke-vault-kamu>/.obsidian/plugins/multi-vault-navigator/`.
3. Salin ketiga file tersebut ke dalam folder yang baru dibuat.
4. Buka **Settings > Community plugins** di Obsidian.
5. Matikan **Safe mode** (jika masih menyala).
6. Nyalakan (*enable*) plugin **Multi-Vault Navigator**.
7. Klik lambang 🔍 di sidebar kiri dan nikmati pencarian lintas vault!
