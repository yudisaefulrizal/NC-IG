// Verifikasi header X-Hub-Signature-256 pada webhook event POST.
// Meta menandatangani RAW BODY (byte mentah sebelum JSON.parse) dengan
// HMAC-SHA256 memakai App Secret. Karena itu express harus dikonfigurasi
// untuk menyimpan raw body sebelum parsing (lihat server.ts).
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expectedHex = signatureHeader.slice("sha256=".length);
  const expected = Buffer.from(expectedHex, "hex");

  const actual = createHmac("sha256", config.instagramAppSecret).update(rawBody).digest();

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
