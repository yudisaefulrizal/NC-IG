# NC-IG — Pencapaian & Target Berikutnya

Diperbarui: 20 September 2026

Dokumen ini untuk mengingatkan kembali posisi project saat pekerjaan
dilanjutkan nanti: apa yang sudah jalan, apa yang tertunda, dan kenapa.

---

## Ringkasan singkat

NC-IG adalah dashboard pengelolaan akun Instagram profesional: baca &
balas DM, balas komentar, publish post & story, dengan dukungan banyak
akun Instagram dalam satu login.

**Kondisi:** seluruh fitur inti sudah berfungsi dan terpakai dengan data
nyata. Yang menahan pemakaian penuh bukan kode, melainkan izin dari Meta
(butuh App Review).

**Live di:** https://nc-ig.nuscode.id (port lokal 8068)

---

## Yang sudah selesai

### Fitur aplikasi

| Fitur | Status | Catatan |
|---|---|---|
| Login & autentikasi | ✅ | Email + password, sesi tersimpan di DB (bisa dicabut server-side) |
| Pendaftaran akun | ✅ | Self-signup, role `user` |
| Dua tingkat akun | ✅ | `owner` (lihat semua koneksi) vs `user` (hanya miliknya) |
| Hubungkan akun Instagram | ✅ | OAuth Business Login, 2 akun asli terhubung |
| Multi-akun + pemilih akun | ✅ | Data antar akun terisolasi, sudah diuji negatif |
| Baca & balas DM | ✅ | Tampilan & pengiriman terbukti; penerimaan pesan asli masih terblokir Meta |
| Baca & balas komentar | ✅ | Badge status belum/sudah dibalas |
| Publish post | ✅ | 2 post nyata berhasil terbit |
| Publish story | ✅ | 1 story nyata berhasil terbit |
| Template balasan | ✅ | CRUD, terpasang di form DM & komentar |
| Kebijakan Privasi | ✅ | `/privacy`, publik, tertaut dari sidebar |

### Teknis

| Hal | Status |
|---|---|
| Database MySQL | ✅ 12 tabel, migrasi dari SQLite selesai tanpa kehilangan data |
| Webhook Instagram | ✅ Verifikasi tanda tangan HMAC-SHA256 |
| Isolasi data antar pengguna | ✅ Diuji: user biasa tidak bisa akses koneksi milik orang lain |
| Koneksi uji (`@akun_uji`) | ✅ Tombol "Uji" Meta jadi terlihat di dashboard |
| Desain antarmuka | ✅ Sidebar navy + design system, 10 halaman |

### Materi App Review

| Materi | Status | Berkas |
|---|---|---|
| Kebijakan Privasi | ✅ | `src/public/privacy.html` |
| Justifikasi 4 izin | ✅ | `docs/app-review.md` |
| Checklist kesiapan | ✅ | `docs/app-review-checklist.md` |
| Naskah video (Inggris) | ✅ | `docs/app-review-video-script.md` |
| Ikon aplikasi 1024×1024 | ✅ | `docs/app-icon-1024.png` |

---

## Target berikutnya

### 1. Rekam video demo — prioritas utama ⬜

Satu-satunya materi App Review yang belum ada. Naskahnya sudah lengkap di
`docs/app-review-video-script.md`; tinggal diikuti dari atas ke bawah
sambil merekam layar (±3–5 menit, narasi bahasa Inggris).

Pakai `@akun_uji` untuk mendemokan DM & komentar.

### 2. Lengkapi Meta App Dashboard ⬜

Tidak bisa diperiksa dari kode, harus dibuka sendiri:

- **Pengaturan aplikasi → Dasar**: URL privasi
  (`https://nc-ig.nuscode.id/privacy`), URL penghapusan data
  (`https://nc-ig.nuscode.id/webhook/instagram/data-deletion`), kategori,
  deskripsi, unggah `docs/app-icon-1024.png`
- **Webhooks**: pastikan kolom "Verifikasi token" berisi
  `ed3f7ea98f4b1575e25a89b35ed5760a` — saat terakhir dicek, isinya masih
  access token sehingga validasi gagal

### 3. Ajukan App Review ⬜

Ajukan **tepat 4 izin**: `instagram_business_basic`,
`instagram_business_manage_messages`,
`instagram_business_manage_comments`,
`instagram_business_content_publish`.

Jangan sertakan `instagram_business_manage_insights` — tidak dipakai kode
mana pun, dan meminta izin tak terpakai berisiko ditolak.

Selama masa peninjauan, **aplikasi wajib tetap hidup**.

---

## Kendala yang sedang menahan

### DM dari pengguna umum belum bisa diterima

Ini bukan bug. Sudah ditelusuri sampai tuntas dan dibuktikan dengan data.

**Yang terbukti sehat:** kode webhook (diuji dengan payload asli →
tersimpan sempurna), verifikasi tanda tangan, tipe akun BUSINESS,
langganan webhook aktif, konfigurasi dashboard, jalur Meta → server
(event `read` asli masuk berkali-kali).

**Yang tidak terjadi:** Meta tidak pernah mengirim event `message` untuk
DM sungguhan.

**Sebabnya:** aplikasi masih **Standard Access**, yang menurut dokumentasi
resmi "intended for apps that will only be used by people who have roles
on them". Meta meneruskan event tentang aktivitas akun sendiri (`read`),
tapi menahan isi pesan dari pihak lain.

**Jalan keluarnya:** hanya App Review. Tidak ada perbaikan kode yang bisa
membukanya.

---

## Catatan penting saat melanjutkan

### Akun

| Akun | Peran | Keterangan |
|---|---|---|
| `yudi@gmail.com` | owner | Akun utama, memiliki ketiga koneksi |
| `owner@nc-ig.local` | owner | Cadangan, password = `ADMIN_PASSWORD` lama di `.env` |

### Perintah yang sering dipakai

```bash
npm run dev                            # jalankan (port 8068)
npm run check                          # type-check
npm run migrate                        # buat/perbarui skema MySQL
npm run seed:test-connection           # buat @akun_uji
npm run seed:test-connection -- hapus  # hapus @akun_uji
```

### Jebakan yang pernah menghabiskan waktu

1. **Ganti `.env` tidak otomatis terbaca.** `tsx watch` hanya reload saat
   file `.ts` berubah. Setelah mengubah `.env` (terutama
   `INSTAGRAM_APP_SECRET`), **restart manual** — kalau tidak, webhook
   ditolak 403 tanpa penjelasan.

2. **Format tanggal MySQL.** `toISOString()` menghasilkan format yang
   ditolak kolom `DATETIME`. Sudah ditangani `toMysqlDatetime()` di
   `db.ts`; pakai itu bila menambah kolom tanggal baru.

3. **Ganti tipe akun Instagram mencabut token.** Setelah Creator →
   Business, akun harus dihubungkan ulang.

4. **Akun harus bertipe Business**, bukan Creator. Akun Creator tidak
   didukung penuh Messaging API.

---

## Ide untuk nanti (belum diputuskan)

Belum ada yang diminta; dicatat saja bila suatu saat relevan:

- Halaman kelola pengguna untuk owner (suspend/reset password)
- Penyegaran token otomatis sebelum masa berlaku 60 hari habis
- Notifikasi pesan/komentar baru tanpa perlu refresh
- Penggabungan dengan nc-wa-saas jadi satu produk multi-platform
  (sempat dibahas, sengaja ditunda sampai NC-IG matang)
