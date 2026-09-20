// Membuat/menghapus "koneksi uji" — akun Instagram palsu dengan
// instagram_user_id = "0", yaitu entry.id yang dipakai payload sampel dari
// tombol "Uji" di Meta App Dashboard.
//
// Gunanya: hasil klik tombol Uji jadi terlihat sebagai percakapan/komentar
// di dashboard, sehingga alur tampilan bisa dicoba tanpa menunggu DM asli
// (yang masih terblokir Standard Access sampai App Review disetujui).
//
// Pakai:
//   npm run seed:test-connection          -> buat koneksi uji
//   npm run seed:test-connection -- hapus -> hapus koneksi uji + datanya
//
// Koneksi ini TIDAK bisa dipakai memanggil API Instagram (tokennya palsu),
// hanya untuk menampung payload uji.
import { db } from "./db.js";
import type { RowDataPacket } from "mysql2";

const TEST_IG_USER_ID = "0";
const TEST_USERNAME = "akun_uji";

async function findOwnerId(): Promise<string> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id, email FROM accounts WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1"
  );
  const owner = rows[0] as { id: string; email: string } | undefined;
  if (!owner) {
    throw new Error("Belum ada akun owner. Jalankan npm run migrate:from-sqlite dulu.");
  }
  console.log(`Koneksi uji akan dimiliki owner: ${owner.email}`);
  return owner.id;
}

async function seed(): Promise<void> {
  const [existing] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM connections WHERE instagram_user_id = ?",
    [TEST_IG_USER_ID]
  );
  if (existing[0]) {
    console.log(`Koneksi uji sudah ada (id ${(existing[0] as { id: number }).id}). Tidak ada perubahan.`);
    return;
  }

  const ownerId = await findOwnerId();
  // Token sengaja diisi string penanda, bukan token asli — koneksi ini tidak
  // pernah dipakai memanggil Graph API. Kalau sampai terpakai, panggilannya
  // akan gagal dengan jelas, bukan diam-diam mengirim ke akun sungguhan.
  await db.execute(
    `INSERT INTO connections
       (account_id, instagram_user_id, username, access_token, token_expires_at, scopes, status)
     VALUES (?, ?, ?, 'TOKEN_PALSU_KONEKSI_UJI', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 YEAR), 'uji', 'active')`,
    [ownerId, TEST_IG_USER_ID, TEST_USERNAME]
  );

  console.log(`\nKoneksi uji "@${TEST_USERNAME}" dibuat.`);
  console.log("Sekarang klik tombol Uji di Meta App Dashboard pada kolom");
  console.log("messages atau comments, lalu buka halaman DM/Komentar dan");
  console.log(`pilih akun "@${TEST_USERNAME}" di pemilih akun kanan atas.`);
}

async function remove(): Promise<void> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM connections WHERE instagram_user_id = ?",
    [TEST_IG_USER_ID]
  );
  const conn = rows[0] as { id: number } | undefined;
  if (!conn) {
    console.log("Koneksi uji tidak ditemukan, tidak ada yang dihapus.");
    return;
  }

  // dm_threads/ig_comments/posts/stories punya FK ON DELETE CASCADE ke
  // connections, jadi data turunannya ikut terhapus otomatis.
  await db.execute("DELETE FROM connections WHERE id = ?", [conn.id]);
  console.log(`Koneksi uji (id ${conn.id}) beserta seluruh data ujinya dihapus.`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "hapus" || mode === "remove") {
    await remove();
  } else {
    await seed();
  }
}

main()
  .catch((err) => {
    console.error("Gagal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
