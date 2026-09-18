"use client";

import { useEffect, useState } from "react";

type Torrent = { id: string; name: string; status: string; progress: number | null; score: number };
type Download = { id: string; name: string; size: number | null; score: number };
type FileItem = { id: string; name: string; path: string; size: number | null; selected: boolean; link: string | null };

interface ProviderPlayerProps {
  provider: "realdebrid";
  title: string;
  filterTitle?: string;
  contentType?: "movie" | "tv";
  season?: number;
  episode?: number;
}

const ProviderPlayer: React.FC<ProviderPlayerProps> = ({ provider, title, filterTitle }) => {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<Torrent | null>(null);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState(filterTitle || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setSelectedTorrent(null);
    setFiles([]);
    setUrl("");
    try {
      const response = await fetch(`/api/player/provider?provider=${provider}&title=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Real-Debrid request failed.");
      setTorrents(data.torrents || []);
      setDownloads(data.downloads || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Real-Debrid request failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterTitle) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, filterTitle]);

  const chooseTorrent = async (torrent: Torrent) => {
    setLoading(true);
    setError("");
    setSelectedTorrent(torrent);
    try {
      const response = await fetch(`/api/player/provider?provider=${provider}&action=torrent-info&torrentId=${encodeURIComponent(torrent.id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not load torrent files.");
      setFiles(data.files || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load torrent files.");
    } finally {
      setLoading(false);
    }
  };

  const playLink = async (link: string | null, name: string) => {
    if (!link) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/player/provider?provider=${provider}&action=resolve-link&link=${encodeURIComponent(link)}&name=${encodeURIComponent(name)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not create playback link.");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create playback link.");
    } finally {
      setLoading(false);
    }
  };

  const playDownload = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/player/provider?provider=${provider}&action=download&downloadId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not load download.");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load download.");
    } finally {
      setLoading(false);
    }
  };

  if (url) {
    return (
      <div className="z-10 flex h-full w-full bg-black">
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="h-full w-full"
          onError={() => setError("The Real-Debrid playback link expired or cannot be played directly in this browser.")}
        />
        {error && <p className="absolute bottom-4 left-4 right-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{error}</p>}
      </div>
    );
  }

  return (
    <div className="z-10 flex h-full w-full flex-col overflow-hidden bg-black p-4 text-white md:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 overflow-y-auto">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-white/60">Real-Debrid files already in your account</p>
        </div>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} placeholder="Search your Real-Debrid library..." className="min-w-0 flex-1 rounded-lg bg-white/10 px-4 py-3 outline-none ring-1 ring-white/10" />
          <button onClick={() => void load()} className="rounded-lg bg-white/15 px-4 py-3 hover:bg-white/20">Search</button>
        </div>
        {selectedTorrent && <button onClick={() => { setSelectedTorrent(null); setFiles([]); }} className="self-start rounded-md bg-white/10 px-3 py-2 text-sm">← Back to matches</button>}
        {loading && <p className="text-white/60">Searching Real-Debrid…</p>}
        {error && <p className="rounded-lg bg-red-500/15 p-3 text-red-300">{error}</p>}

        {!loading && !error && !selectedTorrent && torrents.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white/70">Torrents</h3>
            {torrents.map((torrent) => (
              <button key={torrent.id} onClick={() => void chooseTorrent(torrent)} className="block w-full rounded-lg bg-white/10 p-4 text-left hover:bg-white/15">
                <span className="block font-medium">{torrent.name}</span>
                <span className="text-xs text-white/50">{torrent.status}{torrent.progress !== null ? ` • ${torrent.progress}%` : ""}</span>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && !selectedTorrent && downloads.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white/70">Downloads</h3>
            {downloads.map((download) => (
              <button key={download.id} onClick={() => void playDownload(download.id)} className="block w-full rounded-lg bg-white/10 p-4 text-left hover:bg-white/15">{download.name}</button>
            ))}
          </div>
        )}

        {!loading && !error && selectedTorrent && files.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white/70">Files</h3>
            {files.map((file) => (
              <button key={file.id} onClick={() => void playLink(file.link, file.name)} className="block w-full rounded-lg bg-white/10 p-4 text-left hover:bg-white/15">{file.name}</button>
            ))}
          </div>
        )}

        {!loading && !error && !selectedTorrent && torrents.length === 0 && downloads.length === 0 && <p className="text-white/60">No matching files were found in your Real-Debrid account.</p>}
        {!loading && !error && selectedTorrent && files.length === 0 && <p className="text-white/60">No playable files were returned for this torrent.</p>}
      </div>
    </div>
  );
};

export default ProviderPlayer;
