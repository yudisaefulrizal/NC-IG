import { Router } from "express";
import { config } from "../config.js";
import { verifyWebhookSignature } from "../instagram/webhookSignature.js";
import {
  logWebhookEvent,
  upsertThread,
  insertInboundMessage,
  upsertComment,
  getConnectionByInstagramUserId,
} from "../db.js";

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
webhookRouter.post("/instagram", async (req, res) => {
  const signature = req.header("X-Hub-Signature-256");
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

  if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
    console.warn("Webhook Instagram: signature tidak valid, event ditolak.");
    res.sendStatus(403);
    return;
  }

  // Log event untuk debugging. TIDAK ADA token/secret di payload webhook,
  // jadi aman dicatat apa adanya.
  await logWebhookEvent(req.body?.object ?? "unknown", req.body);

  await handleMessagingEntries(req.body);
  await handleCommentEntries(req.body);

  // Meta mengharapkan respons cepat; proses lanjutan (jika ada) sebaiknya
  // dikerjakan async/di luar request ini agar tidak timeout.
  res.sendStatus(200);
});

// Payload DM masuk. Dokumentasi resmi Meta menyebut entry[].messaging[],
// TAPI payload nyata (dikonfirmasi lewat tombol "Kirim ke server" di
// dashboard Meta > Webhooks > messages sampel kolom) memakai
// entry[].changes[] dengan field:"messages" — pola yang sama dipakai field
// lain (comments dll). Dukung dua-duanya defensif; satu entry bisa berisi
// beberapa hal sekaligus, jadi loop cek keduanya, bukan salah satu saja.
interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

function extractMessagingEvents(entry: unknown): MessagingEvent[] {
  const fromMessaging = (entry as { messaging?: MessagingEvent[] })?.messaging ?? [];

  const changes = (entry as { changes?: { field?: string; value?: MessagingEvent }[] })?.changes ?? [];
  const fromChanges = changes.filter((c) => c.field === "messages").map((c) => c.value!).filter(Boolean);

  return [...fromMessaging, ...fromChanges];
}

async function handleMessagingEntries(body: unknown): Promise<void> {
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries) {
    // entry.id = Instagram User ID akun PENERIMA event (dikonfirmasi dari
    // payload nyata) — dipakai resolve akun mana di NC-IG yang dituju.
    // Event untuk akun yang belum/tidak terhubung di sini dilewati.
    const igUserId = (entry as { id?: string })?.id;
    const conn = igUserId ? await getConnectionByInstagramUserId(igUserId) : undefined;
    if (!conn) continue;

    for (const event of extractMessagingEvents(entry)) {
      // Echo = pesan yang dikirim OLEH akun ini sendiri (mis. dari app
      // Instagram langsung, bukan lewat NC-IG) — bukan pesan masuk dari
      // lawan bicara. Lewati supaya tidak salah dianggap inbound.
      if (event.message?.is_echo) continue;

      const senderId = event.sender?.id;
      const mid = event.message?.mid;
      if (!senderId || !mid) continue;

      const thread = await upsertThread(conn.id, senderId);
      await insertInboundMessage({
        threadId: thread.id,
        mid,
        text: event.message?.text,
        rawPayload: event,
      });
    }
  }
}

// Payload komentar baru: entry[].changes[] dengan field:"comments" (sama
// pola dengan payload sampel "messages" yang sudah dikonfirmasi nyata).
interface CommentEvent {
  id?: string;
  text?: string;
  media?: { id?: string };
  from?: { username?: string; id?: string };
}

async function handleCommentEntries(body: unknown): Promise<void> {
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries) {
    const igUserId = (entry as { id?: string })?.id;
    const conn = igUserId ? await getConnectionByInstagramUserId(igUserId) : undefined;
    if (!conn) continue;

    const changes = (entry as { changes?: { field?: string; value?: CommentEvent }[] })?.changes ?? [];

    for (const change of changes) {
      if (change.field !== "comments" || !change.value?.id) continue;

      await upsertComment({
        id: change.value.id,
        connectionId: conn.id,
        mediaId: change.value.media?.id,
        fromUsername: change.value.from?.username,
        text: change.value.text,
        rawPayload: change.value,
      });
    }
  }
}
