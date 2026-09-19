// Wrapper tipis untuk request ke Graph API Instagram.
// Semua request server-side; access_token tidak pernah dikirim ke browser.
const GRAPH_BASE = "https://graph.instagram.com";

export interface InstagramProfile {
  user_id: string;
  username: string;
  account_type?: string;
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "user_id,username,account_type");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal mengambil profil Instagram (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as InstagramProfile;
}
