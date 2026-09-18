import { env } from "@/utils/env";
import { NextResponse } from "next/server";

const RD_BASE = "https://api.real-debrid.com/rest/1.0";

type RdTorrent = {
  id: string | number;
  filename?: string;
  original_filename?: string;
  status?: string;
  progress?: number;
  bytes?: number;
};

type RdDownload = {
  id: string | number;
  filename?: string;
  link?: string;
  filesize?: number;
  size?: number;
};

type RdTorrentFile = {
  id: number | string;
  path?: string;
  bytes?: number;
  selected?: number;
};

type RdTorrentInfo = {
  id: string | number;
  filename?: string;
  status?: string;
  files?: RdTorrentFile[];
  links?: string[];
};

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

const authHeaders = () => ({
  Authorization: `Bearer ${env.REALDEBRID_API_TOKEN}`,
  Accept: "application/json",
});

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(2160p|1080p|720p|480p|4k|8k|uhd|fhd|web[- ]?dl|web[- ]?rip|bluray|blu[- ]?ray|brrip|hdr|dv|x264|x265|hevc|h264|h265|aac|ddp|atmos|remux|proper|repack|extended|multi|dual audio|dubbed|subbed)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreName(name: string, query: string) {
  const n = normalize(name);
  const q = normalize(query);
  if (!n || !q) return 0;
  if (n.includes(q)) return 100;

  const qTokens = q.split(" ").filter((x) => x.length >= 2);
  if (!qTokens.length) return 0;
  const nTokens = new Set(n.split(" "));
  const matched = qTokens.filter((token) => nTokens.has(token)).length;
  return Math.round((matched / qTokens.length) * 90);
}

async function rdFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RD_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : `Real-Debrid returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data as T;
}

export async function GET(request: Request) {
  if (!env.REALDEBRID_API_TOKEN) return json({ success: false, message: "Real-Debrid is not configured on the server." }, 503);

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() || "";
  const action = searchParams.get("action") || "search";
  const torrentId = searchParams.get("torrentId") || "";
  const downloadId = searchParams.get("downloadId") || "";

  try {
    if (action === "torrent-info" && torrentId) {
      const info = await rdFetch<RdTorrentInfo>(`/torrents/info/${encodeURIComponent(torrentId)}`);
      let linkIndex = 0;
      const files = (info.files || [])
        .map((file, index) => {
          const selected = Boolean(file.selected);
          const link = selected ? info.links?.[linkIndex++] || null : null;
          return {
            id: String(file.id),
            name: file.path?.split("/").pop() || file.path || `File ${index + 1}`,
            path: file.path || "",
            size: file.bytes ?? null,
            selected,
            link,
          };
        })
        .filter((file) => file.selected || Boolean(file.link));
      return json({ success: true, torrent: { id: String(info.id), name: info.filename || "Torrent", status: info.status || "" }, files });
    }

    if (action === "download" && downloadId) {
      const downloads = await rdFetch<RdDownload[]>(`/downloads?limit=5000`);
      const item = downloads.find((download) => String(download.id) === downloadId);
      if (!item?.link) return json({ success: false, message: "Real-Debrid download link was not found." }, 404);
      return json({ success: true, url: item.link, name: item.filename || "Real-Debrid file" });
    }

    if (action === "resolve-link") {
      const link = searchParams.get("link") || "";
      const name = searchParams.get("name") || "Real-Debrid file";
      if (!link) return json({ success: false, message: "A Real-Debrid link is required." }, 400);
      const form = new URLSearchParams({ link });
      const response = await fetch(`${RD_BASE}/unrestrict/link`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
      });
      const text = await response.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!response.ok || typeof data !== "object" || !data || !("download" in data)) {
        const message = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : `Real-Debrid could not resolve ${name}.`;
        return json({ success: false, message }, response.status || 502);
      }
      return json({ success: true, url: String((data as { download: unknown }).download), name });
    }

    if (!title) return json({ success: false, message: "A movie or episode title is required." }, 400);

    const [torrents, downloads] = await Promise.all([
      rdFetch<RdTorrent[]>(`/torrents?limit=5000`),
      rdFetch<RdDownload[]>(`/downloads?limit=5000`),
    ]);

    const torrentResults = torrents
      .map((item) => ({
        id: String(item.id),
        name: item.filename || item.original_filename || `Torrent ${item.id}`,
        status: item.status || "",
        progress: item.progress ?? null,
        score: scoreName(item.filename || item.original_filename || "", title),
      }))
      .filter((item) => item.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    const downloadResults = downloads
      .map((item) => ({
        id: String(item.id),
        name: item.filename || `Download ${item.id}`,
        size: item.filesize ?? item.size ?? null,
        score: scoreName(item.filename || "", title),
      }))
      .filter((item) => item.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    return json({
      success: true,
      query: title,
      torrents: torrentResults,
      downloads: downloadResults,
      note: "This searches media already present in your Real-Debrid account. The official API does not document a public title-based global cache search endpoint.",
    });
  } catch (error) {
    return json({ success: false, message: error instanceof Error ? error.message : "Real-Debrid request failed." }, 502);
  }
}
