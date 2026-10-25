"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, Eraser, ImagePlus, Maximize2, MessageCircle, Mic, MicOff, MonitorUp, MoreHorizontal, PenLine, Send, Settings, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Role = "CREATOR" | "LEARNER";
type Person = { userId: string; name: string; role: Role };
type ChatMessage = { id: string; userId: string; name: string; body: string };
type BoardLine = { id: string; points: Array<[number, number]>; color: string; width: number };
type Signal = { from: string; to: string; kind: "offer" | "answer" | "candidate"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export function InstantLiveClassroom({ roomId, title, code, userId, userName, role }: { roomId: string; title: string; code: string; userId: string; userName: string; role: Role }) {
  const supabase = useRef(createClient()).current;
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localAudio = useRef<MediaStream | null>(null);
  const localScreen = useRef<MediaStream | null>(null);
  const localScreenVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const [people, setPeople] = useState<Person[]>([{ userId, name: userName, role }]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [board, setBoard] = useState<BoardLine[]>([]);
  const [stage, setStage] = useState<"whiteboard" | "screen" | "image">("whiteboard");
  const [image, setImage] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [drawer, setDrawer] = useState<"chat" | "people">("chat");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [ended, setEnded] = useState(false);
  const drawing = useRef<BoardLine | null>(null);

  const broadcast = useCallback((event: string, payload: unknown) => { void channel.current?.send({ type: "broadcast", event, payload }); }, []);

  const renegotiate = useCallback(async (peerId: string, force = false) => {
    const pc = peers.current.get(peerId);
    if (!pc || (!force && userId > peerId) || pc.signalingState !== "stable") return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    broadcast("signal", { from: userId, to: peerId, kind: "offer", description: offer });
  }, [broadcast, userId]);

  const ensurePeer = useCallback((peerId: string) => {
    const existing = peers.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    if (localAudio.current) localAudio.current.getTracks().forEach((track) => pc.addTrack(track, localAudio.current!));
    if (localScreen.current) localScreen.current.getTracks().forEach((track) => pc.addTrack(track, localScreen.current!));
    pc.onicecandidate = (event) => { if (event.candidate) broadcast("signal", { from: userId, to: peerId, kind: "candidate", candidate: event.candidate.toJSON() }); };
    pc.ontrack = (event) => {
      if (event.track.kind === "audio") {
        let audio = remoteAudio.current.get(peerId);
        if (!audio) { audio = document.createElement("audio"); audio.autoplay = true; audio.setAttribute("aria-label", `Audio from ${peerId}`); document.body.appendChild(audio); remoteAudio.current.set(peerId, audio); }
        audio.srcObject = event.streams[0];
      }
      if (event.track.kind === "video") { setStage("screen"); setRemoteScreen((current) => { const next = new MediaStream(current ? current.getTracks() : []); next.addTrack(event.streams[0]?.getVideoTracks()[0] ?? event.track); return next; }); }
    };
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState)) { pc.close(); peers.current.delete(peerId); } };
    peers.current.set(peerId, pc);
    return pc;
  }, [broadcast, userId]);

  const [remoteScreen, setRemoteScreen] = useState<MediaStream | null>(null);
  const remoteScreenVideo = useRef<HTMLVideoElement>(null);

  const handleSignal = useCallback(async (signal: Signal) => {
    if (signal.to !== userId) return;
    const pc = ensurePeer(signal.from);
    try {
      if (signal.kind === "offer" && signal.description) {
        await pc.setRemoteDescription(signal.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        broadcast("signal", { from: userId, to: signal.from, kind: "answer", description: answer });
      } else if (signal.kind === "answer" && signal.description) await pc.setRemoteDescription(signal.description);
      else if (signal.kind === "candidate" && signal.candidate) await pc.addIceCandidate(signal.candidate);
    } catch { setNotice("A participant connection needs to reconnect."); }
  }, [broadcast, ensurePeer, userId]);

  useEffect(() => { if (remoteScreenVideo.current) remoteScreenVideo.current.srcObject = remoteScreen; }, [remoteScreen]);
  useEffect(() => { if (localScreenVideo.current) localScreenVideo.current.srcObject = localScreen.current; }, [sharing]);
  useEffect(() => {
    const boardCanvas = canvas.current; if (!boardCanvas) return;
    const ctx = boardCanvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    for (const line of board) { ctx.strokeStyle = line.color; ctx.lineWidth = line.width; ctx.lineCap = "round"; ctx.beginPath(); line.points.forEach(([x, y], index) => index ? ctx.lineTo(x * boardCanvas.width, y * boardCanvas.height) : ctx.moveTo(x * boardCanvas.width, y * boardCanvas.height)); ctx.stroke(); }
  }, [board]);

  useEffect(() => {
    const room = supabase.channel(`instant-room:${roomId}`, { config: { presence: { key: userId }, broadcast: { ack: true } } });
    channel.current = room;
    room.on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as Signal));
    room.on("broadcast", { event: "chat" }, ({ payload }) => setChat((current) => [...current, payload as ChatMessage]));
    room.on("broadcast", { event: "board" }, ({ payload }) => setBoard((current) => current.some((line) => line.id === (payload as BoardLine).id) ? current : [...current, payload as BoardLine]));
    room.on("broadcast", { event: "image" }, ({ payload }) => { setImage(String((payload as { src: string }).src)); setStage("image"); });
    room.on("broadcast", { event: "room-ended" }, () => setEnded(true));
    room.on("presence", { event: "sync" }, () => {
      const state = room.presenceState<Person>();
      const next = Object.values(state).flat().filter((person) => person.userId !== userId);
      setPeople([{ userId, name: userName, role }, ...next]);
      next.forEach((person) => { const pc = ensurePeer(person.userId); if (userId < person.userId && pc.signalingState === "stable") void renegotiate(person.userId); });
    });
    void room.subscribe(async (status) => { if (status === "SUBSCRIBED") await room.track({ userId, name: userName, role }); });
    return () => { void room.untrack(); void supabase.removeChannel(room); peers.current.forEach((pc) => pc.close()); remoteAudio.current.forEach((audio) => audio.remove()); localAudio.current?.getTracks().forEach((track) => track.stop()); localScreen.current?.getTracks().forEach((track) => track.stop()); };
  }, [ensurePeer, handleSignal, renegotiate, role, roomId, supabase, userId, userName]);

  async function toggleMic() {
    try {
      if (!localAudio.current) {
        localAudio.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        peers.current.forEach((pc) => localAudio.current?.getTracks().forEach((track) => pc.addTrack(track, localAudio.current!)));
      }
      const next = !micOn; localAudio.current.getAudioTracks().forEach((track) => { track.enabled = next; }); setMicOn(next);
      if (next) peers.current.forEach((_pc, peerId) => void renegotiate(peerId, true));
    } catch { setNotice("Microphone permission was not granted. Check your browser settings and try again."); }
  }

  async function toggleScreen() {
    if (sharing) { localScreen.current?.getTracks().forEach((track) => track.stop()); localScreen.current = null; peers.current.forEach((pc) => pc.getSenders().filter((sender) => sender.track?.kind === "video").forEach((sender) => pc.removeTrack(sender))); setSharing(false); setStage("whiteboard"); peers.current.forEach((_pc, peerId) => void renegotiate(peerId, true)); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); localScreen.current = stream; setSharing(true); setStage("screen"); stream.getVideoTracks()[0].onended = () => { localScreen.current = null; setSharing(false); setStage("whiteboard"); };
      peers.current.forEach((pc) => stream.getTracks().forEach((track) => pc.addTrack(track, stream))); peers.current.forEach((_pc, peerId) => void renegotiate(peerId, true));
    } catch { setNotice("Screen sharing was cancelled or blocked by the browser."); }
  }

  function sendChat(event: React.FormEvent) { event.preventDefault(); const body = draft.trim(); if (!body) return; const message = { id: crypto.randomUUID(), userId, name: userName, body }; setChat((current) => [...current, message]); broadcast("chat", message); setDraft(""); }
  function draw(event: React.PointerEvent<HTMLCanvasElement>) { if (role !== "CREATOR") return; const rect = event.currentTarget.getBoundingClientRect(); const point: [number, number] = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]; if (event.type === "pointerdown") { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = { id: crypto.randomUUID(), points: [point], color: "#4f46e5", width: 4 }; } else if (drawing.current) { drawing.current.points.push(point); setBoard((current) => [...current.filter((line) => line.id !== drawing.current?.id), drawing.current!]); } }
  function endDraw() { if (drawing.current) { broadcast("board", drawing.current); drawing.current = null; } }
  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file || file.size > 180_000 || !file.type.startsWith("image/")) { setNotice("Choose an image under 180 KB for the live stage."); return; } const reader = new FileReader(); reader.onload = () => { const src = String(reader.result); setImage(src); setStage("image"); broadcast("image", { src }); }; reader.readAsDataURL(file); event.target.value = ""; }
  async function endClass() { if (role !== "CREATOR" || !window.confirm("End this live class for everyone?")) return; await fetch(`/api/instant-live/rooms/${roomId}/end`, { method: "POST" }); broadcast("room-ended", {}); setEnded(true); }
  async function copyLink() { await navigator.clipboard.writeText(`${window.location.origin}/live/join/${code}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <main className="min-h-screen bg-[#0d1421] text-white">
    <header className="flex min-h-20 items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-7"><div className="flex items-center gap-3 text-lg font-extrabold"><span className="grid size-9 place-items-center rounded-xl bg-[#ff6966] text-[#0d1421]">B</span><span>BrenUp</span></div><span className="hidden h-8 w-px bg-white/20 sm:block" /><h1 className="min-w-0 truncate text-lg font-extrabold sm:text-2xl">{title}</h1><span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300"><i className="size-2 rounded-full bg-emerald-400" />Live</span><span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold sm:inline-flex"><UsersRound size={15} />{people.length}</span><div className="ml-auto flex items-center gap-2"><button onClick={() => void copyLink()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-400/60 px-3 text-sm font-bold text-indigo-100">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button><button aria-label="Settings" className="hidden rounded-lg p-2 text-white/70 hover:bg-white/10 sm:block"><Settings size={19} /></button><button aria-label="Full screen" className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 size={19} /></button></div></header>
    {notice ? <div role="alert" className="mx-4 mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 sm:mx-7">{notice}<button className="ml-3 font-bold underline" onClick={() => setNotice("")}>Dismiss</button></div> : null}
    <div className="grid min-h-[calc(100vh-80px)] grid-cols-1 gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid min-h-[620px] grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-[#141e2e] p-3"><nav className="flex flex-col items-center gap-3 rounded-xl bg-[#0d1421] p-2"><button className="grid size-11 place-items-center rounded-xl bg-indigo-500 text-white" aria-label="Select tool"><PenLine size={20} /></button><button onClick={() => setStage("whiteboard")} className={`grid size-11 place-items-center rounded-xl ${stage === "whiteboard" ? "bg-indigo-500/20 text-indigo-200" : "text-white/70 hover:bg-white/10"}`} aria-label="Whiteboard"><PenLine size={20} /></button><button onClick={() => void toggleScreen()} className={`grid size-11 place-items-center rounded-xl ${sharing ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`} aria-label="Share screen"><MonitorUp size={20} /></button><label className="grid size-11 cursor-pointer place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="Upload image"><ImagePlus size={20} /><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadImage(event)} /></label><button className="grid size-11 place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="Lesson content"><BookOpen size={20} /></button><button className="mt-auto grid size-11 place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="More tools"><MoreHorizontal size={20} /></button></nav><div className="flex min-w-0 flex-col rounded-xl bg-white p-3"><div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-slate-50"><canvas ref={canvas} width={1200} height={700} className={`absolute inset-0 size-full ${stage === "whiteboard" && role === "CREATOR" ? "cursor-crosshair" : ""}`} onPointerDown={draw} onPointerMove={draw} onPointerUp={endDraw} onPointerCancel={endDraw} hidden={stage !== "whiteboard"} />{stage === "image" && image ? <img src={image} alt="Shared by the creator" className="size-full object-contain" /> : null}{stage === "screen" ? <><video ref={localScreenVideo} autoPlay muted playsInline className={`size-full object-contain ${sharing ? "" : "hidden"}`} /><video ref={remoteScreenVideo} autoPlay playsInline className={`size-full object-contain ${sharing ? "hidden" : ""}`} /></> : null}{ended ? <div className="absolute inset-0 grid place-items-center bg-slate-100 text-center text-slate-700"><div><h2 className="text-xl font-extrabold">This class has ended</h2><p className="mt-1 text-sm">The live room is no longer available.</p></div></div> : null}</div><div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-slate-900"><button onClick={toggleMic} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold ${micOn ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}{micOn ? "Mic on" : "Mic off"}</button><button onClick={() => void toggleScreen()} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold ${sharing ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}><MonitorUp size={18} />{sharing ? "Stop sharing" : "Share screen"}</button>{role === "CREATOR" ? <button onClick={() => setBoard([])} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700"><Eraser size={18} />Clear board</button> : null}{role === "CREATOR" ? <button onClick={() => void endClass()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff6966] px-5 text-sm font-extrabold text-white">End class</button> : <button onClick={() => window.location.assign("/account")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700"><X size={18} />Leave</button>}</div></div></section>
      <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141e2e]"><div className="flex border-b border-white/10"><button onClick={() => setDrawer("chat")} className={`flex-1 px-4 py-4 text-sm font-extrabold ${drawer === "chat" ? "border-b-2 border-indigo-400 text-indigo-200" : "text-white/60"}`}><MessageCircle className="mr-2 inline" size={17} />Chat</button><button onClick={() => setDrawer("people")} className={`flex-1 px-4 py-4 text-sm font-extrabold ${drawer === "people" ? "border-b-2 border-indigo-400 text-indigo-200" : "text-white/60"}`}><UsersRound className="mr-2 inline" size={17} />People</button></div>{drawer === "chat" ? <><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{chat.map((message) => <div key={message.id} className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-white/60">{message.name}</p><p className="mt-1 text-sm leading-6">{message.body}</p></div>)}{!chat.length ? <p className="py-10 text-center text-sm text-white/45">Your class chat will appear here.</p> : null}</div><form onSubmit={sendChat} className="m-4 flex gap-2 rounded-xl border border-white/15 bg-white/5 p-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message…" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/40" aria-label="Chat message" /><button className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white" aria-label="Send chat message"><Send size={17} /></button></form></> : <div className="space-y-2 p-4">{people.map((person) => <div key={person.userId} className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><span className="grid size-9 place-items-center rounded-full bg-indigo-300 font-bold text-slate-900">{person.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{person.name}{person.userId === userId ? " (you)" : ""}</span><span className="text-xs text-white/50">{person.role === "CREATOR" ? "Creator" : "Learner"}</span></div>)}</div>}</aside>
    </div>
  </main>;
}
