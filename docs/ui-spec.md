# NC-IG — Spesifikasi UI/UX (draft sebelum mockup)

Dokumen ini mendaftar setiap halaman dashboard NC-IG, isi kontennya, dan
fungsi tiap tombol/elemen interaktif — sebagai acuan sebelum membuat
mockup visual.

**Model akses:** 1 operator login (single admin), yang bisa connect dan
mengelola **beberapa akun Instagram sekaligus**. Semua halaman kerja (DM,
Comments, Posts, Stories) beroperasi atas **satu akun aktif** yang sedang
dipilih — bukan gabungan semua akun sekaligus.

---

## 0. Login (`/login.html`)

**Tujuan:** gerbang akses tunggal sebelum masuk dashboard.

**Isi:**
- Judul aplikasi "NC-IG"
- Form: 1 field password (tanpa username — single operator)
- Pesan error inline kalau password salah

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Field password | Input teks, fokus otomatis saat halaman dibuka |
| Tombol "Login" | Submit form → sukses: masuk ke dashboard; gagal: tampilkan pesan error di bawah form |

**Catatan desain:** halaman ini publik (tidak perlu nav dashboard), layout terpusat, minimal.

---

## Pemilih akun (account switcher) — elemen global baru

**Tujuan:** menentukan akun Instagram mana yang sedang dikelola di halaman kerja (DM, Comments, Posts, Stories). Tampil di nav/header, di semua halaman dashboard kecuali Login dan Connection (Connection menampilkan semua akun sekaligus, bukan satu per satu).

**Isi:**
- Dropdown/selector berisi daftar akun yang sudah terhubung, tiap opsi menampilkan `@username` + avatar/inisial
- Akun yang sedang aktif ditandai jelas (tercentang/highlight)
- Kalau belum ada akun sama sekali: selector diganti tombol "+ Hubungkan Akun" yang mengarah ke Connection

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Pilih akun di dropdown | Ganti akun aktif → halaman kerja saat ini reload dengan data akun yang baru dipilih (DM/Comments/Posts/Stories masing-masing scoped ke akun ini) |
| "+ Hubungkan Akun" (di ujung dropdown) | Navigasi ke Connection untuk tambah akun baru |

**Catatan:** akun aktif ini "diingat" selama sesi berjalan (pindah halaman tidak mereset pilihan), sampai operator ganti akun lain atau logout.

---

## 1. Home (`/`)

**Tujuan:** ringkasan lintas-akun, titik masuk ke halaman lain.

**Isi:**
- Nav utama (link ke 5 halaman dashboard lain) + pemilih akun
- Ringkasan seluruh akun terhubung dalam bentuk daftar/kartu kecil, tiap kartu: `@username`, tanggal token expire, indikator sehat/bermasalah (mis. token mendekati expire)
- Kalau belum ada akun: pesan "Belum ada akun Instagram terhubung" + tombol ke Connection

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Nav item | Navigasi ke halaman lain |
| Klik kartu akun | Jadikan akun itu sebagai akun aktif, lalu navigasi ke Connection (lihat detail) |
| Tombol "Logout" | Akhiri sesi, kembali ke Login |

---

## 2. Connection (`/connection.html`)

**Tujuan:** kelola daftar akun Instagram — tambah akun baru, lihat detail tiap akun, uji, putuskan koneksi. Halaman ini **tidak pakai pemilih akun global** — di sini semua akun tampil sekaligus sebagai daftar.

**Isi:**
- Tombol "+ Hubungkan Akun Baru" di bagian atas
- Daftar akun terhubung, tiap baris/kartu:
  - Username, Account ID, daftar scope/permission yang di-grant, tanggal token expire
  - Tombol aksi per akun: Test API, Test Publish, Disconnect
  - Area hasil (JSON mentah) muncul di bawah kartu akun terkait setelah Test API/Test Publish diklik

**State kosong:** kalau belum ada akun sama sekali, hanya tampil tombol "+ Hubungkan Akun Baru" dengan pesan penjelas singkat.

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| "+ Hubungkan Akun Baru" | Mulai proses OAuth Meta untuk menghubungkan akun Instagram baru, kembali ke Connection setelah selesai dengan akun baru muncul di daftar |
| "Test API" (per akun) | Panggil test terhadap akun itu spesifik, tampilkan hasil JSON — bukti token masih hidup |
| "Test Publish" (per akun) | Publish gambar contoh ke feed akun itu — smoke test cepat |
| "Disconnect" (per akun) | Putuskan koneksi akun itu secara lokal, hilang dari daftar & dari pilihan di pemilih akun |

---

## 3. DM (`/dm.html`)

**Tujuan:** baca & balas pesan langsung (Direct Message) untuk akun yang sedang aktif.

**Isi (layout 2 kolom):**
- Nav + pemilih akun di atas
- **Kolom kiri — daftar thread:** list kontak yang pernah chat DENGAN AKUN AKTIF, diurut pesan terbaru. Tiap item: `@username` (atau ID mentah kalau username belum diketahui)
- **Kolom kanan — percakapan aktif:** bubble chat (inbound rata kiri abu-abu, outbound rata kanan biru), form balas di bawah

**State kosong:** "Belum ada percakapan untuk akun ini" (kolom kiri), "Pilih percakapan di sebelah kiri" (kolom kanan, sebelum ada thread dipilih)

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Item thread di list kiri | Klik → buka percakapan itu di kolom kanan |
| Field teks + "Kirim" | Submit → pesan terkirim atas nama akun aktif, muncul di bubble kanan |

**Catatan penting:** ganti akun aktif di pemilih akun harus langsung mengganti isi daftar thread & percakapan yang tampil (tidak tercampur antar akun). Kirim bisa gagal kalau di luar 24 jam customer service window Instagram — pesan error dari API harus ditampilkan apa adanya, bukan disamarkan.

---

## 4. Comments (`/comments.html`)

**Tujuan:** lihat & balas komentar baru yang masuk pada media/post milik akun yang sedang aktif.

**Isi:**
- Nav + pemilih akun di atas
- List komentar UNTUK AKUN AKTIF (murni reaktif dari webhook — tidak ada fitur "pilih post dulu"), tiap item:
  - `@username` pengomentar
  - Badge status: `unreplied` (kuning) / `replied` (hijau, item jadi pudar/dim)
  - Teks komentar
  - Form balas inline (hanya muncul kalau status `unreplied`)

**State kosong:** "Belum ada komentar masuk untuk akun ini"

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Field teks + "Balas" (per komentar) | Submit → balasan terkirim atas nama akun aktif, status komentar berubah jadi `replied` |

**Catatan:** hanya bisa balas komentar tingkat atas (bukan nested reply) — batasan resmi dari Meta.

---

## 5. Posts (`/posts.html`)

**Tujuan:** publish foto ke feed Instagram (atas nama akun aktif) dengan caption, lihat riwayat post per akun.

**Isi:**
- Nav + pemilih akun di atas
- **Form publish:**
  - Field URL gambar (wajib, harus publicly accessible)
  - Field caption (opsional)
  - Tombol "Publish"
- **Riwayat** UNTUK AKUN AKTIF (list, terbaru di atas): tiap item punya badge status (`published` hijau / `failed` merah), caption, preview gambar, pesan error kalau gagal

**State kosong:** "Belum ada post untuk akun ini"

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Tombol "Publish" | Submit form → publish ke feed akun aktif → tersimpan ke riwayat akun itu (sukses ATAU gagal, dua-duanya dicatat) |

**Catatan UX:** proses publish bisa makan beberapa detik (create → poll → publish) — perlu indikator loading yang jelas selama proses berlangsung, bukan cuma freeze form. Ganti akun aktif harus mengganti isi riwayat yang tampil.

---

## 6. Stories (`/stories.html`)

**Tujuan:** publish foto ke Instagram Story (atas nama akun aktif), lihat riwayat per akun.

**Isi:**
- Nav + pemilih akun di atas
- **Form publish:**
  - Field URL gambar (wajib)
  - **Tidak ada field caption** — Stories tidak mendukungnya
  - Catatan kecil: story akan expire 24 jam di Instagram (riwayat lokal tetap tersimpan permanen sebagai catatan histori)
  - Tombol "Publish Story"
- **Riwayat** UNTUK AKUN AKTIF: sama pola dengan Posts, tanpa kolom caption

**State kosong:** "Belum ada story untuk akun ini"

**Tombol/aksi:**
| Elemen | Aksi |
|---|---|
| Tombol "Publish Story" | Submit → publish story atas nama akun aktif → tersimpan ke riwayat akun itu |

---

## Elemen global (di semua halaman dashboard, kecuali Login)

| Elemen | Fungsi |
|---|---|
| Nav (Home, Connection, DM, Comments, Posts, Stories) | Navigasi antar halaman, item aktif ditandai visual |
| Pemilih akun | Tentukan akun Instagram aktif untuk halaman kerja (semua kecuali Home & Connection) |
| Tombol "Logout" (footer) | Akhiri sesi, kembali ke Login |

## Yang sengaja TIDAK ada (di luar scope saat ini)

- Multi-user/multi-operator (tetap 1 login admin — yang multi adalah akun Instagram-nya, bukan siapa yang login)
- Melihat DM/Comments/Posts dari SEMUA akun sekaligus dalam satu tampilan gabungan (harus pilih 1 akun aktif dulu)
- Auto-reply/bot untuk DM
- Browsing daftar media untuk pilih post yang mau dilihat komentarnya (Comments murni reaktif dari webhook)
- Upload file gambar langsung (Posts/Stories pakai URL manual, bukan upload)
- Nested reply pada Comments
- Video/carousel untuk Posts, atau Story selain gambar
