import { env } from "@/utils/env";
import { NextRequest, NextResponse } from "next/server";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const getString = (value: unknown) => (typeof value === "string" ? value : "");

async function realDebridList() {
  if (!env.REALDEBRID_API_TOKEN) return json({ success: false, message: "Real-Debrid is not configured." }, 503);
  const response = await fetch("https://api.real-debrid.com/rest/1.0/downloads?limit=100", {
    headers: { Authorization: `Bearer ${env.REALDEBRID_API_TOKEN}` }, cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) return json({ success: false, message: data?.error || "Real-Debrid request failed." }, response.status);
  return json({ success: true, provider: "realdebrid", files: Array.isArray(data) ? data.map((item: any) => ({
    id: String(item.id ?? ""), name: item.filename || item.name || `File ${item.id ?? ""}`,
    url: item.download || item.link || "", size: item.filesize ?? item.size ?? null,
  })).filter((item: any) => item.url) : [] });
}

async function torboxList(id?: string) {
  if (!env.TORBOX_API_TOKEN) return json({ success: false, message: "TorBox is not configured." }, 503);
  const url = new URL("https://api.torbox.app/v1/api/torrents/mylist");
  url.searchParams.set("limit", "1000"); if (id) url.searchParams.set("id", id);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.TORBOX_API_TOKEN}` }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data?.success === false) return json({ success: false, message: data?.detail || data?.error || "TorBox request failed." }, response.status || 502);
  const torrents = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  if (!id) return json({ success: true, provider: "torbox", torrents: torrents.map((item: any) => ({ id: String(item.id), name: item.name || item.short_name || `Torrent ${item.id}`, status: item.download_state || item.status || "unknown" })) });
  const torrent = torrents[0];
  const files = Array.isArray(torrent?.files) ? torrent.files : [];
  return json({ success: true, provider: "torbox", torrent: { id: String(torrent?.id ?? id), name: torrent?.name || torrent?.short_name || `Torrent ${id}` }, files: files.map((file: any) => ({ id: String(file.id), name: file.name || file.short_name || `File ${file.id}`, size: file.size ?? file.filesize ?? null })) });
}

async function torboxResolve(torrentId: string, fileId: string) {
  if (!env.TORBOX_API_TOKEN) return json({ success: false, message: "TorBox is not configured." }, 503);
  const url = new URL("https://api.torbox.app/v1/api/torrents/requestdl");
  url.searchParams.set("token", env.TORBOX_API_TOKEN); url.searchParams.set("torrent_id", torrentId); url.searchParams.set("file_id", fileId); url.searchParams.set("redirect", "false");
  const response = await fetch(url, { cache: "no-store" }); const data = await response.json();
  if (!response.ok || data?.success === false || typeof data?.data !== "string") return json({ success: false, message: data?.detail || data?.error || "TorBox could not create a download link." }, response.status || 502);
  return json({ success: true, provider: "torbox", url: data.data });
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider");
  const id = request.nextUrl.searchParams.get("id") || undefined;
  const fileId = request.nextUrl.searchParams.get("fileId") || undefined;
  try {
    if (provider === "realdebrid") return realDebridList();
    if (provider === "torbox" && id && fileId) return torboxResolve(id, fileId);
    if (provider === "torbox") return torboxList(id);
    return json({ success: false, message: "Unknown provider." }, 400);
  } catch { return json({ success: false, message: "Provider request failed." }, 502); }
}
