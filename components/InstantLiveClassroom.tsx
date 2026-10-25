"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, Eraser, Highlighter, ImagePlus, Maximize2, MessageCircle, Mic, MicOff, MonitorUp, MoreHorizontal, MousePointer2, PenLine, Pointer, Send, Settings, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Role = "CREATOR" | "LEARNER";
type Person = { userId: string; name: string; role: Role };
type ChatMessage = { id: string; userId: string; name: string; body: string };
type WhiteboardTool = "select" | "pen" | "highlighter" | "eraser" | "pointer" | "laser" | "text" | "shape";
type ShapeKind = "rectangle" | "circle" | "line" | "arrow";
type BoardLine = { id: string; points: Array<[number, number]>; color: string; width: number; tool?: Exclude<WhiteboardTool, "select" | "eraser">; text?: string; shape?: ShapeKind };
type ImageAsset = { id: string; src: string; name: string };
type Signal = { from: string; to: string; kind: "offer" | "answer" | "candidate"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export function InstantLiveClassroom({ roomId, title, code, startedAt, userId, userName, role }: { roomId: string; title: string; code: string; startedAt: string; userId: string; userName: string; role: Role }) {
  const supabase = useRef(createClient()).current;
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localAudio = useRef<MediaStream | null>(null);
  const localScreen = useRef<MediaStream | null>(null);
  const localScreenVideo = useRef<HTMLVideoElement>(null);
  const classroom = useRef<HTMLElement>(null);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const [people, setPeople] = useState<Person[]>([{ userId, name: userName, role }]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [board, setBoard] = useState<BoardLine[]>([]);
  const [whiteboardTool, setWhiteboardTool] = useState<WhiteboardTool>("pen");
  const [stage, setStage] = useState<"whiteboard" | "screen" | "image">("whiteboard");
  const [image, setImage] = useState<string | null>(null);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [drawer, setDrawer] = useState<"chat" | "people">("chat");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [ended, setEnded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageZoom, setStageZoom] = useState(1);
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [livePointer, setLivePointer] = useState<[number, number] | null>(null);
  const drawing = useRef<BoardLine | null>(null);
  const selectionDrag = useRef<{ id: string; start: [number, number]; original: BoardLine } | null>(null);
  const stagePointers = useRef(new Map<number, { x: number; y: number }>());
  const stageGesture = useRef<{ distance: number; zoom: number } | null>(null);
  const stageZoomRef = useRef(1);
  const stagePanRef = useRef({ x: 0, y: 0 });
  const stageLastTap = useRef(0);
  const [railPosition, setRailPosition] = useState({ x: 16, y: 112 });
  const railPositionRef = useRef(railPosition);
  const railDrag = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const boardRef = useRef<BoardLine[]>([]);
  const undoStack = useRef<BoardLine[][]>([]);
  const redoStack = useRef<BoardLine[][]>([]);

  useEffect(() => {
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  useEffect(() => { boardRef.current = board; }, [board]);

  function recordBoardHistory() {
    undoStack.current.push(boardRef.current.map((line) => ({ ...line, points: line.points.map(([x, y]) => [x, y] as [number, number]) })));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }
  function replaceBoard(next: BoardLine[]) { boardRef.current = next; setBoard(next); }
  function syncBoardSnapshot(next: BoardLine[]) {
    broadcast("board-clear", {});
    next.forEach((line) => broadcast("board", line));
  }
  function undoBoard() {
    const previous = undoStack.current.pop(); if (!previous) return;
    redoStack.current.push(boardRef.current); replaceBoard(previous); syncBoardSnapshot(previous); setSelectedBoardId(null);
  }
  function redoBoard() {
    const next = redoStack.current.pop(); if (!next) return;
    undoStack.current.push(boardRef.current); replaceBoard(next); syncBoardSnapshot(next); setSelectedBoardId(null);
  }

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === classroom.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

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
        const stream = audio.srcObject instanceof MediaStream ? audio.srcObject : new MediaStream();
        if (!stream.getAudioTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
        audio.srcObject = stream;
        event.track.addEventListener("ended", () => stream.removeTrack(event.track), { once: true });
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
    if (role !== "LEARNER" || !window.matchMedia("(pointer: coarse)").matches) return;
    const viewport = document.querySelector<HTMLElement>('[data-role="LEARNER"] > div.grid > section > div > div.relative');
    if (!viewport) return;
    const clampZoom = (value: number) => Math.min(3.5, Math.max(1, value));
    const applyTransform = () => {
      const transform = `translate(${stagePanRef.current.x}px, ${stagePanRef.current.y}px) scale(${stageZoomRef.current})`;
      viewport.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => {
        child.style.transform = transform;
        child.style.transformOrigin = "center center";
        child.style.transition = "transform 120ms ease-out";
      });
    };
    const distance = () => {
      const points = [...stagePointers.current.values()];
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      stagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const now = Date.now();
      if (now - stageLastTap.current < 280) {
        const nextZoom = stageZoomRef.current > 1 ? 1 : 2.5;
        stageZoomRef.current = nextZoom;
        stagePanRef.current = { x: 0, y: 0 };
        setStageZoom(nextZoom);
        setStagePan({ x: 0, y: 0 });
      }
      stageLastTap.current = now;
      if (stagePointers.current.size === 2) stageGesture.current = { distance: distance(), zoom: stageZoomRef.current };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!stagePointers.current.has(event.pointerId)) return;
      event.preventDefault();
      const previous = stagePointers.current.get(event.pointerId);
      if (!previous) return;
      stagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (stagePointers.current.size === 2 && stageGesture.current) {
        const nextZoom = clampZoom(stageGesture.current.zoom * (distance() / Math.max(stageGesture.current.distance, 1)));
        stageZoomRef.current = nextZoom;
        setStageZoom(nextZoom);
      } else if (stagePointers.current.size === 1 && stageZoomRef.current > 1) {
        const current = stagePointers.current.get(event.pointerId);
        if (!current) return;
        const nextPan = { x: stagePanRef.current.x + (current.x - previous.x), y: stagePanRef.current.y + (current.y - previous.y) };
        stagePanRef.current = nextPan;
        setStagePan(nextPan);
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      stagePointers.current.delete(event.pointerId);
      if (stagePointers.current.size < 2) stageGesture.current = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const nextZoom = clampZoom(stageZoomRef.current - event.deltaY * 0.01);
      stageZoomRef.current = nextZoom;
      if (nextZoom === 1) stagePanRef.current = { x: 0, y: 0 };
      setStageZoom(nextZoom);
      setStagePan(stagePanRef.current);
    };
    viewport.style.touchAction = "none";
    viewport.setAttribute("aria-label", "Shared stage. Double-tap to zoom and drag to move around.");
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerEnd);
    viewport.addEventListener("pointercancel", onPointerEnd);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    stageZoomRef.current = 1;
    stagePanRef.current = { x: 0, y: 0 };
    setStageZoom(1);
    setStagePan({ x: 0, y: 0 });
    applyTransform();
    return () => {
      viewport.style.touchAction = "";
      viewport.removeAttribute("aria-label");
      viewport.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => { child.style.transform = ""; child.style.transformOrigin = ""; child.style.transition = ""; });
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerEnd);
      viewport.removeEventListener("pointercancel", onPointerEnd);
      viewport.removeEventListener("wheel", onWheel);
      stagePointers.current.clear();
      stageGesture.current = null;
    };
  }, [role, stage]);
  useEffect(() => {
    const content = classroom.current?.querySelector<HTMLElement>("div.grid > section > div");
    if (!content) return;
    content.querySelector('[data-live-image-gallery="true"]')?.remove();
    if (!images.length) return;
    const bottomRail = content.lastElementChild;
    if (!bottomRail) return;
    const gallery = document.createElement("div");
    gallery.dataset.liveImageGallery = "true";
    gallery.className = "my-2 flex min-h-14 max-w-full items-center gap-2 overflow-x-auto rounded-xl bg-[#0d1421] px-2 py-1.5";
    images.forEach((asset) => {
      const button = document.createElement("button");
      button.type = "button"; button.title = asset.name; button.setAttribute("aria-label", `Show ${asset.name}`);
      button.className = "size-11 shrink-0 overflow-hidden rounded-lg border-2 border-white/15 bg-white/10 p-0.5 hover:border-indigo-400";
      if (asset.src === image) button.className += " border-indigo-400";
      const thumbnail = document.createElement("img"); thumbnail.src = asset.src; thumbnail.alt = asset.name; thumbnail.className = "size-full rounded-md object-cover";
      button.appendChild(thumbnail);
      button.addEventListener("click", () => { setImage(asset.src); setStage("image"); if (role === "CREATOR") { broadcast("stage", { stage: "image" }); broadcast("image", asset); } });
      gallery.appendChild(button);
    });
    content.insertBefore(gallery, bottomRail);
  }, [broadcast, image, images, role]);
  useEffect(() => {
    classroom.current?.querySelectorAll<HTMLElement>('[aria-label="Upload image"]').forEach((label) => {
      label.setAttribute("aria-label", "Image");
      label.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === "Upload image") node.textContent = "Image"; });
    });
  }, [role, stage]);
  useEffect(() => {
    if (role !== "LEARNER" || !window.matchMedia("(pointer: coarse)").matches) return;
    const viewport = document.querySelector<HTMLElement>('[data-role="LEARNER"] > div.grid > section > div > div.relative');
    if (!viewport) return;
    const transform = `translate(${stagePan.x}px, ${stagePan.y}px) scale(${stageZoom})`;
    viewport.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => { child.style.transform = transform; child.style.transformOrigin = "center center"; child.style.transition = "transform 120ms ease-out"; });
  }, [role, stagePan, stageZoom]);
  useEffect(() => {
    if (role !== "CREATOR" || stage !== "whiteboard") return;
    const rail = document.querySelector<HTMLElement>('[data-role="CREATOR"] nav[aria-label="Whiteboard tools"]');
    if (!rail) return;
    rail.style.left = `${railPositionRef.current.x}px`;
    rail.style.top = `${railPositionRef.current.y}px`;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const rect = rail.getBoundingClientRect();
      railDrag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      rail.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!railDrag.current) return;
      const next = {
        x: Math.max(8, Math.min(window.innerWidth - rail.offsetWidth - 8, event.clientX - railDrag.current.offsetX)),
        y: Math.max(80, Math.min(window.innerHeight - rail.offsetHeight - 8, event.clientY - railDrag.current.offsetY)),
      };
      railPositionRef.current = next;
      setRailPosition(next);
      rail.style.left = `${next.x}px`;
      rail.style.top = `${next.y}px`;
    };
    const onPointerEnd = (event: PointerEvent) => {
      railDrag.current = null;
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    };
    rail.style.cursor = "move";
    rail.style.touchAction = "none";
    const addedTools: HTMLButtonElement[] = [];
    const toolButtons: Array<[string, string, string, (() => void)?]> = [
      ["text", "T", "Text", () => setWhiteboardTool("text")],
      ["rectangle", "□", "Rectangle", () => { setShapeKind("rectangle"); setWhiteboardTool("shape"); }],
      ["circle", "○", "Circle", () => { setShapeKind("circle"); setWhiteboardTool("shape"); }],
      ["line", "╱", "Line", () => { setShapeKind("line"); setWhiteboardTool("shape"); }],
      ["arrow", "➜", "Arrow", () => { setShapeKind("arrow"); setWhiteboardTool("shape"); }],
    ];
    toolButtons.forEach(([, label, name, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", name);
      button.className = "grid size-10 place-items-center rounded-lg text-sm font-extrabold text-white/70 hover:bg-white/10";
      button.addEventListener("click", () => action?.());
      rail.appendChild(button);
      addedTools.push(button);
    });
    ([ ["Undo", "↶", undoBoard], ["Redo", "↷", redoBoard] ] as const).forEach(([name, label, action]) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label; button.setAttribute("aria-label", name);
      button.className = "grid size-10 place-items-center rounded-lg text-lg font-extrabold text-white/70 hover:bg-white/10";
      button.addEventListener("click", action);
      rail.appendChild(button); addedTools.push(button);
    });
    rail.addEventListener("pointerdown", onPointerDown);
    rail.addEventListener("pointermove", onPointerMove);
    rail.addEventListener("pointerup", onPointerEnd);
    rail.addEventListener("pointercancel", onPointerEnd);
    return () => {
      railDrag.current = null;
      rail.style.cursor = "";
      rail.style.touchAction = "";
      rail.removeEventListener("pointerdown", onPointerDown);
      rail.removeEventListener("pointermove", onPointerMove);
      rail.removeEventListener("pointerup", onPointerEnd);
      rail.removeEventListener("pointercancel", onPointerEnd);
      addedTools.forEach((button) => button.remove());
    };
  }, [role, stage]);
  useEffect(() => {
    const boardCanvas = canvas.current; if (!boardCanvas) return;
    const ctx = boardCanvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    for (const line of board) {
      const [start, end] = [line.points[0], line.points[line.points.length - 1]];
      if (!start) continue;
      if (line.tool === "text") {
        ctx.globalAlpha = 1;
        ctx.fillStyle = line.color;
        ctx.font = "700 28px sans-serif";
        ctx.fillText((line as BoardLine & { text?: string }).text ?? "Text", start[0] * boardCanvas.width, start[1] * boardCanvas.height);
        continue;
      }
      if (line.tool === "shape" && end) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;
        const startX = start[0] * boardCanvas.width; const startY = start[1] * boardCanvas.height;
        const endX = end[0] * boardCanvas.width; const endY = end[1] * boardCanvas.height;
        if (line.shape === "circle") {
          ctx.beginPath(); ctx.ellipse((startX + endX) / 2, (startY + endY) / 2, Math.abs(endX - startX) / 2, Math.abs(endY - startY) / 2, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (line.shape === "line") {
          ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
        } else if (line.shape === "arrow") {
          const angle = Math.atan2(endY - startY, endX - startX); const head = 18;
          ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6)); ctx.moveTo(endX, endY); ctx.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6)); ctx.stroke();
        } else ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        continue;
      }
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.globalAlpha = line.tool === "highlighter" ? 0.38 : 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      line.points.forEach(([x, y], index) => index ? ctx.lineTo(x * boardCanvas.width, y * boardCanvas.height) : ctx.moveTo(x * boardCanvas.width, y * boardCanvas.height));
      ctx.stroke();
      if (line.tool === "pointer") {
        const point = end ?? start;
        ctx.globalAlpha = 1;
        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(point[0] * boardCanvas.width, point[1] * boardCanvas.height, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const selected = selectedBoardId ? board.find((line) => line.id === selectedBoardId) : null;
    if (selected) {
      const xs = selected.points.map(([x]) => x);
      const ys = selected.points.map(([, y]) => y);
      const left = Math.min(...xs) * boardCanvas.width - 12;
      const top = Math.min(...ys) * boardCanvas.height - 12;
      const width = (Math.max(...xs) - Math.min(...xs)) * boardCanvas.width + 24;
      const height = (Math.max(...ys) - Math.min(...ys)) * boardCanvas.height + 24;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(left, top, Math.max(width, 28), Math.max(height, 28));
      ctx.setLineDash([]);
    }
    if (livePointer) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(livePointer[0] * boardCanvas.width, livePointer[1] * boardCanvas.height, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [board, livePointer, selectedBoardId]);
  useEffect(() => { if (role === "CREATOR") broadcast("stage", { stage }); }, [broadcast, role, stage]);
  useEffect(() => { if (role === "CREATOR" && board.length === 0) broadcast("board-clear", {}); }, [board.length, broadcast, role]);

  useEffect(() => {
    const room = supabase.channel(`instant-room:${roomId}`, { config: { presence: { key: userId }, broadcast: { ack: true } } });
    channel.current = room;
    room.on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as Signal));
    room.on("broadcast", { event: "chat" }, ({ payload }) => setChat((current) => [...current, payload as ChatMessage]));
    room.on("broadcast", { event: "board" }, ({ payload }) => setBoard((current) => current.some((line) => line.id === (payload as BoardLine).id) ? current : [...current, payload as BoardLine]));
    room.on("broadcast", { event: "board-update" }, ({ payload }) => setBoard((current) => current.map((line) => line.id === (payload as BoardLine).id ? payload as BoardLine : line)));
    room.on("broadcast", { event: "board-remove" }, ({ payload }) => setBoard((current) => current.filter((line) => line.id !== (payload as { id: string }).id)));
    room.on("broadcast", { event: "board-pointer" }, ({ payload }) => setLivePointer((payload as { point?: [number, number] }).point ?? null));
    room.on("broadcast", { event: "image" }, ({ payload }) => {
      const next = payload as { id?: string; src: string; name?: string };
      const asset = { id: next.id ?? crypto.randomUUID(), src: String(next.src), name: next.name ?? "Image" };
      setImages((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
      setImage(asset.src); setStage("image");
    });
    room.on("broadcast", { event: "stage" }, ({ payload }) => {
      const next = (payload as { stage?: "whiteboard" | "screen" | "image" }).stage;
      if (next) setStage(next);
    });
    room.on("broadcast", { event: "board-clear" }, () => setBoard([]));
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

  function stopScreenSharing() {
    const stream = localScreen.current;
    if (!stream) return;
    const sharedTracks = new Set(stream.getTracks());
    stream.getTracks().forEach((track) => track.stop());
    localScreen.current = null;
    peers.current.forEach((pc) => pc.getSenders().filter((sender) => sender.track && sharedTracks.has(sender.track)).forEach((sender) => pc.removeTrack(sender)));
    setSharing(false);
    setStage("whiteboard");
    broadcast("stage", { stage: "whiteboard" });
    peers.current.forEach((_pc, peerId) => void renegotiate(peerId, true));
  }

  async function toggleScreen() {
    if (role !== "CREATOR") return;
    if (sharing) { stopScreenSharing(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); localScreen.current = stream; setSharing(true); setStage("screen"); broadcast("stage", { stage: "screen" }); stream.getVideoTracks()[0].onended = stopScreenSharing;
      peers.current.forEach((pc) => stream.getTracks().forEach((track) => pc.addTrack(track, stream))); peers.current.forEach((_pc, peerId) => void renegotiate(peerId, true));
    } catch { setNotice("Screen sharing was cancelled or blocked by the browser. If available, enable Share audio in the browser dialog."); }
  }

  function sendChat(event: React.FormEvent) { event.preventDefault(); const body = draft.trim(); if (!body) return; const message = { id: crypto.randomUUID(), userId, name: userName, body }; setChat((current) => [...current, message]); broadcast("chat", message); setDraft(""); }
  function setSharedStage(next: "whiteboard" | "screen" | "image") { if (role !== "CREATOR") return; setStage(next); broadcast("stage", { stage: next }); }
  function boardHitAt(point: [number, number]) {
    return [...board].reverse().find((item) => {
      if (item.tool === "text") {
        const [x, y] = item.points[0];
        return Math.abs(point[1] - y) < 0.07 && point[0] >= x - 0.02 && point[0] <= x + Math.max(0.08, (item.text?.length ?? 4) * 0.018);
      }
      if (item.tool === "shape" && item.points.length > 1) {
        const xs = item.points.map(([x]) => x); const ys = item.points.map(([, y]) => y);
        return point[0] >= Math.min(...xs) - 0.04 && point[0] <= Math.max(...xs) + 0.04 && point[1] >= Math.min(...ys) - 0.04 && point[1] <= Math.max(...ys) + 0.04;
      }
      return item.points.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.045);
    });
  }
  function beginTextEdit(item: BoardLine, isNew = false) {
    const boardCanvas = canvas.current; const host = boardCanvas?.parentElement;
    if (!boardCanvas || !host || item.tool !== "text") return;
    const [x, y] = item.points[0];
    const editor = document.createElement("textarea");
    editor.value = item.text ?? "";
    editor.setAttribute("aria-label", "Edit whiteboard text");
    editor.className = "absolute z-20 min-h-10 min-w-40 resize-none border-0 bg-transparent p-0 text-base font-bold text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0";
    editor.style.left = (x * 100) + "%"; editor.style.top = (y * 100) + "%";
    const finish = (save: boolean) => {
      const text = editor.value.trim(); editor.remove();
      if (!save || !text) { if (isNew) replaceBoard(boardRef.current.filter((line) => line.id !== item.id)); return; }
      const updated = { ...item, text };
      replaceBoard(boardRef.current.map((line) => line.id === item.id ? updated : line));
      broadcast(isNew ? "board" : "board-update", updated);
    };
    editor.addEventListener("blur", () => finish(true), { once: true });
    editor.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); finish(false); } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); finish(true); } });
    host.appendChild(editor); editor.focus();
  }
  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (role !== "CREATOR") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point: [number, number] = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
    if (whiteboardTool === "select") {
      if (event.type === "pointerdown") {
        const hit = boardHitAt(point); setSelectedBoardId(hit?.id ?? null);
        if (hit) {
          recordBoardHistory();
          if (event.detail > 1 && hit.tool === "text") beginTextEdit(hit);
          selectionDrag.current = { id: hit.id, start: point, original: { ...hit, points: hit.points.map(([x, y]) => [x, y] as [number, number]) } };
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture can fail if the browser ends the pointer before capture. */ }
        }
      } else if (selectionDrag.current) {
        const drag = selectionDrag.current; const dx = point[0] - drag.start[0]; const dy = point[1] - drag.start[1];
        const updated = { ...drag.original, points: drag.original.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
        replaceBoard(boardRef.current.map((line) => line.id === drag.id ? updated : line));
        broadcast("board-update", updated);
      }
      return;
    }
    if (whiteboardTool === "pointer") {
      setLivePointer(point); broadcast("board-pointer", { point });
      return;
    }
    if (whiteboardTool === "eraser") {
      const hit = board.find((line) => line.points.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.035));
      if (hit) { recordBoardHistory(); replaceBoard(boardRef.current.filter((line) => line.id !== hit.id)); broadcast("board-remove", { id: hit.id }); }
      return;
    }
    if (whiteboardTool === "text" && event.type === "pointerdown") {
      recordBoardHistory();
      const item = { id: crypto.randomUUID(), points: [point], color: "#4f46e5", width: 4, tool: "text" as const, text: "" };
      replaceBoard([...boardRef.current, item]); setSelectedBoardId(item.id); window.requestAnimationFrame(() => beginTextEdit(item, true));
      return;
    }
    if (event.type === "pointerdown") {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture can fail if the browser ends the pointer before capture. */ }
      const style = whiteboardTool === "highlighter" ? { color: "#f5b942", width: 20 } : whiteboardTool === "laser" ? { color: "#ef4444", width: 5 } : whiteboardTool === "shape" ? { color: "#14b8a6", width: 4 } : { color: "#4f46e5", width: 4 };
      if (whiteboardTool !== "text") recordBoardHistory();
      drawing.current = { id: crypto.randomUUID(), points: [point], ...style, tool: whiteboardTool, ...(whiteboardTool === "shape" ? { shape: shapeKind } : {}) };
    } else {
      const active = drawing.current;
      if (!active) return;
      active.points = active.tool === "shape" ? [active.points[0], point] : [...active.points, point];
      replaceBoard([...boardRef.current.filter((line) => line.id !== active.id), { ...active, points: [...active.points] }]);
    }
  }
  function endDraw(event?: React.PointerEvent<HTMLCanvasElement>) {
    if (whiteboardTool === "pointer") { setLivePointer(null); broadcast("board-pointer", { point: null }); return; }
    if (whiteboardTool === "select") { selectionDrag.current = null; if (event && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return; }
    const active = drawing.current; if (!active) return;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.tool !== "text") broadcast("board", { ...active, points: [...active.points] });
    drawing.current = null;
  }
  useEffect(() => {
    if (role !== "CREATOR") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedBoardId || (event.key !== "Delete" && event.key !== "Backspace") || (event.target as HTMLElement)?.tagName === "TEXTAREA") return;
      event.preventDefault();
      recordBoardHistory(); replaceBoard(boardRef.current.filter((line) => line.id !== selectedBoardId));
      broadcast("board-remove", { id: selectedBoardId });
      setSelectedBoardId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [broadcast, role, selectedBoardId]);
  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) { if (role !== "CREATOR") return; const file = event.target.files?.[0]; if (!file || file.size > 180_000 || !file.type.startsWith("image/")) { setNotice("Choose an image under 180 KB for the live stage."); return; } const reader = new FileReader(); reader.onload = () => { const src = String(reader.result); const asset = { id: crypto.randomUUID(), src, name: file.name }; setImages((current) => [...current, asset]); setImage(src); setSharedStage("image"); broadcast("image", asset); }; reader.readAsDataURL(file); event.target.value = ""; }
  function clearBoard() { if (role !== "CREATOR") return; recordBoardHistory(); replaceBoard([]); broadcast("board-clear", {}); setSelectedBoardId(null); }
  async function endClass() { if (role !== "CREATOR" || !window.confirm("End this live class for everyone?")) return; await fetch(`/api/instant-live/rooms/${roomId}/end`, { method: "POST" }); broadcast("room-ended", {}); setEnded(true); }
  async function copyLink() { if (role !== "CREATOR") return; await navigator.clipboard.writeText(`${window.location.origin}/live/join/${code}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  async function toggleFullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await classroom.current?.requestFullscreen(); } catch { setNotice("Fullscreen is not available in this browser window."); } }

  return <main ref={classroom} className="min-h-screen bg-[#0d1421] text-white" data-role={role}>
    {role === "LEARNER" ? <style>{`[data-role="LEARNER"] header .ml-auto > :nth-child(1), [data-role="LEARNER"] header .ml-auto > :nth-child(2), [data-role="LEARNER"] section > nav, [data-role="LEARNER"] section > div > div:last-child > :nth-child(2), [data-role="LEARNER"] section > div > div:last-child > :nth-child(3), [data-role="LEARNER"] section > div > div:last-child > :nth-child(4), [data-role="LEARNER"] section > div > div:last-child > :nth-child(5), [data-role="LEARNER"] section > div > div:last-child > :nth-child(6) { display: none !important; } [data-role="LEARNER"] section { grid-template-columns: minmax(0, 1fr) !important; }`}</style> : null}
    <style>{`@media (max-width: 639px) { [data-role] > header { min-height: 4rem !important; padding: .75rem 1rem !important; gap: .5rem !important; } [data-role] > header h1 { font-size: 1rem; } [data-role] > div.grid { min-height: 0 !important; } [data-role] > div.grid > section { min-height: 0 !important; } [data-role] > div.grid > section > div { min-height: 0 !important; } [data-role] > div.grid > section > div > div:first-child { aspect-ratio: 4 / 3; flex: 0 0 auto !important; } [data-role] > div.grid > aside { min-height: 360px !important; max-height: 44svh; } }`}</style>
    <style>{`[data-role] > div.grid > section > nav { display: none !important; } [data-role] > div.grid > section { grid-template-columns: minmax(0, 1fr) !important; } [data-role] > div.grid > section > div > div:last-child { border-radius: .9rem; background: #0d1421; color: #fff; padding: .5rem; } [data-role] > div.grid > section > div > div:last-child button, [data-role] > div.grid > section > div > div:last-child label { background: #1b2738; color: #f8fafc; } [data-role] > div.grid > section > div > div:last-child button:hover, [data-role] > div.grid > section > div > div:last-child label:hover { background: #26364d; } [data-role] > div.grid > section > div > div:last-child button.bg-indigo-100 { background: #6366f1; color: #fff; }`}</style>
    {role === "CREATOR" && stage === "whiteboard" ? <nav className="fixed left-4 top-28 z-30 hidden w-14 flex-col items-center gap-2 rounded-xl bg-[#0d1421] p-2 shadow-xl lg:flex" aria-label="Whiteboard tools"><button onClick={() => setWhiteboardTool("select")} aria-label="Select tool" aria-pressed={whiteboardTool === "select"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "select" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><MousePointer2 size={18} /></button><button onClick={() => setWhiteboardTool("pen")} aria-label="Pen" aria-pressed={whiteboardTool === "pen"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "pen" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><PenLine size={18} /></button><button onClick={() => setWhiteboardTool("highlighter")} aria-label="Highlighter" aria-pressed={whiteboardTool === "highlighter"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "highlighter" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><Highlighter size={18} /></button><button onClick={() => setWhiteboardTool("eraser")} aria-label="Eraser" aria-pressed={whiteboardTool === "eraser"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "eraser" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><Eraser size={18} /></button><button onClick={() => setWhiteboardTool("pointer")} aria-label="Pointer" aria-pressed={whiteboardTool === "pointer"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "pointer" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><MousePointer2 size={18} /></button><button onClick={() => setWhiteboardTool("laser")} aria-label="Laser" aria-pressed={whiteboardTool === "laser"} className={`grid size-10 place-items-center rounded-lg ${whiteboardTool === "laser" ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`}><Pointer size={18} /></button></nav> : null}
    <header className="flex min-h-20 items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-7"><h1 className="min-w-0 truncate text-lg font-extrabold sm:text-2xl">{title}</h1><span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300"><i className="size-2 rounded-full bg-emerald-400" />Live</span><span className="inline-flex shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold tabular-nums text-white/75" aria-label="Live duration">{elapsedLabel}</span><span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold sm:inline-flex"><UsersRound size={15} />{people.length}</span><div className="ml-auto flex items-center gap-2"><button onClick={() => void copyLink()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-400/60 px-3 text-sm font-bold text-indigo-100">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button><button aria-label="Settings" className="hidden rounded-lg p-2 text-white/70 hover:bg-white/10 sm:block"><Settings size={19} /></button><button aria-label={isFullscreen ? "Exit full screen" : "Full screen"} className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={() => void toggleFullscreen()}><Maximize2 size={19} /></button></div></header>
    {notice ? <div role="alert" className="mx-4 mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 sm:mx-7">{notice}<button className="ml-3 font-bold underline" onClick={() => setNotice("")}>Dismiss</button></div> : null}
    <div className="grid min-h-[calc(100vh-80px)] grid-cols-1 gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid min-h-[calc(100dvh-110px)] grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-[#141e2e] p-2 sm:min-h-[620px] sm:p-3 lg:grid-cols-[64px_minmax(0,1fr)]"><nav className="hidden flex-col items-center gap-3 rounded-xl bg-[#0d1421] p-2 lg:flex"><button className="grid size-11 place-items-center rounded-xl bg-indigo-500 text-white" aria-label="Select tool"><PenLine size={20} /></button><button onClick={() => setStage("whiteboard")} className={`grid size-11 place-items-center rounded-xl ${stage === "whiteboard" ? "bg-indigo-500/20 text-indigo-200" : "text-white/70 hover:bg-white/10"}`} aria-label="Whiteboard"><PenLine size={20} /></button><button onClick={() => void toggleScreen()} className={`grid size-11 place-items-center rounded-xl ${sharing ? "bg-indigo-500 text-white" : "text-white/70 hover:bg-white/10"}`} aria-label="Share screen"><MonitorUp size={20} /></button><label className="grid size-11 cursor-pointer place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="Upload image"><ImagePlus size={20} /><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadImage(event)} /></label><button onClick={() => setNotice("Lesson content is not attached to this instant room yet.")} className="grid size-11 place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="Lesson content"><BookOpen size={20} /></button><button onClick={() => setMoreOpen((open) => !open)} className={`mt-auto grid size-11 place-items-center rounded-xl ${moreOpen ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10"}`} aria-label="More tools"><MoreHorizontal size={20} /></button></nav><div className="flex min-w-0 flex-col rounded-xl bg-white p-2 sm:p-3"><div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-slate-50"><canvas ref={canvas} width={1200} height={700} className={`absolute inset-0 size-full ${stage === "whiteboard" && role === "CREATOR" ? "cursor-crosshair" : ""}`} onPointerDown={draw} onPointerMove={draw} onPointerUp={endDraw} onPointerCancel={endDraw} hidden={stage !== "whiteboard"} />{stage === "image" && image ? <img src={image} alt="Shared by the creator" className="size-full object-contain" /> : null}{stage === "screen" ? <><video ref={localScreenVideo} autoPlay muted playsInline className={`size-full object-contain ${sharing ? "" : "hidden"}`} /><video ref={remoteScreenVideo} autoPlay playsInline className={`size-full object-contain ${sharing ? "hidden" : ""}`} /></> : null}{ended ? <div className="absolute inset-0 grid place-items-center bg-slate-100 text-center text-slate-700"><div><h2 className="text-xl font-extrabold">This class has ended</h2><p className="mt-1 text-sm">The live room is no longer available.</p></div></div> : null}</div>{moreOpen ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-slate-700"><button onClick={() => { setBoard([]); setMoreOpen(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white"><Eraser size={15} />Clear board</button><button onClick={() => { setStage("whiteboard"); setMoreOpen(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white"><PenLine size={15} />Return to whiteboard</button><button onClick={() => { setNotice("Lesson content is not attached to this instant room yet."); setMoreOpen(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white"><BookOpen size={15} />Lesson content</button></div> : null}<div className="mt-2 flex max-w-full snap-x items-center justify-start gap-2 overflow-x-auto pb-1 text-slate-900 sm:justify-center"><button onClick={toggleMic} className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-sm font-bold ${micOn ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}{micOn ? "Mic on" : "Mic off"}</button><button onClick={() => setStage("whiteboard")} className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-sm font-bold ${stage === "whiteboard" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}><PenLine size={18} />Whiteboard</button><button onClick={() => void toggleScreen()} className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-sm font-bold ${sharing ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}><MonitorUp size={18} />{sharing ? "Stop sharing" : "Share screen"}</button><label className="inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700"><ImagePlus size={18} />Upload image<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadImage(event)} /></label><button onClick={() => setNotice("Lesson content is not attached to this instant room yet.")} className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700"><BookOpen size={18} />Lesson</button><button onClick={() => setMoreOpen((open) => !open)} className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700"><MoreHorizontal size={18} />More</button>{role === "CREATOR" ? <button onClick={() => void endClass()} className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl bg-[#ff6966] px-4 text-sm font-extrabold text-white">End class</button> : <button onClick={() => window.location.assign("/account")} className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700"><X size={18} />Leave</button>}</div></div></section>
      <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141e2e]"><div className="flex border-b border-white/10"><button onClick={() => setDrawer("chat")} className={`flex-1 px-4 py-4 text-sm font-extrabold ${drawer === "chat" ? "border-b-2 border-indigo-400 text-indigo-200" : "text-white/60"}`}><MessageCircle className="mr-2 inline" size={17} />Chat</button><button onClick={() => setDrawer("people")} className={`flex-1 px-4 py-4 text-sm font-extrabold ${drawer === "people" ? "border-b-2 border-indigo-400 text-indigo-200" : "text-white/60"}`}><UsersRound className="mr-2 inline" size={17} />People</button></div>{drawer === "chat" ? <><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{chat.map((message) => <div key={message.id} className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-white/60">{message.name}</p><p className="mt-1 text-sm leading-6">{message.body}</p></div>)}{!chat.length ? <p className="py-10 text-center text-sm text-white/45">Your class chat will appear here.</p> : null}</div><form onSubmit={sendChat} className="m-4 flex gap-2 rounded-xl border border-white/15 bg-white/5 p-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message…" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/40" aria-label="Chat message" /><button className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white" aria-label="Send chat message"><Send size={17} /></button></form></> : <div className="space-y-2 p-4">{people.map((person) => <div key={person.userId} className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><span className="grid size-9 place-items-center rounded-full bg-indigo-300 font-bold text-slate-900">{person.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{person.name}{person.userId === userId ? " (you)" : ""}</span><span className="text-xs text-white/50">{person.role === "CREATOR" ? "Creator" : "Learner"}</span></div>)}</div>}</aside>
    </div>
  </main>;
}
