# Multi-Vault Navigator 🧭

**Multi-Vault Navigator** adalah plugin Obsidian *local-first* yang didesain untuk menjembatani batasan antar vault. Jika kamu menggunakan beberapa vault (misal: vault pekerjaan, vault personal, dan vault penulisan), plugin ini memungkinkanmu untuk mencari, melihat, dan berpindah antar vault layaknya semuanya berada dalam satu *workspace* terpadu.

Dibuat oleh **Hir43th**.

---

## ✨ Fitur Utama

### 🔍 1. Google-like Search Page (Pencarian Lintas Vault)
Daripada harus mengingat di vault mana kamu menyimpan sebuah catatan, cukup gunakan **Search Page**.
- Buka melalui tombol kaca pembesar (🔍) di **Ribbon Sidebar** kiri.
- Tampilan berukuran penuh yang mirip mesin pencari modern.
- Menampilkan judul (biru), lokasi vault & path (hijau), serta cuplikan isi catatan (*snippet*).
- Memiliki sistem pembobotan cerdas (judul file diberi prioritas lebih tinggi daripada isi catatan).

### 📖 2. Read-Only Cross-Vault View
Natively, Obsidian tidak mengizinkan kamu membuka catatan dari luar vault aktif ke dalam tab. Plugin ini mengatasinya dengan aman:
- Saat kamu mengklik hasil pencarian dari vault lain, catatan tersebut akan dibuka di **Tab baru** di vault kamu yang sekarang.
- Catatan ditampilkan dalam mode **Read-Only** (hanya baca) dengan *render* Markdown penuh, sehingga kamu bisa membaca referensi silang tanpa harus menutup vault utama dan berpindah konteks.

### 🤖 3. Auto-Detect Vaults
Kamu tidak perlu mendaftarkan vault kamu satu per satu. Saat pertama kali diaktifkan, plugin akan membaca konfigurasi global OS kamu dan mendeteksi semua vault Obsidian yang pernah kamu buka, lalu menambahkannya secara otomatis.

### ⏱️ 4. Recent Files (File Terakhir Dibuka)
Ingin melanjutkan pekerjaan yang kamu lakukan kemarin tapi lupa di vault mana? Gunakan perintah **Recent Files**.
- Menampilkan daftar catatan yang paling baru dimodifikasi dari *seluruh* vault yang kamu miliki.

### 🚀 5. Quick Switch Vault
Fitur pencarian cepat (Fuzzy Finder) untuk berpindah ke vault lain secara instan tanpa harus membuka Vault Manager bawaan Obsidian.

---

## 🛠️ Penggunaan & Commands

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

## ⚙️ Pengaturan (Settings)

Di menu **Settings > Multi-Vault Navigator**, kamu dapat mengatur:
- **Daftar Vault**: Menghidupkan/mematikan indeks untuk vault tertentu, atau menghapus vault dari daftar.
- **Add Manual Vault**: Menambahkan absolute path (`C:/...` atau `/Users/...`) jika ada vault yang tidak terdeteksi otomatis.
- **Max Preview Characters**: Menentukan seberapa panjang cuplikan teks (*snippet*) yang disimpan untuk pencarian (default: 1000 karakter).
- **Global Exclude Patterns**: Daftar nama folder atau file yang dipisahkan koma (misal: `Private, Rahasia, diary.md`) agar tidak ikut terindeks di seluruh vault (sangat berguna untuk menjaga privasi catatan tertentu).
- **Refresh Index**: Tombol manual untuk membangun ulang indeks pencarian.

---

## 🔒 Keamanan & Privasi (Local-First)

Plugin ini 100% **Local-First**:
- Tidak ada data yang dikirim ke internet atau *cloud*.
- Indeks pencarian disimpan secara lokal dalam bentuk `.json` di dalam folder plugin `.obsidian/plugins/multi-vault-navigator/`.
- Memanfaatkan library `minisearch` yang sangat ringan dan berjalan sepenuhnya di memori komputermu tanpa aplikasi *server* eksternal.

---

## 🏗️ Pemasangan (Installation)

*(Untuk saat ini, plugin dipasang secara manual)*

1. Unduh atau *build* plugin ini. Pastikan kamu memiliki file `main.js`, `manifest.json`, dan `styles.css`.
2. Buat folder baru di dalam vault kamu: `<path-ke-vault-kamu>/.obsidian/plugins/multi-vault-navigator/`.
3. Salin ketiga file tersebut ke dalam folder yang baru dibuat.
4. Buka **Settings > Community plugins** di Obsidian.
5. Matikan **Safe mode** (jika masih menyala).
6. Nyalakan (*enable*) plugin **Multi-Vault Navigator**.
7. Klik lambang 🔍 di sidebar kiri dan nikmati pencarian lintas vault!
