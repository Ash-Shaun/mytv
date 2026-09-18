"use client";

import { useEffect, useMemo, useState } from "react";

type Provider = "realdebrid" | "torbox";
type FileItem = { id: string; name: string; url?: string; size?: number | null };
type Torrent = { id: string; name: string; status: string };

interface ProviderPlayerProps { provider: Provider; title: string; filterTitle?: string; }

const ProviderPlayer: React.FC<ProviderPlayerProps> = ({ provider, title, filterTitle }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<Torrent | null>(null);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState(filterTitle || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    const load = async () => {
      try {
        const response = await fetch(`/api/player/provider?provider=${provider}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Provider request failed.");
        if (cancelled) return;
        if (provider === "realdebrid") setFiles(data.files || []); else setTorrents(data.torrents || []);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Provider request failed."); }
      finally { if (!cancelled) setLoading(false); }
    };
    load(); return () => { cancelled = true; };
  }, [provider]);

  const filteredFiles = useMemo(() => files.filter((file) => file.name.toLowerCase().includes(query.toLowerCase())), [files, query]);
  const filteredTorrents = useMemo(() => torrents.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [torrents, query]);

  const chooseTorrent = async (torrent: Torrent) => {
    setLoading(true); setError(""); setSelectedTorrent(torrent);
    try {
      const response = await fetch(`/api/player/provider?provider=torbox&id=${encodeURIComponent(torrent.id)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Could not load files.");
      setFiles(data.files || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load files."); }
    finally { setLoading(false); }
  };

  const play = async (file: FileItem) => {
    setError("");
    if (provider === "realdebrid" && file.url) return setUrl(file.url);
    if (provider === "torbox" && selectedTorrent) {
      setLoading(true);
      try {
        const response = await fetch(`/api/player/provider?provider=torbox&id=${encodeURIComponent(selectedTorrent.id)}&fileId=${encodeURIComponent(file.id)}`, { cache: "no-store" });
        const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Could not create playback link.");
        setUrl(data.url);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create playback link."); }
      finally { setLoading(false); }
    }
  };

  if (url) return <video src={url} controls autoPlay playsInline className="z-10 h-full w-full bg-black" onError={() => setError("The provider link expired or cannot be played directly in this browser.")} />;

  return <div className="z-10 flex h-full w-full flex-col overflow-hidden bg-black p-4 text-white md:p-8">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-white/60">Your configured provider library</p></div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter files..." className="rounded-lg bg-white/10 px-4 py-3 outline-none ring-1 ring-white/10" />
      {selectedTorrent && provider === "torbox" && <button onClick={() => { setSelectedTorrent(null); setFiles([]); }} className="self-start rounded-md bg-white/10 px-3 py-2 text-sm">← Back to torrents</button>}
      {loading && <p className="text-white/60">Loading…</p>}
      {error && <p className="rounded-lg bg-red-500/15 p-3 text-red-300">{error}</p>}
      {!loading && !error && provider === "realdebrid" && filteredFiles.map((file) => <button key={file.id} onClick={() => play(file)} className="rounded-lg bg-white/10 p-4 text-left hover:bg-white/15">{file.name}</button>)}
      {!loading && !error && provider === "torbox" && !selectedTorrent && filteredTorrents.map((item) => <button key={item.id} onClick={() => chooseTorrent(item)} className="rounded-lg bg-white/10 p-4 text-left hover:bg-white/15"><span className="font-medium">{item.name}</span><span className="ml-2 text-xs text-white/50">{item.status}</span></button>)}
      {!loading && !error && provider === "torbox" && selectedTorrent && files.map((file) => <button key={file.id} onClick={() => play(file)} className="rounded-lg bg-white/10 p-4 text-left hover:bg-white/15">{file.name}</button>)}
      {!loading && !error && ((provider === "realdebrid" && filteredFiles.length === 0) || (provider === "torbox" && !selectedTorrent && filteredTorrents.length === 0)) && <p className="text-white/60">No matching items found in your provider library.</p>}
    </div>
  </div>;
};

export default ProviderPlayer;
