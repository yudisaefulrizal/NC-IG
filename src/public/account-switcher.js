// Pemilih akun bersama, dipakai di semua halaman dashboard kecuali Login,
// Home, dan Connection (yang menampilkan semua akun sekaligus, bukan satu).
// Duplikasi HTML/nav antar halaman itu disengaja (lihat style.css), tapi
// logic pemilih akun ini cukup ribet untuk dipisah jadi 1 file bersama.
//
// Kontrak pemakaian: halaman punya elemen <div id="account-switcher"></div>
// di nav, panggil initAccountSwitcher(onAccountReady) setelah DOM siap.
// onAccountReady(connectionId) dipanggil sekali di awal (kalau ada akun
// aktif) dan setiap kali operator ganti akun dari dropdown.
async function initAccountSwitcher(onAccountReady) {
  const container = document.getElementById('account-switcher');
  if (!container) return;

  const res = await fetch('/api/connection');
  const data = await res.json();

  if (data.connections.length === 0) {
    container.innerHTML = '<a href="/connection.html">+ Hubungkan Akun</a>';
    return;
  }

  const select = document.createElement('select');
  select.id = 'account-switcher-select';
  for (const c of data.connections) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = '@' + c.username;
    select.appendChild(opt);
  }

  // Kalau belum ada akun aktif tersimpan, pilih yang pertama secara
  // implisit di UI (server tetap butuh POST eksplisit untuk menyimpannya).
  const activeId = data.activeConnectionId || data.connections[0].id;
  select.value = String(activeId);

  container.innerHTML = '';
  container.appendChild(select);

  select.addEventListener('change', async () => {
    const connectionId = Number(select.value);
    await fetch('/session/active-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    });
    onAccountReady(connectionId);
  });

  // Simpan pilihan awal ke server (menutup celah: activeConnectionId belum
  // pernah di-set sebelumnya, mis. baru pertama kali connect 1 akun).
  if (data.activeConnectionId !== activeId) {
    await fetch('/session/active-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: activeId }),
    });
  }

  onAccountReady(activeId);
}
