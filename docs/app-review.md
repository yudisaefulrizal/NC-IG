# NC-IG — Materi Pengajuan App Review Meta

Dokumen ini berisi teks siap pakai untuk mengisi form App Review di
Meta App Dashboard, plus catatan teknis pendukungnya.

**Data aplikasi:**

| Item | Nilai |
|---|---|
| Nama aplikasi | nuscode.id-IG |
| ID Aplikasi (Facebook) | 1146288614248060 |
| ID Aplikasi Instagram | 1678543236846823 |
| URL Kebijakan Privasi | https://nc-ig.nuscode.id/privacy |
| URL Penghapusan Data | https://nc-ig.nuscode.id/webhook/instagram/data-deletion |
| Webhook callback | https://nc-ig.nuscode.id/webhook/instagram |
| OAuth redirect URI | https://nc-ig.nuscode.id/auth/instagram/callback |

**Izin yang diajukan (4):**

1. `instagram_business_basic`
2. `instagram_business_manage_messages`
3. `instagram_business_manage_comments`
4. `instagram_business_content_publish`

> Catatan: token akun yang tersimpan saat ini masih mencantumkan
> `instagram_business_manage_insights`, sisa dari konfigurasi lama. Izin
> ini **tidak dipakai sama sekali** oleh kode NC-IG dan sudah tidak diminta
> lagi saat OAuth (lihat `SCOPES` di `src/instagram/oauth.ts`). **Jangan
> ajukan izin ini** — meminta izin yang tidak terpakai adalah salah satu
> alasan umum penolakan. Izin tersebut akan hilang dengan sendirinya
> setelah akun dihubungkan ulang.

---

## 1. `instagram_business_basic`

### Bagaimana aplikasi menggunakan izin ini

> NC-IG menggunakan izin ini untuk mengidentifikasi akun Instagram
> profesional yang dihubungkan pengguna ke aplikasi kami. Setelah pengguna
> menyelesaikan alur Business Login, kami memanggil endpoint `GET /me`
> dengan field `user_id`, `username`, dan `account_type` satu kali untuk
> menyimpan identitas akun tersebut.
>
> Data ini diperlukan karena NC-IG mendukung pengelolaan beberapa akun
> Instagram dalam satu dasbor. Tanpa izin ini, aplikasi tidak dapat
> membedakan akun mana yang sedang dikelola, tidak dapat menampilkan nama
> akun pada pemilih akun di antarmuka, dan tidak dapat memetakan notifikasi
> webhook yang masuk ke akun yang tepat. Izin ini juga menjadi prasyarat
> teknis bagi ketiga izin lain yang kami ajukan.
>
> Kami tidak mengambil data profil lain seperti jumlah pengikut, daftar
> media, atau data wawasan (insights).

**Bukti teknis:** `src/instagram/client.ts` → `GET https://graph.instagram.com/me?fields=user_id,username,account_type`

---

## 2. `instagram_business_manage_messages`

### Bagaimana aplikasi menggunakan izin ini

> NC-IG adalah alat bantu layanan pelanggan. Izin ini dipakai agar pemilik
> akun bisnis dapat membaca dan membalas pesan langsung yang masuk ke
> akunnya sendiri, dari satu dasbor terpadu.
>
> Alurnya: ketika seorang pengguna Instagram mengirim pesan ke akun bisnis
> milik pengguna kami, Meta mengirimkan notifikasi webhook pada kolom
> `messages` ke server kami. NC-IG memverifikasi tanda tangan
> `X-Hub-Signature-256` atas notifikasi tersebut, lalu menyimpan isi pesan,
> ID pesan, dan ID pengirim (Instagram-scoped ID) agar dapat ditampilkan
> dalam tampilan percakapan.
>
> Pemilik akun kemudian membaca pesan itu di halaman "Pesan Langsung" dan
> membalasnya langsung dari dasbor. Balasan dikirim melalui
> `POST /<IG_ID>/messages`. Setiap balasan selalu dipicu secara manual oleh
> pemilik akun — NC-IG tidak mengirim pesan otomatis, tidak melakukan
> pengiriman massal, dan tidak memulai percakapan dengan pengguna yang
> belum pernah menghubungi akun tersebut.
>
> Untuk mempercepat respons, tersedia fitur "Template Balasan": pemilik
> akun dapat menyimpan teks yang sering dipakai (misalnya jam operasional
> atau informasi pengiriman) dan memilihnya saat membalas. Teks template
> tetap dapat disunting sebelum dikirim, dan pengiriman tetap memerlukan
> tindakan manual.
>
> Tanpa izin ini, fitur utama aplikasi tidak dapat berfungsi sama sekali.

**Bukti teknis:**
- Terima: webhook kolom `messages` → `src/routes/webhook.ts` (verifikasi HMAC-SHA256 di `src/instagram/webhookSignature.ts`)
- Kirim: `src/instagram/messaging.ts` → `POST https://graph.instagram.com/v23.0/<IG_ID>/messages`
- Antarmuka: `src/public/dm.html`

---

## 3. `instagram_business_manage_comments`

### Bagaimana aplikasi menggunakan izin ini

> Izin ini dipakai agar pemilik akun bisnis dapat memoderasi dan membalas
> komentar pada unggahan miliknya sendiri dari dalam dasbor NC-IG.
>
> Ketika ada komentar baru pada konten pengguna kami, Meta mengirimkan
> notifikasi webhook pada kolom `comments`. NC-IG memverifikasi tanda
> tangannya, lalu menyimpan isi komentar, ID komentar, nama pengguna
> pengirim, dan ID media terkait.
>
> Komentar ditampilkan di halaman "Komentar" dengan penanda status "Belum
> dibalas" atau "Sudah dibalas", sehingga pemilik akun dapat melihat mana
> yang masih perlu ditanggapi. Balasan dikirim melalui
> `POST /<IG_COMMENT_ID>/replies`.
>
> Seperti pada fitur pesan, setiap balasan komentar dipicu manual oleh
> pemilik akun. NC-IG tidak membalas komentar secara otomatis dan tidak
> menghapus atau menyembunyikan komentar siapa pun.
>
> Manfaatnya bagi pengguna: mereka tidak perlu berpindah-pindah antara
> aplikasi Instagram dan alat lain untuk memastikan tidak ada komentar
> pelanggan yang terlewat.

**Bukti teknis:**
- Terima: webhook kolom `comments` → `src/routes/webhook.ts`
- Kirim: `src/instagram/comments.ts` → `POST https://graph.instagram.com/v23.0/<IG_COMMENT_ID>/replies`
- Antarmuka: `src/public/comments.html`

---

## 4. `instagram_business_content_publish`

### Bagaimana aplikasi menggunakan izin ini

> Izin ini dipakai agar pemilik akun bisnis dapat mempublikasikan konten
> ke akun Instagram miliknya sendiri langsung dari dasbor NC-IG, tanpa
> berpindah ke aplikasi Instagram.
>
> NC-IG mendukung dua jenis publikasi:
>
> 1. **Unggahan feed** — pengguna memasukkan URL gambar dan teks keterangan
>    (opsional), lalu menekan tombol Publish.
> 2. **Stories** — pengguna memasukkan URL gambar, lalu menekan Publish
>    Story. Konten dipublikasikan dengan `media_type=STORIES`.
>
> Keduanya memakai alur dua langkah resmi dari Content Publishing API:
> `POST /<IG_ID>/media` untuk membuat container, lalu memeriksa
> `status_code` container hingga bernilai `FINISHED`, dan terakhir
> `POST /<IG_ID>/media_publish` untuk mempublikasikannya.
>
> Setiap publikasi dipicu manual oleh pemilik akun melalui formulir di
> dasbor. NC-IG tidak menjadwalkan unggahan otomatis, tidak mengunggah
> konten tanpa perintah, dan hanya mempublikasikan ke akun yang telah
> dihubungkan sendiri oleh pengguna.
>
> Riwayat publikasi (berhasil maupun gagal) disimpan agar pengguna dapat
> menelusuri apa yang sudah diunggah dan mendiagnosis kegagalan.

**Bukti teknis:**
- `src/instagram/publish.ts` → `POST /<IG_ID>/media`, `GET /<container-id>?fields=status_code`, `POST /<IG_ID>/media_publish`
- Antarmuka: `src/public/posts.html`, `src/public/stories.html`

---

## Alur untuk video demo (screencast)

Meta mewajibkan video yang memperlihatkan alur nyata. Reviewer **tidak**
mencoba aplikasinya sendiri — mereka hanya menonton rekaman ini, jadi
setiap izin yang diajukan harus terlihat dipakai.

Rekam satu video berkelanjutan (tanpa potongan), urutannya:

1. **Login** — buka `https://nc-ig.nuscode.id/login.html`, masuk dengan
   email dan kata sandi.
2. **Hubungkan akun** — buka halaman Koneksi, klik "Connect Instagram",
   selesaikan alur Business Login Instagram, dan perlihatkan akun berhasil
   muncul di daftar. *(memperlihatkan `instagram_business_basic`)*
3. **Pesan langsung** — buka halaman DM, tunjukkan percakapan masuk, buka
   satu percakapan, ketik balasan, kirim, dan perlihatkan balasan itu
   muncul. *(memperlihatkan `instagram_business_manage_messages`)*
4. **Template balasan** — buka menu Template Balasan, buat satu template,
   lalu kembali ke DM dan gunakan template itu untuk membalas.
5. **Komentar** — buka halaman Komentar, tunjukkan komentar masuk, ketik
   balasan, kirim, dan perlihatkan statusnya berubah menjadi "Sudah
   dibalas". *(memperlihatkan `instagram_business_manage_comments`)*
6. **Publikasi** — buka halaman Posts, isi URL gambar dan keterangan,
   klik Publish, perlihatkan hasilnya di riwayat. Ulangi singkat di
   halaman Stories. *(memperlihatkan `instagram_business_content_publish`)*

**Tips agar tidak ditolak:**
- Gunakan bahasa Inggris pada narasi/subtitle bila memungkinkan, atau
  sediakan terjemahan — reviewer Meta umumnya berbahasa Inggris.
- Perlihatkan URL di address bar sepanjang video, supaya jelas ini
  aplikasi nyata yang berjalan di domain terdaftar.
- Jangan mempercepat (fast-forward) bagian login dan pemberian izin.
- Pastikan pesan/komentar yang muncul adalah data nyata, bukan mockup.

---

## Catatan penting sebelum submit

1. **Ajukan tepat 4 izin di atas saja.** Jangan tambahkan
   `instagram_business_manage_insights` walaupun izin itu masih terlihat
   pada token akun yang tersimpan sekarang — kode tidak memakainya dan
   scope OAuth sudah tidak memintanya.

2. **Akun `kreavhome` perlu dihubungkan ulang.** Tokennya menjadi tidak
   valid setelah tipe akun diubah dari Creator ke Business. Menghubungkan
   ulang sekaligus membersihkan sisa izin `insights` pada token.

3. **Kedua akun harus bertipe Business**, bukan Creator. Akun `nuscode.id`
   sudah diverifikasi bertipe `BUSINESS`.

4. **Business Verification** kemungkinan diminta Meta bersamaan dengan
   Advanced Access. Siapkan dokumen legal usaha bila diminta.

5. Pastikan aplikasi **sedang berjalan dan dapat diakses publik** selama
   masa peninjauan, karena reviewer dapat membuka URL yang didaftarkan.
