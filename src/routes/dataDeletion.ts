import { Router } from "express";
import { randomBytes } from "node:crypto";
import { verifySignedRequest } from "../instagram/signedRequest.js";
import { deleteConnectionData } from "../db.js";
import { config } from "../config.js";

// Router terpisah: satu untuk callback webhook Meta (di-mount di /webhook),
// satu untuk halaman status publik (di-mount di root /).
export const dataDeletionRouter = Router();
export const dataDeletionStatusRouter = Router();

// Data Deletion Request Callback.
// Meta POST signed_request -> kita HARUS benar-benar menghapus data user
// tsb, lalu balas { url, confirmation_code } (bukan sekadar 200 kosong).
dataDeletionRouter.post("/instagram/data-deletion", (req, res) => {
  const signedRequest = req.body?.signed_request as string | undefined;
  if (!signedRequest) {
    res.sendStatus(400);
    return;
  }

  const payload = verifySignedRequest(signedRequest);
  if (!payload || !payload.user_id) {
    console.warn("Data deletion callback: signed_request tidak valid.");
    res.sendStatus(403);
    return;
  }

  deleteConnectionData(payload.user_id);

  const confirmationCode = randomBytes(8).toString("hex");
  console.log(`Data user Instagram ${payload.user_id} dihapus. Kode konfirmasi: ${confirmationCode}`);

  res.json({
    url: `${config.publicBaseUrl}/data-deletion-status/${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

// Halaman status yang ditunjuk oleh `url` di atas, supaya user bisa mengecek
// manual. Untuk prototype ini cukup halaman statis konfirmasi.
dataDeletionStatusRouter.get("/data-deletion-status/:code", (req, res) => {
  res.send(
    `<p>Permintaan penghapusan data dengan kode <code>${req.params.code}</code> telah diproses.</p>`
  );
});
