// Baca & validasi environment variable sekali di awal proses.
// Kalau ada yang wajib tapi kosong, gagal cepat (fail fast) dengan pesan jelas
// daripada error samar di tengah request nanti.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

export const config = {
  port: Number(optional("PORT", "8068")),
  host: optional("HOST", "127.0.0.1"),

  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/+$/, ""),

  instagramAppId: required("INSTAGRAM_APP_ID"),
  instagramAppSecret: required("INSTAGRAM_APP_SECRET"),
  instagramRedirectUri: required("INSTAGRAM_REDIRECT_URI"),
  instagramWebhookVerifyToken: required("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),

  dataDir: optional("DATA_DIR", "./data"),
};
