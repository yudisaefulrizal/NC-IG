// Verifikasi `signed_request` yang dikirim Meta ke Deauthorize Callback dan
// Data Deletion Request Callback. Format: "<signature>.<payload>", keduanya
// base64url tanpa padding.
//
// Algoritma (sesuai dokumentasi Meta untuk signed_request):
// 1. Pisah di titik pertama -> encodedSig, payload
// 2. Base64url-decode encodedSig -> signature mentah
// 3. Hitung HMAC-SHA256 atas string payload (yang masih ter-encode) memakai
//    App Secret sebagai key
// 4. Bandingkan (constant-time) dengan signature dari langkah 2
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export interface SignedRequestPayload {
  user_id?: string;
  algorithm: string;
  issued_at: number;
  expires?: number;
  [key: string]: unknown;
}

// Mengembalikan payload jika valid, atau null jika signature tidak cocok/format salah.
// Tidak pernah melempar exception untuk input tidak valid — pemanggil cukup
// menolak request dengan 4xx.
export function verifySignedRequest(signedRequest: string): SignedRequestPayload | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;

  let expectedSig: Buffer;
  try {
    expectedSig = base64UrlDecode(encodedSig);
  } catch {
    return null;
  }

  const actualSig = createHmac("sha256", config.instagramAppSecret)
    .update(encodedPayload)
    .digest();

  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
    if (payload.algorithm !== "HMAC-SHA256") return null;
    return payload as SignedRequestPayload;
  } catch {
    return null;
  }
}
