import { Router } from "express";
import { config } from "../config.js";
import { verifyWebhookSignature } from "../instagram/webhookSignature.js";
import { logWebhookEvent } from "../db.js";

export const webhookRouter = Router();

// Verification handshake (satu kali saat mendaftarkan webhook di dashboard).
// https://developers.facebook.com/documentation/instagram-platform/webhooks
webhookRouter.get("/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.instagramWebhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

// Event notification. Body diverifikasi via raw body middleware di server.ts
// (req.rawBody diisi sebelum express.json() mem-parse).
webhookRouter.post("/instagram", (req, res) => {
  const signature = req.header("X-Hub-Signature-256");
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

  if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
    console.warn("Webhook Instagram: signature tidak valid, event ditolak.");
    res.sendStatus(403);
    return;
  }

  // Log event untuk debugging. TIDAK ADA token/secret di payload webhook,
  // jadi aman dicatat apa adanya.
  logWebhookEvent(req.body?.object ?? "unknown", req.body);

  // Meta mengharapkan respons cepat; proses lanjutan (jika ada) sebaiknya
  // dikerjakan async/di luar request ini agar tidak timeout.
  res.sendStatus(200);
});
