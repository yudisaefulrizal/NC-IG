# NC-IG

Sandbox/prototype untuk memahami dan membuktikan Instagram API resmi Meta
(Instagram API with Instagram Login / Business Login) secara end-to-end,
sebelum pola yang relevan diadaptasi ke NC-WA.

Project ini sengaja kecil dan terisolasi: hanya Instagram, tanpa Facebook,
tanpa WhatsApp, tanpa abstraksi multi-provider.

## Stack

- Node.js >= 22, TypeScript, Express 5
- SQLite (`better-sqlite3`) — satu file `data/nc-ig.sqlite`
- Tanpa framework frontend — 1 halaman HTML statis + fetch API

## Setup

```bash
npm install
cp .env.example .env
# isi .env: INSTAGRAM_APP_SECRET, PUBLIC_BASE_URL, INSTAGRAM_REDIRECT_URI,
# INSTAGRAM_WEBHOOK_VERIFY_TOKEN (lihat komentar di .env.example)
npm run dev
```

Server berjalan di port **8068** secara default (`PORT` di `.env`).

## Development dengan tunnel HTTPS

Instagram OAuth mewajibkan redirect URI HTTPS (localhost polos ditolak).
Untuk development, expose port lokal lewat `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:8068
```

Setiap kali quick tunnel menghasilkan URL baru, update:

1. `.env` → `PUBLIC_BASE_URL` dan `INSTAGRAM_REDIRECT_URI`
   (`${PUBLIC_BASE_URL}/auth/instagram/callback`)
2. Meta App Dashboard → Instagram → API setup with Instagram business login:
   - **OAuth redirect URI**: `<tunnel-url>/auth/instagram/callback`
   - **Deauthorize callback URL**: `<tunnel-url>/webhook/instagram/deauthorize`
   - **Data deletion request URL**: `<tunnel-url>/webhook/instagram/data-deletion`
   - **Webhook callback URL** (di menu Webhooks): `<tunnel-url>/webhook/instagram`

## Alur yang diimplementasikan

```
GET  /auth/instagram              -> redirect ke authorize Instagram (+ state CSRF)
GET  /auth/instagram/callback     -> tukar code -> short-lived -> long-lived token,
                                      ambil profil, simpan connection
GET  /webhook/instagram           -> verifikasi webhook (hub.challenge)
POST /webhook/instagram           -> terima event, verifikasi X-Hub-Signature-256
POST /webhook/instagram/deauthorize    -> verifikasi signed_request, tandai revoked
POST /webhook/instagram/data-deletion  -> verifikasi signed_request, hapus data,
                                           balas { url, confirmation_code }
GET  /api/connection/status       -> status koneksi untuk UI (tanpa token)
POST /api/connection/test-api     -> panggil GET /me untuk bukti token hidup
POST /api/connection/test-publish -> create container -> publish (Content Publishing API)
POST /api/connection/disconnect   -> tandai connection revoked secara lokal
```

## Referensi resmi Meta yang dipakai

- Business Login for Instagram: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
- Access Token (exchange & refresh): https://developers.facebook.com/documentation/instagram-platform/reference/access_token
- Webhooks: https://developers.facebook.com/documentation/instagram-platform/webhooks
- Content Publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Data Deletion Callback: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/

## Catatan keamanan

- `INSTAGRAM_APP_SECRET` dan access token hanya dipakai server-side, tidak
  pernah dikirim ke browser atau ditulis penuh ke log.
- `.env` masuk `.gitignore`; `.env.example` tidak berisi secret asli.
- OAuth state disimpan di DB dan langsung dikonsumsi (sekali pakai) untuk
  mencegah CSRF pada callback.
- Webhook event dan deauthorize/data-deletion callback diverifikasi
  signature-nya sebelum diproses.
- `image_url` pada Test Publish harus bisa diakses publik oleh server Meta —
  ini hanya berfungsi saat `PUBLIC_BASE_URL` menunjuk ke tunnel/domain yang
  benar-benar aktif.

## TODO lanjutan

- Endpoint/scheduler untuk refresh token otomatis sebelum 60 hari.
- Halaman/log viewer sederhana untuk `webhook_events`.
- Setelah pola ini stabil, adaptasi bagian yang relevan ke NC-WA.
