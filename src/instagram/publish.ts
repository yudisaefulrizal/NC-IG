// Content Publishing API — alur 2 langkah sesuai dokumentasi resmi:
// https://developers.facebook.com/docs/instagram-platform/content-publishing/
//
// 1. POST /{ig-user-id}/media  -> buat container (Meta mengunduh image_url di sisi mereka)
// 2. Poll GET /{container-id}?fields=status_code sampai FINISHED
// 3. POST /{ig-user-id}/media_publish -> publish container
//
// Catatan: image_url WAJIB bisa diakses publik oleh server Meta (bukan
// localhost) dan formatnya harus JPEG untuk single image post.
const GRAPH_BASE = "https://graph.instagram.com";

export type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export async function createImageContainer(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  mediaType?: "STORIES";
}): Promise<string> {
  const body = new URLSearchParams({
    image_url: params.imageUrl,
    access_token: params.accessToken,
  });
  // Caption tidak didukung dokumentasi untuk Stories — caller (routes/stories.ts)
  // sudah tidak pernah mengirim caption untuk mediaType STORIES, tapi guard
  // di sini juga supaya aman kalau dipanggil dari tempat lain di masa depan.
  if (params.caption && params.mediaType !== "STORIES") body.set("caption", params.caption);
  if (params.mediaType) body.set("media_type", params.mediaType);

  const res = await fetch(`${GRAPH_BASE}/${params.igUserId}/media`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(`Gagal membuat media container (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function getContainerStatus(containerId: string, accessToken: string): Promise<ContainerStatus> {
  const url = new URL(`${GRAPH_BASE}/${containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal mengecek status container (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { status_code: ContainerStatus };
  return data.status_code;
}

// Sesuai rekomendasi Meta: cek status maksimal tiap 1 menit, maksimal 5 menit.
// Untuk single image biasanya sudah FINISHED hampir instan, jadi interval
// pendek di sini masih wajar untuk prototype (bukan video besar).
export async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  { intervalMs = 3000, timeoutMs = 5 * 60 * 1000 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getContainerStatus(containerId, accessToken);
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Container gagal diproses Meta, status: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timeout menunggu container siap dipublish");
}

export async function publishContainer(params: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}): Promise<string> {
  const body = new URLSearchParams({
    creation_id: params.creationId,
    access_token: params.accessToken,
  });

  const res = await fetch(`${GRAPH_BASE}/${params.igUserId}/media_publish`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(`Gagal publish container (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
