// Skema database MySQL untuk NC-IG. Dijalankan manual (npm run migrate),
// bukan otomatis saat startup — beda dari versi SQLite lama yang bisa
// CREATE TABLE IF NOT EXISTS sinkron di top-level module.
import { db } from "./db.js";

// Helper untuk migrasi tambahan di masa depan (menambah kolom ke tabel yang
// sudah ada tanpa error kalau dijalankan berulang) — pola dari nc-wa-saas.
// Belum dipakai sekarang karena semua tabel masih fresh CREATE TABLE, tapi
// disiapkan supaya perubahan skema berikutnya tidak perlu DROP/re-migrate.
async function column(table: string, name: string, definition: string): Promise<void> {
  const [rows] = await db.execute<import("mysql2").RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, name]
  );
  if (!rows.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
void column; // reserved untuk migrasi berikutnya, sengaja belum dipanggil

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id CHAR(36) PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,
      role ENUM('user','owner') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      account_id CHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS connections (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      account_id CHAR(36) NOT NULL,
      instagram_user_id VARCHAR(64) NOT NULL UNIQUE,
      username VARCHAR(255) NOT NULL,
      access_token TEXT NOT NULL,
      token_expires_at DATETIME NOT NULL,
      scopes VARCHAR(512) NOT NULL,
      status ENUM('active','revoked') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(64) PRIMARY KEY,
      account_id CHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      payload LONGTEXT NOT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS dm_threads (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      connection_id INT UNSIGNED,
      ig_scoped_id VARCHAR(64) NOT NULL,
      username VARCHAR(255),
      last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
      UNIQUE KEY idx_dm_threads_connection_igscoped (connection_id, ig_scoped_id)
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      thread_id INT UNSIGNED NOT NULL,
      direction ENUM('inbound','outbound') NOT NULL,
      mid VARCHAR(128),
      text TEXT,
      raw_payload LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE,
      UNIQUE KEY idx_dm_messages_mid (mid)
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ig_comments (
      id VARCHAR(64) PRIMARY KEY,
      connection_id INT UNSIGNED,
      media_id VARCHAR(64),
      from_username VARCHAR(255),
      text TEXT,
      status ENUM('unreplied','replied') NOT NULL DEFAULT 'unreplied',
      raw_payload LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ig_comment_replies (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      comment_id VARCHAR(64) NOT NULL,
      reply_comment_id VARCHAR(64),
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES ig_comments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      connection_id INT UNSIGNED,
      ig_media_id VARCHAR(64),
      container_id VARCHAR(64),
      caption TEXT,
      image_url VARCHAR(2048) NOT NULL,
      status ENUM('published','failed') NOT NULL DEFAULT 'published',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      connection_id INT UNSIGNED,
      ig_media_id VARCHAR(64),
      container_id VARCHAR(64),
      image_url VARCHAR(2048) NOT NULL,
      status ENUM('published','failed') NOT NULL DEFAULT 'published',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reply_templates (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      connection_id INT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  console.log("Migrasi skema NC-IG selesai.");
}

main()
  .catch((err) => {
    console.error("Migrasi gagal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
