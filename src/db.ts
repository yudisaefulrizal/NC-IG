import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, "nc-ig.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instagram_user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    token_expires_at TEXT NOT NULL,
    scopes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active | revoked
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig_scoped_id TEXT NOT NULL UNIQUE, -- Instagram-scoped ID lawan bicara
    username TEXT,
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES dm_threads(id),
    direction TEXT NOT NULL, -- inbound | outbound
    mid TEXT,                -- message id dari Meta, dipakai cek duplikat
    text TEXT,
    raw_payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_messages_mid ON dm_messages(mid) WHERE mid IS NOT NULL;

  CREATE TABLE IF NOT EXISTS ig_comments (
    id TEXT PRIMARY KEY, -- comment id asli dari Instagram, bukan autoincrement
    media_id TEXT,
    from_username TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'unreplied', -- unreplied | replied
    raw_payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ig_comment_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id TEXT NOT NULL REFERENCES ig_comments(id),
    reply_comment_id TEXT, -- id balasan yang dikembalikan Meta setelah POST
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig_media_id TEXT,     -- id dari Instagram, hanya terisi kalau sukses
    container_id TEXT,    -- creation_id sementara, untuk debug kalau gagal
    caption TEXT,
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published', -- published | failed
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface Connection {
  id: number;
  instagram_user_id: string;
  username: string;
  access_token: string;
  token_expires_at: string;
  scopes: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export function upsertConnection(data: {
  instagramUserId: string;
  username: string;
  accessToken: string;
  tokenExpiresAt: string;
  scopes: string;
}): void {
  db.prepare(
    `INSERT INTO connections (instagram_user_id, username, access_token, token_expires_at, scopes, status, updated_at)
     VALUES (@instagramUserId, @username, @accessToken, @tokenExpiresAt, @scopes, 'active', datetime('now'))
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       username = excluded.username,
       access_token = excluded.access_token,
       token_expires_at = excluded.token_expires_at,
       scopes = excluded.scopes,
       status = 'active',
       updated_at = datetime('now')`
  ).run(data);
}

// Prototipe single-user: ambil satu koneksi aktif yang paling baru.
export function getActiveConnection(): Connection | undefined {
  return db
    .prepare(`SELECT * FROM connections WHERE status = 'active' ORDER BY id DESC LIMIT 1`)
    .get() as Connection | undefined;
}

export function getConnectionByInstagramUserId(instagramUserId: string): Connection | undefined {
  return db
    .prepare(`SELECT * FROM connections WHERE instagram_user_id = ?`)
    .get(instagramUserId) as Connection | undefined;
}

export function markConnectionRevoked(instagramUserId: string): void {
  db.prepare(
    `UPDATE connections SET status = 'revoked', updated_at = datetime('now') WHERE instagram_user_id = ?`
  ).run(instagramUserId);
}

export function deleteConnectionData(instagramUserId: string): void {
  db.prepare(`DELETE FROM connections WHERE instagram_user_id = ?`).run(instagramUserId);
}

export function saveOAuthState(state: string): void {
  // Buang state basi (>10 menit) supaya tabel tidak tumbuh tanpa batas.
  db.prepare(`DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')`).run();
  db.prepare(`INSERT INTO oauth_states (state) VALUES (?)`).run(state);
}

export function consumeOAuthState(state: string): boolean {
  const row = db.prepare(`SELECT state FROM oauth_states WHERE state = ?`).get(state);
  if (!row) return false;
  db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  return true;
}

export function logWebhookEvent(eventType: string, payload: unknown): void {
  db.prepare(`INSERT INTO webhook_events (event_type, payload) VALUES (?, ?)`).run(
    eventType,
    JSON.stringify(payload)
  );
}

export interface DmThread {
  id: number;
  ig_scoped_id: string;
  username: string | null;
  last_message_at: string;
  created_at: string;
}

export interface DmMessage {
  id: number;
  thread_id: number;
  direction: "inbound" | "outbound";
  mid: string | null;
  text: string | null;
  raw_payload: string | null;
  created_at: string;
}

// Cari thread yang sudah ada, atau buat baru kalau ini kontak pertama kali.
export function upsertThread(igScopedId: string): DmThread {
  const existing = db
    .prepare(`SELECT * FROM dm_threads WHERE ig_scoped_id = ?`)
    .get(igScopedId) as DmThread | undefined;
  if (existing) return existing;

  const result = db.prepare(`INSERT INTO dm_threads (ig_scoped_id) VALUES (?)`).run(igScopedId);
  return db.prepare(`SELECT * FROM dm_threads WHERE id = ?`).get(result.lastInsertRowid) as DmThread;
}

function touchThread(threadId: number): void {
  db.prepare(`UPDATE dm_threads SET last_message_at = datetime('now') WHERE id = ?`).run(threadId);
}

// Idempotent terhadap mid (Meta bisa retry pengiriman webhook yang sama).
// Return false kalau pesan dengan mid ini sudah pernah disimpan sebelumnya.
export function insertInboundMessage(data: {
  threadId: number;
  mid: string;
  text: string | undefined;
  rawPayload: unknown;
}): boolean {
  const existing = db.prepare(`SELECT id FROM dm_messages WHERE mid = ?`).get(data.mid);
  if (existing) return false;

  db.prepare(
    `INSERT INTO dm_messages (thread_id, direction, mid, text, raw_payload)
     VALUES (@threadId, 'inbound', @mid, @text, @rawPayload)`
  ).run({
    threadId: data.threadId,
    mid: data.mid,
    text: data.text ?? null,
    rawPayload: JSON.stringify(data.rawPayload),
  });
  touchThread(data.threadId);
  return true;
}

export function insertOutboundMessage(data: { threadId: number; mid?: string; text: string }): void {
  db.prepare(
    `INSERT INTO dm_messages (thread_id, direction, mid, text)
     VALUES (@threadId, 'outbound', @mid, @text)`
  ).run({ threadId: data.threadId, mid: data.mid ?? null, text: data.text });
  touchThread(data.threadId);
}

export function listThreads(): DmThread[] {
  return db.prepare(`SELECT * FROM dm_threads ORDER BY last_message_at DESC`).all() as DmThread[];
}

export function getThread(threadId: number): DmThread | undefined {
  return db.prepare(`SELECT * FROM dm_threads WHERE id = ?`).get(threadId) as DmThread | undefined;
}

export function getThreadMessages(threadId: number): DmMessage[] {
  return db
    .prepare(`SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id ASC`)
    .all(threadId) as DmMessage[];
}

export interface IgComment {
  id: string;
  media_id: string | null;
  from_username: string | null;
  text: string | null;
  status: "unreplied" | "replied";
  raw_payload: string | null;
  created_at: string;
  updated_at: string;
}

// Idempotent: upsert supaya webhook retry/duplicate tidak bikin baris ganda
// (comment id dari Meta dipakai langsung sebagai primary key).
export function upsertComment(data: {
  id: string;
  mediaId?: string;
  fromUsername?: string;
  text?: string;
  rawPayload: unknown;
}): void {
  db.prepare(
    `INSERT INTO ig_comments (id, media_id, from_username, text, raw_payload)
     VALUES (@id, @mediaId, @fromUsername, @text, @rawPayload)
     ON CONFLICT(id) DO UPDATE SET
       media_id = excluded.media_id,
       from_username = excluded.from_username,
       text = excluded.text,
       raw_payload = excluded.raw_payload,
       updated_at = datetime('now')`
  ).run({
    id: data.id,
    mediaId: data.mediaId ?? null,
    fromUsername: data.fromUsername ?? null,
    text: data.text ?? null,
    rawPayload: JSON.stringify(data.rawPayload),
  });
}

export function listComments(): IgComment[] {
  return db.prepare(`SELECT * FROM ig_comments ORDER BY created_at DESC`).all() as IgComment[];
}

export function getComment(commentId: string): IgComment | undefined {
  return db.prepare(`SELECT * FROM ig_comments WHERE id = ?`).get(commentId) as IgComment | undefined;
}

export function insertCommentReply(data: { commentId: string; replyCommentId?: string; text: string }): void {
  db.prepare(
    `INSERT INTO ig_comment_replies (comment_id, reply_comment_id, text) VALUES (@commentId, @replyCommentId, @text)`
  ).run({
    commentId: data.commentId,
    replyCommentId: data.replyCommentId ?? null,
    text: data.text,
  });
  db.prepare(`UPDATE ig_comments SET status = 'replied', updated_at = datetime('now') WHERE id = ?`).run(
    data.commentId
  );
}

export function insertPost(data: {
  igMediaId?: string;
  containerId?: string;
  caption?: string;
  imageUrl: string;
  status: "published" | "failed";
  errorMessage?: string;
}): void {
  db.prepare(
    `INSERT INTO posts (ig_media_id, container_id, caption, image_url, status, error_message)
     VALUES (@igMediaId, @containerId, @caption, @imageUrl, @status, @errorMessage)`
  ).run({
    igMediaId: data.igMediaId ?? null,
    containerId: data.containerId ?? null,
    caption: data.caption ?? null,
    imageUrl: data.imageUrl,
    status: data.status,
    errorMessage: data.errorMessage ?? null,
  });
}

export function listPosts() {
  return db.prepare(`SELECT * FROM posts ORDER BY id DESC`).all();
}
