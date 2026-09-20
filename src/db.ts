import mysql from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { config } from "./config.js";

// Skema (CREATE TABLE) TIDAK di sini — beda dari versi SQLite sebelumnya
// yang bisa jalan sinkron saat module-load. mysql2/promise semuanya Promise,
// jadi DDL dipindah ke src/migrate.ts (dijalankan manual: npm run migrate).
export const db = mysql.createPool({
  host: config.dbHost,
  user: config.dbUser,
  password: config.dbPassword,
  database: config.dbName,
  connectionLimit: 8,
  timezone: "+00:00",
});
db.on("connection", (connection) => {
  connection.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
  connection.query("SET time_zone='+00:00'");
});

// MySQL DATETIME hanya menerima "YYYY-MM-DD HH:MM:SS", BUKAN ISO 8601
// ("...T...Z...") yang dihasilkan Date.prototype.toISOString() — dipakai di
// beberapa caller (mis. auth.ts saat simpan token_expires_at). Normalisasi
// di satu tempat ini supaya tiap pemanggil db.ts tidak perlu ingat konversi
// manual (sama pola dengan toMysqlDatetime di migrateFromSqlite.ts).
function toMysqlDatetime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Nilai datetime tidak valid: ${value}`);
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export type Role = "owner" | "user";

export interface Account {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

export async function createAccount(data: {
  id: string;
  email: string;
  passwordHash: string;
  role?: Role;
}): Promise<void> {
  await db.execute(
    `INSERT INTO accounts (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    [data.id, data.email, data.passwordHash, data.role ?? "user"]
  );
}

export async function findAccountByEmail(email: string): Promise<Account | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM accounts WHERE email = ?`, [email]);
  return rows[0] as Account | undefined;
}

export async function findAccountById(id: string): Promise<Account | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM accounts WHERE id = ?`, [id]);
  return rows[0] as Account | undefined;
}

export async function createSession(data: {
  tokenHash: string;
  accountId: string;
  ttlMs: number;
}): Promise<void> {
  await db.execute(
    `INSERT INTO login_sessions (token_hash, account_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
    [data.tokenHash, data.accountId, Math.floor(data.ttlMs / 1000)]
  );
}

export interface SessionAccount {
  id: string;
  email: string;
  role: Role;
}

// Join login_sessions + accounts sekali jalan — dipakai requireAuth di
// tiap request terproteksi. expires_at difilter di query supaya sesi basi
// otomatis dianggap tidak ada tanpa perlu job pembersih terpisah.
export async function findSessionAccount(tokenHash: string): Promise<SessionAccount | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT a.id, a.email, a.role FROM login_sessions s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
    [tokenHash]
  );
  return rows[0] as SessionAccount | undefined;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.execute(`DELETE FROM login_sessions WHERE token_hash = ?`, [tokenHash]);
}

export interface Connection {
  id: number;
  account_id: string;
  instagram_user_id: string;
  username: string;
  access_token: string;
  token_expires_at: string;
  scopes: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export async function upsertConnection(data: {
  accountId: string;
  instagramUserId: string;
  username: string;
  accessToken: string;
  tokenExpiresAt: string;
  scopes: string;
}): Promise<void> {
  await db.execute(
    `INSERT INTO connections (account_id, instagram_user_id, username, access_token, token_expires_at, scopes, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       account_id = VALUES(account_id),
       username = VALUES(username),
       access_token = VALUES(access_token),
       token_expires_at = VALUES(token_expires_at),
       scopes = VALUES(scopes),
       status = 'active',
       updated_at = UTC_TIMESTAMP()`,
    [
      data.accountId,
      data.instagramUserId,
      data.username,
      data.accessToken,
      toMysqlDatetime(data.tokenExpiresAt),
      data.scopes,
    ]
  );
}

// Owner melihat SEMUA koneksi (semua akun); user biasa hanya koneksi
// miliknya sendiri (account_id = dirinya).
export async function listActiveConnections(accountId: string, role: Role): Promise<Connection[]> {
  if (role === "owner") {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM connections WHERE status = 'active' ORDER BY id ASC`
    );
    return rows as Connection[];
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM connections WHERE status = 'active' AND account_id = ? ORDER BY id ASC`,
    [accountId]
  );
  return rows as Connection[];
}

// Ambil connection by id, TAPI hanya kalau caller berhak: owner boleh akses
// connection siapa pun, user biasa hanya boleh akses miliknya sendiri.
// Mencegah user menebak-nebak ID di URL untuk akses akun IG orang lain.
export async function getConnectionById(
  id: number,
  accountId: string,
  role: Role
): Promise<Connection | undefined> {
  if (role === "owner") {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM connections WHERE id = ? AND status = 'active'`,
      [id]
    );
    return rows[0] as Connection | undefined;
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM connections WHERE id = ? AND status = 'active' AND account_id = ?`,
    [id, accountId]
  );
  return rows[0] as Connection | undefined;
}

export async function getConnectionByInstagramUserId(instagramUserId: string): Promise<Connection | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM connections WHERE instagram_user_id = ?`, [
    instagramUserId,
  ]);
  return rows[0] as Connection | undefined;
}

export async function markConnectionRevoked(instagramUserId: string): Promise<void> {
  await db.execute(
    `UPDATE connections SET status = 'revoked', updated_at = UTC_TIMESTAMP() WHERE instagram_user_id = ?`,
    [instagramUserId]
  );
}

export async function deleteConnectionData(instagramUserId: string): Promise<void> {
  await db.execute(`DELETE FROM connections WHERE instagram_user_id = ?`, [instagramUserId]);
}

export async function saveOAuthState(state: string, accountId: string): Promise<void> {
  // Buang state basi (>10 menit) supaya tabel tidak tumbuh tanpa batas.
  await db.execute(`DELETE FROM oauth_states WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)`);
  await db.execute(`INSERT INTO oauth_states (state, account_id) VALUES (?, ?)`, [state, accountId]);
}

// Return account_id pemilik state (untuk tahu siapa yang memulai OAuth ini),
// atau undefined kalau state tidak ada/sudah dipakai/kedaluwarsa.
export async function consumeOAuthState(state: string): Promise<string | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT account_id FROM oauth_states WHERE state = ?`, [state]);
  const row = rows[0] as { account_id: string } | undefined;
  if (!row) return undefined;
  await db.execute(`DELETE FROM oauth_states WHERE state = ?`, [state]);
  return row.account_id;
}

export async function logWebhookEvent(eventType: string, payload: unknown): Promise<void> {
  await db.execute(`INSERT INTO webhook_events (event_type, payload) VALUES (?, ?)`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

export interface DmThread {
  id: number;
  connection_id: number | null;
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

export async function upsertThread(connectionId: number, igScopedId: string): Promise<DmThread> {
  const [existingRows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM dm_threads WHERE connection_id = ? AND ig_scoped_id = ?`,
    [connectionId, igScopedId]
  );
  if (existingRows[0]) return existingRows[0] as DmThread;

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO dm_threads (connection_id, ig_scoped_id) VALUES (?, ?)`,
    [connectionId, igScopedId]
  );
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM dm_threads WHERE id = ?`, [result.insertId]);
  return rows[0] as DmThread;
}

async function touchThread(threadId: number): Promise<void> {
  await db.execute(`UPDATE dm_threads SET last_message_at = UTC_TIMESTAMP() WHERE id = ?`, [threadId]);
}

// Idempotent terhadap mid (Meta bisa retry pengiriman webhook yang sama).
// Return false kalau pesan dengan mid ini sudah pernah disimpan sebelumnya.
export async function insertInboundMessage(data: {
  threadId: number;
  mid: string;
  text: string | undefined;
  rawPayload: unknown;
}): Promise<boolean> {
  const [existingRows] = await db.execute<RowDataPacket[]>(`SELECT id FROM dm_messages WHERE mid = ?`, [data.mid]);
  if (existingRows[0]) return false;

  await db.execute(
    `INSERT INTO dm_messages (thread_id, direction, mid, text, raw_payload) VALUES (?, 'inbound', ?, ?, ?)`,
    [data.threadId, data.mid, data.text ?? null, JSON.stringify(data.rawPayload)]
  );
  await touchThread(data.threadId);
  return true;
}

export async function insertOutboundMessage(data: { threadId: number; mid?: string; text: string }): Promise<void> {
  await db.execute(`INSERT INTO dm_messages (thread_id, direction, mid, text) VALUES (?, 'outbound', ?, ?)`, [
    data.threadId,
    data.mid ?? null,
    data.text,
  ]);
  await touchThread(data.threadId);
}

export async function listThreads(connectionId: number): Promise<DmThread[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM dm_threads WHERE connection_id = ? ORDER BY last_message_at DESC`,
    [connectionId]
  );
  return rows as DmThread[];
}

// Ambil thread HANYA kalau benar milik connectionId ini — mencegah operator
// mengakses percakapan akun lain dengan menebak-nebak threadId di URL.
export async function getThread(connectionId: number, threadId: number): Promise<DmThread | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM dm_threads WHERE id = ? AND connection_id = ?`,
    [threadId, connectionId]
  );
  return rows[0] as DmThread | undefined;
}

export async function getThreadMessages(threadId: number): Promise<DmMessage[]> {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id ASC`, [
    threadId,
  ]);
  return rows as DmMessage[];
}

export interface IgComment {
  id: string;
  connection_id: number | null;
  media_id: string | null;
  from_username: string | null;
  text: string | null;
  status: "unreplied" | "replied";
  raw_payload: string | null;
  created_at: string;
  updated_at: string;
}

// Idempotent: upsert supaya webhook retry/duplicate tidak bikin baris ganda
// (comment id dari Meta dipakai langsung sebagai primary key, sudah unik
// secara global lintas akun).
export async function upsertComment(data: {
  id: string;
  connectionId: number;
  mediaId?: string;
  fromUsername?: string;
  text?: string;
  rawPayload: unknown;
}): Promise<void> {
  await db.execute(
    `INSERT INTO ig_comments (id, connection_id, media_id, from_username, text, raw_payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       connection_id = VALUES(connection_id),
       media_id = VALUES(media_id),
       from_username = VALUES(from_username),
       text = VALUES(text),
       raw_payload = VALUES(raw_payload),
       updated_at = UTC_TIMESTAMP()`,
    [
      data.id,
      data.connectionId,
      data.mediaId ?? null,
      data.fromUsername ?? null,
      data.text ?? null,
      JSON.stringify(data.rawPayload),
    ]
  );
}

export async function listComments(connectionId: number): Promise<IgComment[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM ig_comments WHERE connection_id = ? ORDER BY created_at DESC`,
    [connectionId]
  );
  return rows as IgComment[];
}

export async function getComment(connectionId: number, commentId: string): Promise<IgComment | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM ig_comments WHERE id = ? AND connection_id = ?`,
    [commentId, connectionId]
  );
  return rows[0] as IgComment | undefined;
}

export async function insertCommentReply(data: {
  commentId: string;
  replyCommentId?: string;
  text: string;
}): Promise<void> {
  await db.execute(
    `INSERT INTO ig_comment_replies (comment_id, reply_comment_id, text) VALUES (?, ?, ?)`,
    [data.commentId, data.replyCommentId ?? null, data.text]
  );
  await db.execute(`UPDATE ig_comments SET status = 'replied', updated_at = UTC_TIMESTAMP() WHERE id = ?`, [
    data.commentId,
  ]);
}

export async function insertPost(data: {
  connectionId: number;
  igMediaId?: string;
  containerId?: string;
  caption?: string;
  imageUrl: string;
  status: "published" | "failed";
  errorMessage?: string;
}): Promise<void> {
  await db.execute(
    `INSERT INTO posts (connection_id, ig_media_id, container_id, caption, image_url, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.connectionId,
      data.igMediaId ?? null,
      data.containerId ?? null,
      data.caption ?? null,
      data.imageUrl,
      data.status,
      data.errorMessage ?? null,
    ]
  );
}

export async function listPosts(connectionId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM posts WHERE connection_id = ? ORDER BY id DESC`, [
    connectionId,
  ]);
  return rows;
}

export async function insertStory(data: {
  connectionId: number;
  igMediaId?: string;
  containerId?: string;
  imageUrl: string;
  status: "published" | "failed";
  errorMessage?: string;
}): Promise<void> {
  await db.execute(
    `INSERT INTO stories (connection_id, ig_media_id, container_id, image_url, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.connectionId,
      data.igMediaId ?? null,
      data.containerId ?? null,
      data.imageUrl,
      data.status,
      data.errorMessage ?? null,
    ]
  );
}

export async function listStories(connectionId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM stories WHERE connection_id = ? ORDER BY id DESC`, [
    connectionId,
  ]);
  return rows;
}

export interface ReplyTemplate {
  id: number;
  connection_id: number;
  title: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export async function listReplyTemplates(connectionId: number): Promise<ReplyTemplate[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM reply_templates WHERE connection_id = ? ORDER BY id DESC`,
    [connectionId]
  );
  return rows as ReplyTemplate[];
}

// Ambil template HANYA kalau benar milik connectionId ini — mencegah user
// mengedit/menghapus template akun lain dengan menebak-nebak id di URL.
export async function getReplyTemplate(connectionId: number, id: number): Promise<ReplyTemplate | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM reply_templates WHERE id = ? AND connection_id = ?`,
    [id, connectionId]
  );
  return rows[0] as ReplyTemplate | undefined;
}

export async function createReplyTemplate(data: {
  connectionId: number;
  title: string;
  text: string;
}): Promise<ReplyTemplate> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO reply_templates (connection_id, title, text) VALUES (?, ?, ?)`,
    [data.connectionId, data.title, data.text]
  );
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM reply_templates WHERE id = ?`, [result.insertId]);
  return rows[0] as ReplyTemplate;
}

export async function updateReplyTemplate(
  connectionId: number,
  id: number,
  data: { title: string; text: string }
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE reply_templates SET title = ?, text = ? WHERE id = ? AND connection_id = ?`,
    [data.title, data.text, id, connectionId]
  );
  return result.affectedRows > 0;
}

export async function deleteReplyTemplate(connectionId: number, id: number): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM reply_templates WHERE id = ? AND connection_id = ?`,
    [id, connectionId]
  );
  return result.affectedRows > 0;
}
