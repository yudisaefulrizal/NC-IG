# Checklist Kesiapan App Review Meta — NC-IG

Diperiksa: 20 September 2026

Status:
- ✅ **Sudah** — terverifikasi langsung (dicek ke server/API/database)
- ⬜ **Belum** — masih harus dikerjakan
- ❓ **Perlu dicek sendiri** — hanya bisa dilihat dari Meta App Dashboard

---

## A. Aplikasi berjalan & dapat diakses

| | Item | Bukti |
|---|---|---|
| ✅ | Aplikasi live di domain terdaftar | `https://nc-ig.nuscode.id` → HTTP 200 |
| ✅ | Halaman login dapat diakses publik | `/login.html` → 200 |
| ✅ | Halaman daftar dapat diakses publik | `/register.html` → 200 |
| ✅ | Health check berfungsi | `/health` → `{"ok":true}` |
| ✅ | Berjalan di HTTPS | Cloudflare + sertifikat aktif |

> Aplikasi **wajib tetap hidup** selama masa peninjauan. Reviewer bisa
> membuka URL kapan saja; kalau mati saat dicek, pengajuan ditolak.

## B. Kebijakan Privasi & penghapusan data

| | Item | Bukti |
|---|---|---|
| ✅ | Halaman Kebijakan Privasi tersedia | `/privacy` → 200, tanpa login |
| ✅ | Isi sesuai data yang benar-benar disimpan | Disusun dari skema tabel, bukan template |
| ✅ | Mencantumkan cara menghapus data | 3 cara: Instagram, dasbor, email |
| ✅ | Tertaut dari dalam aplikasi | Sidebar + halaman login & daftar |
| ✅ | Endpoint Data Deletion Callback aktif | `/webhook/instagram/data-deletion` merespons |
| ❓ | URL privasi didaftarkan di dashboard | Pengaturan aplikasi → Dasar |
| ❓ | URL penghapusan data didaftarkan | Pengaturan aplikasi → Dasar |

## C. Konfigurasi teknis Instagram

| | Item | Bukti |
|---|---|---|
| ✅ | Kedua akun bertipe **BUSINESS** | `account_type: BUSINESS` (nuscode.id & kreavhome) |
| ✅ | Akun terhubung via Business Login | 2 koneksi aktif + 1 koneksi uji |
| ✅ | Webhook callback terverifikasi | Handshake `hub.challenge` → 200 |
| ✅ | Langganan webhook `messages` aktif | Terdaftar di kedua akun |
| ✅ | Verifikasi tanda tangan webhook | HMAC-SHA256 `X-Hub-Signature-256` |
| ✅ | App secret sinkron server ↔ dashboard | Payload bertanda tangan diterima (200) |
| ✅ | OAuth redirect URI cocok | Alur connect berhasil dipakai |
| ❓ | Kolom "Verifikasi token" benar di dashboard | Harus `ed3f7ea98f4b1575e25a89b35ed5760a` |

## D. Fitur yang diklaim benar-benar berfungsi

| | Fitur | Izin terkait | Bukti |
|---|---|---|---|
| ✅ | Hubungkan akun Instagram | `instagram_business_basic` | 2 akun asli terhubung |
| ✅ | Tampilkan & balas DM | `..._manage_messages` | Tampilan terbukti; kirim terbukti (API menerima request) |
| ✅ | Tampilkan & balas komentar | `..._manage_comments` | Komentar uji tampil + form balas |
| ✅ | Publish feed | `..._content_publish` | 2 post asli terbit |
| ✅ | Publish Stories | `..._content_publish` | 1 story asli terbit |
| ✅ | Template balasan | — | CRUD teruji, terpasang di DM & komentar |
| ✅ | Multi-akun dengan isolasi data | — | User biasa tidak melihat koneksi milik orang lain |

## E. Materi pengajuan

| | Item | Keterangan |
|---|---|---|
| ✅ | Justifikasi tiap izin | `docs/app-review.md`, dipetakan ke endpoint nyata |
| ✅ | Daftar izin final (4, tanpa insights) | Sudah ditentukan |
| ✅ | Skenario video demo | Tertulis langkah demi langkah |
| ⬜ | **Video screencast** | **Harus direkam sendiri** |
| ⬜ | Ikon aplikasi 1024×1024 | Sumber siap: `docs/logo.png` (1203×1203, persegi) — tinggal diperkecil & diunggah |
| ❓ | Kategori & deskripsi aplikasi terisi | Pengaturan aplikasi → Dasar |
| ❓ | Business Verification | Mungkin diminta bersamaan |

---

## Yang tersisa sebelum submit

**1. Rekam video demo** ⬜ — satu-satunya pekerjaan besar yang tersisa.
Panduan lengkapnya ada di `docs/app-review.md`. Gunakan `@akun_uji` untuk
memperlihatkan DM & komentar, karena DM asli masih terblokir Standard
Access.

**2. Cek 5 item ❓ di Meta App Dashboard** — tidak bisa saya periksa dari
sini karena butuh akses dashboard:

- Pengaturan aplikasi → Dasar: URL privasi, URL penghapusan data,
  kategori, deskripsi, ikon
- Webhooks: pastikan kolom "Verifikasi token" berisi
  `ed3f7ea98f4b1575e25a89b35ed5760a` (bukan access token)

**3. Ajukan 4 izin saja:**
`instagram_business_basic`, `instagram_business_manage_messages`,
`instagram_business_manage_comments`, `instagram_business_content_publish`

Jangan sertakan `instagram_business_manage_insights` — tidak dipakai kode
mana pun.

---

## Hal yang sering bikin ditolak (sudah aman di NC-IG)

| Penyebab umum penolakan | Status |
|---|---|
| Privacy Policy tidak bisa dibuka / ter-redirect ke login | ✅ Aman — publik, 200 |
| Aplikasi mati saat ditinjau | ⚠️ Jaga tetap hidup |
| Meminta izin yang tidak dipakai | ✅ Aman — hanya 4 izin terpakai |
| Video tidak memperlihatkan izin yang diminta | ⬜ Pastikan saat merekam |
| Fitur yang diklaim tidak ada di aplikasi | ✅ Aman — semua terbukti berfungsi |
| Deskripsi izin terlalu umum / template | ✅ Aman — ditulis spesifik per endpoint |
