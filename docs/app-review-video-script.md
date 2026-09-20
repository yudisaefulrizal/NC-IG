# Naskah Video Demo — App Review Meta

Reviewer Meta **tidak** mencoba aplikasinya sendiri; mereka hanya menonton
rekaman ini. Jadi setiap izin yang diajukan harus terlihat dipakai.

**Durasi target:** 3–5 menit
**Bahasa:** narasi/subtitle Inggris (reviewer umumnya berbahasa Inggris)
**Rekam:** satu take berkelanjutan, tanpa potongan atau fast-forward

---

## Persiapan sebelum merekam

- [ ] Login ke `https://nc-ig.nuscode.id` dengan akun `yudi@gmail.com`
- [ ] Pastikan address bar **selalu terlihat** sepanjang video
- [ ] Siapkan URL gambar untuk demo publish, misalnya
      `https://nc-ig.nuscode.id/sample.jpg`
- [ ] Klik tombol **Uji** di Meta Dashboard pada kolom `messages` dan
      `comments` lebih dulu, supaya `@akun_uji` sudah berisi data
- [ ] Tutup tab/notifikasi pribadi yang tidak perlu terlihat
- [ ] Rekam pada resolusi minimal 1280×720

---

## Bagian 1 — Pembuka (±20 detik)

**Tampilkan:** halaman login `https://nc-ig.nuscode.id/login.html`

> "This is NC-IG, a dashboard that helps Instagram business account owners
> manage their customer conversations and content in one place. I will
> demonstrate how the app uses each permission we are requesting."

Lalu login, dan tampilkan halaman Beranda.

> "After signing in, the dashboard shows every Instagram account the user
> has connected."

---

## Bagian 2 — `instagram_business_basic` (±40 detik)

**Tampilkan:** halaman **Koneksi**

> "To connect an account, the user clicks Connect Instagram and completes
> the official Instagram Business Login flow."

Klik **Connect Instagram**, lalu jalankan alur login Instagram sampai
kembali ke dashboard.

> "Once authorized, the app calls the `/me` endpoint to read only the
> account ID, username, and account type. We use this to identify which
> account is being managed, and to route incoming webhook notifications to
> the correct account. We do not read followers, media lists, or insights."

Tunjukkan akun yang baru terhubung muncul di daftar.

---

## Bagian 3 — `instagram_business_manage_messages` (±60 detik)

**Tampilkan:** halaman **DM**

> "This is the Direct Messages page. When someone sends a message to the
> business account, Meta sends a webhook notification on the `messages`
> field. The app verifies the signature, stores the message, and shows it
> here as a conversation."

Klik salah satu percakapan.

> "The account owner opens the conversation and replies manually from this
> form. The reply is sent through the `/messages` endpoint."

Ketik balasan, lalu kirim. Tunjukkan balasan muncul di percakapan.

> "Every reply is triggered manually by the account owner. The app never
> sends automated messages, never sends bulk messages, and never initiates
> a conversation with someone who has not messaged the business first."

Lalu tunjukkan dropdown **Template**.

> "To reply faster, the owner can save frequently used replies as
> templates. Selecting one fills the reply box, and the text can still be
> edited before sending. Sending always requires a manual action."

---

## Bagian 4 — `instagram_business_manage_comments` (±45 detik)

**Tampilkan:** halaman **Komentar**

> "This page shows comments left on the account's posts, delivered through
> the `comments` webhook field. Each comment is marked as either replied
> or not yet replied, so the owner can see what still needs attention."

Ketik balasan pada satu komentar, kirim, tunjukkan badge berubah jadi
"Sudah dibalas".

> "The reply is posted using the comment replies endpoint. As with
> messages, every reply is written and sent manually. The app does not
> auto-reply, and does not delete or hide anyone's comments."

---

## Bagian 5 — `instagram_business_content_publish` (±50 detik)

**Tampilkan:** halaman **Posts**

> "The app also lets the owner publish content to their own account."

Isi URL gambar dan caption, klik **Publish**.

> "The app creates a media container, waits for it to finish processing,
> then publishes it — the standard two-step Content Publishing flow."

Tunjukkan hasilnya muncul di riwayat dengan status Published.

Lalu buka halaman **Stories**, isi URL gambar, klik **Publish Story**.

> "Stories are published the same way, using the STORIES media type.
> Every publish is triggered manually. The app does not schedule posts or
> upload anything without the owner's action."

---

## Bagian 6 — Privasi & penutup (±25 detik)

**Tampilkan:** klik **Kebijakan Privasi** di sidebar

> "Our privacy policy is available from inside the app and publicly at
> nc-ig.nuscode.id/privacy. It explains exactly what data we store, why we
> store it, and three ways users can delete their data, including
> revoking access from Instagram settings."

Scroll ke bagian "Cara menghapus data Anda".

> "That covers all four permissions we are requesting. Thank you for
> reviewing our application."

---

## Yang membuat video ditolak

| Kesalahan | Hindari dengan |
|---|---|
| Izin diajukan tapi tidak terlihat dipakai | Pastikan keempat bagian di atas terekam |
| Video dipercepat di bagian login/izin | Rekam alur OAuth apa adanya |
| URL tidak terlihat | Jaga address bar tetap tampak |
| Data terlihat palsu/mockup | Pakai data nyata atau `@akun_uji` |
| Narasi hanya bahasa Indonesia | Tambahkan subtitle/narasi Inggris |

---

## Catatan tentang DM asli

Selama aplikasi masih **Standard Access**, Meta tidak mengirimkan pesan
dari pengguna umum — jadi percakapan nyata belum bisa tampil.

Untuk demo, pakai `@akun_uji` (dibuat lewat `npm run seed:test-connection`)
yang menampung payload dari tombol **Uji** di Meta Dashboard. Ini
memperlihatkan alur baca-balas secara jujur tanpa memalsukan data.

Reviewer memahami keterbatasan ini — justru itulah alasan pengajuan
Advanced Access diajukan.
