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

### Link, embed, operator, peta, dan ringkasan lintas vault (2.5.0)

**Link `[[Vault::Note]]` di mana pun kamu menulis.** Sejak 2.5.0:
- **Live Preview dan mode Source** — `[[Vault::Note]]` tampil sebagai tautan (link ke catatan yang tidak ada di indeks bergaya *unresolved*). Klik membuka catatan hanya-baca (di tab yang sedang dipakai untuk catatan vault ini, di tampilan baca-saja untuk vault lain), **Ctrl/Cmd+klik** membuka tab baru, klik kanan membuka catatan di vault asalnya. Saat kursor berada di dalam teks mentah `[[...]]`, klik hanya menyunting teks; di mode Source hanya Ctrl/Cmd+klik yang membuka. Link di dalam blok kode tidak disentuh.
- **Autocomplete** — ketik `[[Work::` (nama vault terdaftar + `::`) untuk daftar catatan vault itu (fuzzy, maks 20); tambahkan `#` setelah nama catatan untuk daftar heading. Saran `[[` biasa tetap milik Obsidian.
- **Embed** — `![[Vault::Note]]` dan `![[Vault::Note#Heading]]` menampilkan catatan (atau hanya bagian heading itu) secara hanya-baca di Reading View dan Live Preview, dengan tombol **Open**. Embed di dalam embed dibatasi 2 tingkat sehingga dua catatan yang saling meng-embed tidak berputar tanpa henti. Di Live Preview embed tampil sebagai blok bila sendirian di barisnya dan kursor ada di tempat lain.

**Operator pencarian** (Command Center dan popup "Search all vaults"; daftar bantuan muncul di Command Center saat kotak kosong):

| Operator | Arti |
|---|---|
| `vault:Work` | hanya vault itu (`vault:"My Vault"` bila ada spasi; beberapa `vault:` berarti salah satunya) |
| `path:proyek` | path memuat teks itu (beberapa `path:` harus cocok semua) |
| `tag:ide` atau `#ide` | memiliki tag itu, termasuk tag bersarang (`#project` cocok dengan `#project/alpha`) |
| `-tag:draft`, `-vault:Old`, `-path:tmp` | kecualikan |
| `-kata`, `-"sebuah frasa"` | kecualikan catatan yang memuatnya |
| `modified:>7d` | diubah dalam 7 hari terakhir (satuan `h d w m y`; `m` = 30 hari) |
| `modified:<2026-01-01` | terakhir diubah sebelum tanggal itu (`>`, `>=`, `<=`, atau tanggal saja = hari itu) |
| `"frasa persis"` | kata-kata dalam urutan persis itu |

Operator bisa digabung, misalnya `rapat vault:Work tag:project -tag:draft modified:>30d`. Filter tanpa kata menampilkan semua catatan yang cocok, terbaru dulu. Bagian yang tidak dipahami diabaikan dan dilaporkan di atas hasil. *Saved search* kini menyimpan seluruh query, termasuk operator.

**Duplikat berdasarkan isi.** **Find Duplicate Notes** punya mode kedua, **Similar content**: mencari catatan yang isinya sebagian besar sama walau namanya berbeda (kemiripan minimum default 80%, bisa diatur mulai 50%). Ia membandingkan *shingle* 5 kata dengan MinHash lalu memverifikasi tiap pasangan kandidat secara tepat, menampilkan persentase kemiripan, berjalan bertahap agar Obsidian tetap responsif (ada tombol **Stop**), melewati catatan di bawah 8 kata, dan membandingkan maksimal 20.000 catatan. Tidak ada yang diubah atau dikirim ke mana pun.

**Peta lintas vault.** **Open cross-vault map** menggambar vault sebagai lingkaran (ukuran = jumlah catatan) dengan panah yang menghitung link `[[Vault::Note]]` dari satu vault ke vault lain. Klik panah untuk melihat dan membuka catatan penghubungnya. Link di dalam satu vault atau ke vault yang tidak diindeks tidak digambar. Start pertama setelah pembaruan membaca ulang semua catatan satu kali untuk mengumpulkan link ini.

**Ringkasan perubahan.** **Open Cross-Vault Daily Notes** kini diawali **What changed**: pilih *Today*, *Last 7 days*, atau *Custom range* untuk melihat catatan yang dibuat atau diubah, dikelompokkan per vault, beserta perkiraan jumlah kata yang bertambah. Catatan baru dihitung seluruh katanya; untuk catatan yang diubah, perkiraannya adalah pertumbuhan sejak versi terakhir yang pernah dilihat plugin sebelum periode itu (jadi baru tersedia setelah plugin pernah melihat catatan tersebut, dan total bisa bertuliskan "or more"). **Insert summary into active note** menulis ringkasan ke catatan yang sedang dibuka di vault *aktif* lewat Vault API Obsidian; menyisipkan lagi menggantikan ringkasan sebelumnya, bukan menambah baru. Tidak pernah menulis ke vault lain.

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
- **Find Duplicate Notes**: Pindai seluruh vault untuk menemukan catatan dengan judul yang persis sama atau isi yang mirip, dan bandingkan isinya.
- **Open Cross-Vault Map**: Membuka peta vault yang menunjukkan jumlah link `[[Vault::Note]]` antar vault.
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
- Plugin tidak pernah mengubah catatan di vault lain secara diam-diam. Penulisan hanya terjadi di vault aktif lewat Vault API Obsidian ("Copy to current vault & edit" dan, sejak 2.5.0, "Insert summary into active note"), atau saat kamu mengonfirmasi Move/Copy ke vault lain.
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
