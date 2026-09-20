// Migrasi data satu-kali dari database SQLite lama (single-operator) ke
// MySQL (multi-user). Dijalankan manual: npm run migrate:from-sqlite,
// SETELAH npm run migrate (skema MySQL sudah harus ada).
//
// Owner pertama dibuat dari ADMIN_PASSWORD lama (email owner@nc-ig.local)
// supaya bisa login pakai password yang sama seperti sebelumnya. Semua
// connection & riwayat (DM/comments/posts/stories/webhook_events) lama
// jadi milik owner ini. File SQLite lama TIDAK dihapus, dibiarkan sebagai
// backup.
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { db } from "./db.js";

const OWNER_EMAIL = "owner@nc-ig.local";

// SQLite menyimpan created_at/updated_at/dll sebagai teks — bisa berupa
// "YYYY-MM-DD HH:MM:SS" (default SQLite datetime('now')) ATAU ISO 8601
// dengan "T"/"Z"/milidetik (token_expires_at, ditulis via
// new Date().toISOString() di kode lama). MySQL DATETIME cuma menerima
// format "YYYY-MM-DD HH:MM:SS" — normalisasi semua nilai lewat sini.
function toMysqlDatetime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.includes("T") || value.includes("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  if (!config.legacyAdminPassword) {
    throw new Error(
      "ADMIN_PASSWORD kosong di .env — wajib diisi (password lama) supaya owner bisa dibuat dengan hash yang cocok."
    );
  }

  const sqlite = new Database(config.legacySqlitePath, { readonly: true, fileMustExist: true });

  // 1. Buat akun owner. Hash password lama (scryptSync, format "salt:hash")
  // sudah kompatibel dipakai langsung sebagai password_hash — dihitung di
  // sini (bukan copy dari config lama) supaya migrasi bisa diulang idempoten
  // tanpa perlu simpan hash di tempat lain.
  const { hashPassword } = await import("./lib/session.js");

  let ownerId: string;
  const existingOwner = await db.execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM accounts WHERE email = ?",
    [OWNER_EMAIL]
  );
  if (existingOwner[0].length > 0) {
    ownerId = (existingOwner[0][0] as { id: string }).id;
    console.log(`Akun owner sudah ada (${OWNER_EMAIL}), pakai id yang ada: ${ownerId}`);
  } else {
    ownerId = randomUUID();
    await db.execute(
      "INSERT INTO accounts (id, email, password_hash, role) VALUES (?, ?, ?, 'owner')",
      [ownerId, OWNER_EMAIL, hashPassword(config.legacyAdminPassword)]
    );
    console.log(`Akun owner dibuat: ${OWNER_EMAIL} (id ${ownerId})`);
  }

  // 2. Migrasikan connections, simpan mapping old id -> new id (dipakai
  // tabel turunan: dm_threads, ig_comments, posts, stories referensi ke
  // connection_id).
  const connectionIdMap = new Map<number, number>();
  const oldConnections = sqlite
    .prepare(
      `SELECT id, instagram_user_id, username, access_token, token_expires_at, scopes, status, created_at, updated_at
       FROM connections`
    )
    .all() as Array<{
    id: number;
    instagram_user_id: string;
    username: string;
    access_token: string;
    token_expires_at: string;
    scopes: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const c of oldConnections) {
    const [result] = await db.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO connections (account_id, instagram_user_id, username, access_token, token_expires_at, scopes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        c.instagram_user_id,
        c.username,
        c.access_token,
        toMysqlDatetime(c.token_expires_at),
        c.scopes,
        c.status,
        toMysqlDatetime(c.created_at),
        toMysqlDatetime(c.updated_at),
      ]
    );
    connectionIdMap.set(c.id, result.insertId);
  }
  console.log(`Connections dimigrasikan: ${oldConnections.length}`);

  // 3. dm_threads (simpan mapping old thread id -> new id untuk dm_messages).
  const threadIdMap = new Map<number, number>();
  const oldThreads = sqlite
    .prepare(`SELECT id, connection_id, ig_scoped_id, username, last_message_at, created_at FROM dm_threads`)
    .all() as Array<{
    id: number;
    connection_id: number | null;
    ig_scoped_id: string;
    username: string | null;
    last_message_at: string;
    created_at: string;
  }>;

  for (const t of oldThreads) {
    const newConnectionId = t.connection_id ? connectionIdMap.get(t.connection_id) : undefined;
    if (!newConnectionId) {
      console.warn(`Thread lama id=${t.id} tanpa connection_id valid, dilewati.`);
      continue;
    }
    const [result] = await db.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO dm_threads (connection_id, ig_scoped_id, username, last_message_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      [newConnectionId, t.ig_scoped_id, t.username, toMysqlDatetime(t.last_message_at), toMysqlDatetime(t.created_at)]
    );
    threadIdMap.set(t.id, result.insertId);
  }
  console.log(`DM threads dimigrasikan: ${threadIdMap.size}`);

  // 4. dm_messages
  const oldMessages = sqlite
    .prepare(`SELECT thread_id, direction, mid, text, raw_payload, created_at FROM dm_messages`)
    .all() as Array<{
    thread_id: number;
    direction: string;
    mid: string | null;
    text: string | null;
    raw_payload: string | null;
    created_at: string;
  }>;

  let messageCount = 0;
  for (const m of oldMessages) {
    const newThreadId = threadIdMap.get(m.thread_id);
    if (!newThreadId) continue;
    await db.execute(
      `INSERT INTO dm_messages (thread_id, direction, mid, text, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [newThreadId, m.direction, m.mid, m.text, m.raw_payload, toMysqlDatetime(m.created_at)]
    );
    messageCount++;
  }
  console.log(`DM messages dimigrasikan: ${messageCount}`);

  // 5. ig_comments (PK = comment id asli dari Instagram, tidak perlu mapping).
  const oldComments = sqlite
    .prepare(
      `SELECT id, connection_id, media_id, from_username, text, status, raw_payload, created_at, updated_at FROM ig_comments`
    )
    .all() as Array<{
    id: string;
    connection_id: number | null;
    media_id: string | null;
    from_username: string | null;
    text: string | null;
    status: string;
    raw_payload: string | null;
    created_at: string;
    updated_at: string;
  }>;

  let commentCount = 0;
  for (const c of oldComments) {
    const newConnectionId = c.connection_id ? connectionIdMap.get(c.connection_id) : undefined;
    if (!newConnectionId) {
      console.warn(`Comment lama id=${c.id} tanpa connection_id valid, dilewati.`);
      continue;
    }
    await db.execute(
      `INSERT INTO ig_comments (id, connection_id, media_id, from_username, text, status, raw_payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        newConnectionId,
        c.media_id,
        c.from_username,
        c.text,
        c.status,
        c.raw_payload,
        toMysqlDatetime(c.created_at),
        toMysqlDatetime(c.updated_at),
      ]
    );
    commentCount++;
  }
  console.log(`IG comments dimigrasikan: ${commentCount}`);

  // 6. ig_comment_replies (comment_id merujuk ke PK asli di atas, tidak
  // perlu mapping — tapi kalau parent comment dilewati, skip juga).
  const oldReplies = sqlite
    .prepare(`SELECT comment_id, reply_comment_id, text, created_at FROM ig_comment_replies`)
    .all() as Array<{ comment_id: string; reply_comment_id: string | null; text: string; created_at: string }>;

  let replyCount = 0;
  for (const r of oldReplies) {
    if (!oldComments.some((c) => c.id === r.comment_id && connectionIdMap.get(c.connection_id ?? -1))) continue;
    await db.execute(
      `INSERT INTO ig_comment_replies (comment_id, reply_comment_id, text, created_at) VALUES (?, ?, ?, ?)`,
      [r.comment_id, r.reply_comment_id, r.text, toMysqlDatetime(r.created_at)]
    );
    replyCount++;
  }
  console.log(`IG comment replies dimigrasikan: ${replyCount}`);

  // 7. posts
  const oldPosts = sqlite
    .prepare(
      `SELECT connection_id, ig_media_id, container_id, caption, image_url, status, error_message, created_at FROM posts`
    )
    .all() as Array<{
    connection_id: number | null;
    ig_media_id: string | null;
    container_id: string | null;
    caption: string | null;
    image_url: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;

  let postCount = 0;
  for (const p of oldPosts) {
    const newConnectionId = p.connection_id ? connectionIdMap.get(p.connection_id) : undefined;
    if (!newConnectionId) continue;
    await db.execute(
      `INSERT INTO posts (connection_id, ig_media_id, container_id, caption, image_url, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newConnectionId,
        p.ig_media_id,
        p.container_id,
        p.caption,
        p.image_url,
        p.status,
        p.error_message,
        toMysqlDatetime(p.created_at),
      ]
    );
    postCount++;
  }
  console.log(`Posts dimigrasikan: ${postCount}`);

  // 8. stories
  const oldStories = sqlite
    .prepare(`SELECT connection_id, ig_media_id, container_id, image_url, status, error_message, created_at FROM stories`)
    .all() as Array<{
    connection_id: number | null;
    ig_media_id: string | null;
    container_id: string | null;
    image_url: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;

  let storyCount = 0;
  for (const s of oldStories) {
    const newConnectionId = s.connection_id ? connectionIdMap.get(s.connection_id) : undefined;
    if (!newConnectionId) continue;
    await db.execute(
      `INSERT INTO stories (connection_id, ig_media_id, container_id, image_url, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newConnectionId,
        s.ig_media_id,
        s.container_id,
        s.image_url,
        s.status,
        s.error_message,
        toMysqlDatetime(s.created_at),
      ]
    );
    storyCount++;
  }
  console.log(`Stories dimigrasikan: ${storyCount}`);

  // 9. webhook_events (log murni, tidak ada relasi, migrasi apa adanya).
  const oldEvents = sqlite.prepare(`SELECT event_type, payload, received_at FROM webhook_events`).all() as Array<{
    event_type: string;
    payload: string;
    received_at: string;
  }>;
  for (const e of oldEvents) {
    await db.execute(`INSERT INTO webhook_events (event_type, payload, received_at) VALUES (?, ?, ?)`, [
      e.event_type,
      e.payload,
      toMysqlDatetime(e.received_at),
    ]);
  }
  console.log(`Webhook events dimigrasikan: ${oldEvents.length}`);

  sqlite.close();
  console.log("\nMigrasi data selesai. File SQLite lama dibiarkan utuh sebagai backup.");
}

main()
  .catch((err) => {
    console.error("Migrasi data gagal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
