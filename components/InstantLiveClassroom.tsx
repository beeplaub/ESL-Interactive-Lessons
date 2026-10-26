"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ImagePlus,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  PhoneOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Smile,
  Send,
  UserX,
  UsersRound,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { LiveBoard } from "./instant-live/LiveBoard";
import { useLiveTransport } from "./instant-live/useLiveTransport";
import {
  boardSchema,
  emptyState,
  type BoardObject,
  type LiveAsset,
  type LivePerson,
  type SharedState,
  type StageKind,
} from "@/lib/instant-live/types";
import styles from "./instant-live/Classroom.module.css";

type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
};
type ParticipantModeration = { userId: string; micMuted: boolean };
type RoomClock = {
  status: string;
  elapsed_seconds: number;
  active_started_at: string;
  expires_at: string;
};
type Props = {
  roomId: string;
  title: string;
  code: string;
  startedAt: string;
  elapsedOffset?: number;
  initialEnded?: boolean;
  userId: string;
  userName: string;
  role: "CREATOR" | "LEARNER";
  creatorId: string;
};
export function InstantLiveClassroom({
  roomId,
  title,
  code,
  startedAt,
  elapsedOffset = 0,
  initialEnded = false,
  userId,
  userName,
  role,
  creatorId,
}: Props) {
  const creator = role === "CREATOR";
  const root = useRef<HTMLElement>(null);
  const [self, setSelf] = useState<LivePerson | null>(null);
  const [state, setState] = useState<SharedState>(() => emptyState(roomId));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [board, setBoard] = useState<BoardObject[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;
  const [assets, setAssets] = useState<LiveAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState<RoomClock>({
    status: initialEnded ? "ENDED" : "LIVE",
    elapsed_seconds: elapsedOffset,
    active_started_at: startedAt,
    expires_at: "",
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [drawer, setDrawer] = useState<"chat" | "people">("chat");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [moderation, setModeration] = useState<ParticipantModeration[]>([]);
  const [moderatingUser, setModeratingUser] = useState<string | null>(null);
  const [roomRevoked, setRoomRevoked] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [boardPicker, setBoardPicker] = useState(false);
  const [pointer, setPointer] = useState<[number, number] | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const uploadToBoard = useRef(false);
  const dirty = useRef(false);
  const boardVersion = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTime = useRef(0);
  const previewBoard = useRef<BoardObject[]>([]);
  const pointerTime = useRef(0);
  const receivedPreviewAt = useRef(0);
  const joinedAt = useRef(Date.now());
  const transportRef = useRef<ReturnType<typeof useLiveTransport> | null>(null);
  const paused = clock.status !== "LIVE";
  const api = `/api/instant-live/rooms/${roomId}`;
  const forceMuted = moderation.some(
    (participant) => participant.userId === userId && participant.micMuted,
  );
  useEffect(() => {
    setSelf({
      userId,
      sessionId: crypto.randomUUID(),
      name: userName,
      role,
      joinedAt: joinedAt.current,
      mic: false,
    });
  }, [role, userId, userName]);
  const applyState = useCallback((next: SharedState) => {
    const previous = stateRef.current;
    const merged = { ...previous };
    if (next.revision >= previous.revision) {
      merged.stage = next.stage;
      merged.asset_id = next.asset_id;
      merged.presenter_id = next.presenter_id;
      merged.presenter_session = next.presenter_session;
      merged.lease_until = next.lease_until;
      merged.revision = next.revision;
    }
    if (next.board_revision >= previous.board_revision) {
      merged.board = next.board;
      merged.board_revision = next.board_revision;
      if (
        !dirty.current &&
        (next.board_revision > previous.board_revision ||
          Date.now() - receivedPreviewAt.current > 1500)
      ) {
        boardRef.current = next.board;
        previewBoard.current = next.board;
        setBoard(next.board);
      }
    }
    stateRef.current = merged;
    setState(merged);
  }, []);
  const refresh = useCallback(async () => {
    if (roomRevoked) return false;
    try {
      const response = await fetch(`${api}/state`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          setRoomRevoked(true);
          setLoaded(true);
        }
        throw new Error(result.error || "Could not load the live stage.");
      }
      const chatResponse = await fetch(`${api}/chat`, { cache: "no-store" });
      const chatResult = chatResponse.ok ? await chatResponse.json() : null;
      applyState(result.state);
      setAssets(result.assets);
      setModeration(result.moderation ?? []);
      if (chatResult?.messages) setChat(chatResult.messages);
      setClock(result.room);
      setLoaded(true);
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not load the classroom.",
      );
      return false;
    }
  }, [api, applyState, roomRevoked]);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 150);
  }, [refresh]);
  const onEvent = useCallback(
    (event: string, data: unknown, from: LivePerson | undefined) => {
      if (
        event === "state-changed" ||
        event === "assets-changed" ||
        event === "presence"
      )
        scheduleRefresh();
      if (event === "state-request") {
        if (creator)
          void transportRef.current?.send("board-preview", {
            board: boardRef.current,
            revision: stateRef.current.board_revision,
          });
        scheduleRefresh();
      }
      if (event === "board-preview" && from?.userId === creatorId && !creator) {
        const packet = data as { board?: unknown; revision?: number };
        const parsed = boardSchema.safeParse(packet.board);
        if (
          parsed.success &&
          Number(packet.revision) >= stateRef.current.board_revision
        ) {
          receivedPreviewAt.current = Date.now();
          setBoard(parsed.data);
          boardRef.current = parsed.data;
        }
      }
      if (event === "board-patch" && from?.userId === creatorId && !creator) {
        const packet = data as {
          object?: unknown;
          removed?: string[];
          revision?: number;
        };
        if (Number(packet.revision) >= stateRef.current.board_revision) {
          const parsed = boardSchema.safeParse(
            packet.object ? [packet.object] : [],
          );
          if (parsed.success) {
            const removed = new Set(
              Array.isArray(packet.removed) ? packet.removed : [],
            );
            const object = parsed.data[0];
            const next = boardRef.current.filter(
              (item) => !removed.has(item.id),
            );
            if (object) {
              const index = next.findIndex((item) => item.id === object.id);
              if (index < 0) next.push(object);
              else next[index] = object;
            }
            receivedPreviewAt.current = Date.now();
            boardRef.current = next;
            setBoard(next);
          }
        }
      }
      if (event === "pointer" && from?.userId === creatorId) {
        const p = data as { point?: [number, number] | null };
        setPointer(
          p.point && p.point.length === 2 && p.point.every(Number.isFinite)
            ? p.point
            : null,
        );
      }
      if (event === "chat" && from) {
        const message = data as ChatMessage;
        if (
          typeof message.body !== "string" ||
          !message.body.trim() ||
          message.body.length > 2000
        )
          return;
        setChat((old) =>
          old.some((m) => m.id === message.id)
            ? old
            : [
                ...old.slice(-199),
                { ...message, userId: from.userId, name: from.name },
              ],
        );
      }
    },
    [creator, creatorId, scheduleRefresh],
  );
  const transport = useLiveTransport({
    roomId,
    self,
    paused,
    forceMuted,
    enabled: loaded && !roomRevoked,
    onEvent,
    onNotice: setNotice,
  });
  transportRef.current = transport;
  const ownPresentation = Boolean(
    self &&
    state.presenter_session === self.sessionId &&
    state.presenter_id === userId,
  );
  const locked = Boolean(state.presenter_id && !ownPresentation);
  const presenter = transport.people.find(
    (p) => p.sessionId === state.presenter_session,
  );
  const activeStream = ownPresentation
    ? transport.local
    : state.presenter_session
      ? transport.remote[state.presenter_session]
      : null;
  const elapsed = Math.max(
    0,
    clock.elapsed_seconds +
      (paused
        ? 0
        : Math.floor((now - Date.parse(clock.active_started_at)) / 1000)),
  );
  const elapsedLabel =
    elapsed >= 3600
      ? `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed / 60) % 60).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
      : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (!ownPresentation || !self || paused) return;
    const heartbeat = () =>
      void fetch(`${api}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", session: self.sessionId }),
      }).catch(() => {});
    heartbeat();
    const timer = setInterval(heartbeat, 20000);
    return () => clearInterval(timer);
  }, [api, ownPresentation, paused, self]);
  const { local: localPresentation, stopPresentation } = transport;
  useEffect(() => {
    if (loaded && !ownPresentation && localPresentation) stopPresentation();
  }, [loaded, ownPresentation, localPresentation, stopPresentation]);
  useEffect(() => {
    const listener = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  const command = async (body: Record<string, unknown>) => {
    const response = await fetch(`${api}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not update the classroom.");
    if (result.state) applyState(result.state);
    void transport.send("state-changed", {});
    return result.state as SharedState | undefined;
  };
  const saveBoard = useCallback(async () => {
    if (saving.current) return saving.current;
    if (!dirty.current) return;
    setSaveStatus("Saving…");
    const operation = (async () => {
      try {
        while (dirty.current) {
          const version = boardVersion.current,
            payload = boardRef.current;
          const response = await fetch(`${api}/state`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "board",
              board: payload,
              revision: stateRef.current.board_revision,
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Could not save the board.");
          stateRef.current = {
            ...stateRef.current,
            board: payload,
            board_revision: result.state.board_revision,
          };
          setState(stateRef.current);
          if (boardVersion.current === version) {
            dirty.current = false;
            setSaveStatus("Saved");
          }
          void transportRef.current?.send("state-changed", {});
        }
      } catch (error) {
        setSaveStatus("Not saved · retry");
        setNotice(
          error instanceof Error ? error.message : "Could not save the board.",
        );
      } finally {
        saving.current = null;
      }
    })();
    saving.current = operation;
    return operation;
  }, [api]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  function changeBoard(next: BoardObject[], committed = false) {
    if (!creator || paused) return;
    boardVersion.current++;
    dirty.current = true;
    boardRef.current = next;
    setBoard(next);
    setSaveStatus("Saving…");
    if (Date.now() - previewTime.current > 180 || committed) {
      previewTime.current = Date.now();
      const previous = new Map(
        previewBoard.current.map((item) => [item.id, item]),
      );
      const ids = new Set(next.map((item) => item.id));
      const removed = previewBoard.current
        .filter((item) => !ids.has(item.id))
        .map((item) => item.id);
      if (removed.length)
        void transport.send("board-patch", {
          removed,
          revision: stateRef.current.board_revision,
        });
      for (const object of next)
        if (previous.get(object.id) !== object) {
          void transport.send("board-patch", {
            object,
            revision: stateRef.current.board_revision,
          });
        }
      previewBoard.current = next;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => void saveBoard(),
      committed ? 180 : 650,
    );
  }
  useEffect(() => {
    if (!pointer || creator) return;
    const timer = setTimeout(() => setPointer(null), 1500);
    return () => clearTimeout(timer);
  }, [pointer, creator]);
  function broadcastPointer(point: [number, number] | null) {
    setPointer(point);
    if (!point || Date.now() - pointerTime.current > 100) {
      pointerTime.current = Date.now();
      void transport.send("pointer", { point });
    }
  }
  async function stopSharing() {
    if (!self) return;
    try {
      await command({ action: "release", session: self.sessionId });
      transport.stopPresentation();
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  async function startSharing(kind: "screen" | "camera") {
    if (!self || busy || locked || paused) return;
    if (
      ownPresentation &&
      (state.stage === "screen" || state.stage === "camera")
    ) {
      await stopSharing();
      return;
    }
    if (kind === "screen" && !navigator.mediaDevices?.getDisplayMedia) {
      setNotice(
        /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
          ? "This device's browser or PWA does not expose full-screen capture. Use a supported screen-sharing app or use Image to show a picture."
          : "This browser does not provide screen capture. Try a supported desktop browser or use Image to show a picture.",
      );
      return;
    }
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      // Capture must be requested directly from this click, before awaiting server work.
      const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      stream =
        kind === "screen"
          ? await navigator.mediaDevices.getDisplayMedia(
              isMobile
                ? { video: { frameRate: { ideal: 15, max: 20 } }, audio: false }
                : ({
                    video: { frameRate: { ideal: 15, max: 30 } },
                    audio: true,
                    systemAudio: "include",
                    surfaceSwitching: "include",
                  } as DisplayMediaStreamOptions),
            )
          : await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 15, max: 20 },
              },
              audio: false,
            });
      const next = await command({
        action: "claim",
        stage: kind,
        session: self.sessionId,
      });
      if (!next) throw new Error("Could not acquire the stage.");
      transport.present(stream);
      stream.getVideoTracks()[0].onended = () => {
        transport.stopPresentation();
        void fetch(`${api}/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "release", session: self.sessionId }),
        }).then(() => {
          scheduleRefresh();
          void transport.send("state-changed", {});
        });
      };
      setNotice("");
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      setNotice(
        error instanceof Error
          ? error.message
          : "Sharing could not start. Check browser permissions.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function showImage(asset: LiveAsset) {
    if (!creator || !self || locked) return;
    try {
      await command({
        action: "claim",
        stage: "image",
        assetId: asset.id,
        session: self.sessionId,
      });
      transport.stopPresentation();
      setGallery(true);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function addBoardImage(asset: LiveAsset) {
    if (!creator) return;
    const w = Math.min(480, asset.width);
    const item: BoardObject = {
      id: crypto.randomUUID(),
      kind: "image",
      x: 180,
      y: 120,
      w,
      h: (w * asset.height) / asset.width,
      color: "#24203d",
      stroke: 1,
      assetId: asset.id,
    };
    changeBoard([...boardRef.current, item], true);
    setBoardPicker(false);
  }
  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${api}/assets`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setAssets((old) => [...old, result.asset]);
      setGallery(true);
      void transport.send("assets-changed", {});
      if (uploadToBoard.current) addBoardImage(result.asset);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setUploading(false);
      uploadToBoard.current = false;
    }
  }
  function pickUpload(onBoard = false) {
    uploadToBoard.current = onBoard;
    upload.current?.click();
  }
  async function lifecycle() {
    if (!creator || busy) return;
    setBusy(true);
    try {
      if (!paused) {
        await saveBoard();
        if (dirty.current)
          throw new Error("Save the board before ending the class.");
      }
      const response = await fetch(`${api}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: paused ? "restart" : "end" }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update the class.");
      setClock((old) => ({
        ...old,
        status: paused ? "LIVE" : "ENDED",
        elapsed_seconds: result.elapsedSeconds,
        active_started_at: result.activeStartedAt ?? old.active_started_at,
      }));
      setNow(Date.now());
      void transport.send("state-changed", {});
      setNotice("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim().slice(0, 2000);
    if (!body || paused || chatSending) return;
    const message = {
      id: crypto.randomUUID(),
      userId,
      name: userName,
      body,
      createdAt: new Date().toISOString(),
    };
    setChat((old) => [...old.slice(-199), message]);
    setDraft("");
    setChatSending(true);
    try {
      const response = await fetch(`${api}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not send chat message.");
      setChat((old) => {
        const withoutDuplicate = old.filter(
          (item) => item.id !== message.id && item.id !== result.message.id,
        );
        return [...withoutDuplicate.slice(-199), result.message];
      });
      void transport.send("chat", result.message);
    } catch (error) {
      setChat((old) => old.filter((item) => item.id !== message.id));
      setDraft(body);
      setNotice(error instanceof Error ? error.message : "Could not send chat.");
    } finally {
      setChatSending(false);
    }
  }
  async function moderateParticipant(
    action: "mute" | "unmute" | "remove",
    targetUserId: string,
  ) {
    if (!creator || moderatingUser) return;
    setModeratingUser(targetUserId);
    try {
      const response = await fetch(`${api}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: targetUserId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update this learner.");
      if (action === "remove") {
        setModeration((old) => old.filter((item) => item.userId !== targetUserId));
      } else {
        setModeration((old) => [
          ...old.filter((item) => item.userId !== targetUserId),
          { userId: targetUserId, micMuted: action === "mute" },
        ]);
      }
      setNotice(
        action === "remove"
          ? "Learner removed from the class."
          : action === "mute"
            ? "Learner muted."
            : "Learner can use their microphone again.",
      );
      void transport.send("state-changed", {});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not manage learner.");
    } finally {
      setModeratingUser(null);
    }
  }
  async function syncClassroom() {
    setNotice("Refreshing classroom and reconnecting media…");
    const synced = await refresh();
    if (synced) {
      transport.reconnect();
      setNotice("Classroom refreshed. Media reconnect requested.");
      window.setTimeout(() => setNotice(""), 2400);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/live/join/${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Could not copy the link. Your class code is " + code);
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen)
        await root.current.requestFullscreen();
      else setFullscreen((value) => !value);
    } catch {
      setFullscreen((value) => !value);
    }
  }
  const avatar = (name: string) =>
    ["#aab5ff", "#f4b7cf", "#73ddcf", "#c8adf6"][
      name.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4
    ];
  const button = (
    label: string,
    Icon: typeof Mic,
    onClick: () => void,
    active = false,
    disabled = false,
    cta = false,
  ) => (
    <button
      type="button"
      className={`live-control ${active ? "is-active" : ""} ${cta ? "is-cta" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
    >
      <span className="live-control-icon">
        <Icon size={22} />
      </span>
      <span>{label}</span>
    </button>
  );
  return (
    <main
      ref={root}
      className={`${styles.root} ${fullscreen ? styles.fullscreen : ""}`}
      data-live-classroom
      data-role={role}
    >
      <header className="live-header">
        <h1>{title}</h1>
        <span className={`live-badge ${paused ? "is-paused" : ""}`}>
          <i />
          {paused ? "Paused" : "Live"}
        </span>
        <time className="live-clock" aria-label="Class elapsed time">
          {elapsedLabel}
        </time>
        <span className="live-count">
          <UsersRound size={15} />
          {transport.people.length || 1}
        </span>
        <div className="live-header-actions">
          {creator ? (
            <button className="live-copy" onClick={() => void copyLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "Copied" : "Copy link"}</span>
            </button>
          ) : null}
          <button
            title="Refresh the shared board, chat, and media connection"
            aria-label="Refresh classroom and reconnect media"
            onClick={() => void syncClassroom()}
          >
            <RefreshCw size={18} />
          </button>
          <button
            title="Full screen"
            aria-label="Full screen"
            onClick={() => void toggleFullscreen()}
          >
            <Maximize2 size={19} />
          </button>
        </div>
      </header>
      {notice ? (
        <div className="live-notice" role="alert">
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      ) : null}
      {transport.superseded ? (
        <div className="live-notice">
          You opened this class in another tab. Use that tab, or reload here to
          reconnect.
        </div>
      ) : null}
      {roomRevoked ? (
        <div className="live-access-revoked" role="alertdialog" aria-modal="true">
          <section>
            <UserX size={28} />
            <h2>Class access ended</h2>
            <p>The teacher removed you from this class.</p>
            <button type="button" onClick={() => window.location.assign("/account")}>
              Leave class
            </button>
          </section>
        </div>
      ) : null}
      {soundBlocked ? (
        <button
          className="live-enable-audio"
          onClick={() => {
            root.current
              ?.querySelectorAll("audio")
              .forEach((audio) => void audio.play().catch(() => {}));
            setSoundBlocked(false);
          }}
        >
          Tap to hear the class
        </button>
      ) : null}
      <div className={`live-layout ${chatOpen ? "" : "drawer-closed"}`}>
        <section className="live-main">
          <div className="live-stage-shell">
            {!loaded ? (
              <div className="live-stage-placeholder">
                Opening the live classroom…
              </div>
            ) : null}
            <div
              hidden={state.stage !== "whiteboard"}
              className="live-board-holder"
            >
              <LiveBoard
                objects={board}
                onChange={changeBoard}
                canEdit={creator && !paused && !transport.superseded}
                roomId={roomId}
                onAddImage={() => setBoardPicker(true)}
                pointer={pointer}
                onPointer={broadcastPointer}
              />
            </div>
            {state.stage === "image" && state.asset_id ? (
              <ZoomStage>
                <img
                  src={`${api}/assets/${state.asset_id}`}
                  alt="Image shown to the class"
                />
              </ZoomStage>
            ) : null}
            {state.stage === "screen" || state.stage === "camera" ? (
              <ZoomStage>
                <MediaVideo stream={activeStream ?? null} />
                {!activeStream ? (
                  <div className="live-stage-placeholder">
                    Connecting to {presenter?.name ?? "the presenter"}…
                    <button onClick={() => transport.reconnect()}>
                      Reconnect media
                    </button>
                  </div>
                ) : null}
              </ZoomStage>
            ) : null}
            {paused ? (
              <div className="live-paused-overlay">
                <div>
                  <h2>Class paused</h2>
                  <p>
                    {creator
                      ? "Restart to continue with this board and elapsed time."
                      : "Your teacher can restart the class."}
                  </p>
                  {creator ? (
                    <button onClick={() => void lifecycle()} disabled={busy}>
                      <RotateCcw size={17} />
                      Restart
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="live-stage-caption">
            <span>
              <i className={transport.ready ? "connected" : ""} />
              {!loaded
                ? "Connecting"
                : paused
                  ? "Paused"
                  : transport.ready
                    ? "Live connection"
                    : "Reconnecting"}
              {presenter ? ` · ${presenter.name} is presenting` : ""}
            </span>
            {creator ? (
              <button onClick={() => void saveBoard()}>{saveStatus}</button>
            ) : null}
          </div>
          {gallery && assets.length ? (
            <div className="live-gallery" aria-label="Your image gallery">
              <div className="live-gallery-track">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`live-thumbnail ${state.asset_id === asset.id ? "is-active" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={!creator || locked || paused}
                      onClick={() => void showImage(asset)}
                      title={creator ? `Show ${asset.name}` : asset.name}
                    >
                      <img src={`${api}/assets/${asset.id}`} alt={asset.name} />
                    </button>
                    <span>{asset.name}</span>
                    {creator ? (
                      <button
                        className="live-add-to-board"
                        aria-label={`Add ${asset.name} to whiteboard`}
                        onClick={() => addBoardImage(asset)}
                        disabled={paused}
                      >
                        <Plus size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="live-bottom-rail">
            {button(
              forceMuted ? "Muted by teacher" : "Mic",
              transport.micOn && !forceMuted ? Mic : MicOff,
              () => void transport.toggleMic(),
              transport.micOn && !forceMuted,
              paused || transport.superseded || forceMuted,
            )}
            {button(
              ownPresentation && state.stage === "camera"
                ? "Stop video"
                : "Camera",
              Video,
              () => void startSharing("camera"),
              ownPresentation && state.stage === "camera",
              paused || busy || locked || transport.superseded,
            )}
            <span className="live-control-divider" />
            {button(
              ownPresentation && state.stage === "screen"
                ? "Stop share"
                : "Share",
              MonitorUp,
              () => void startSharing("screen"),
              ownPresentation && state.stage === "screen",
              paused || busy || locked || transport.superseded,
            )}
            {creator
              ? button(
                  "Whiteboard",
                  PenLine,
                  () => void stopSharing(),
                  state.stage === "whiteboard",
                  paused || busy,
                )
              : null}
            {button(
              uploading ? "Uploading…" : "Image",
              ImagePlus,
              () => {
                if (assets.length) setGallery((value) => !value);
                else pickUpload();
              },
              gallery,
              paused || uploading,
            )}
            {assets.length
              ? button(
                  "Add image",
                  Plus,
                  () => pickUpload(),
                  false,
                  paused || uploading,
                )
              : null}
            <span className="live-control-divider" />
            {creator
              ? button(
                  paused ? "Restart" : "End class",
                  paused ? RotateCcw : PhoneOff,
                  () => void lifecycle(),
                  false,
                  busy,
                  true,
                )
              : button(
                  "Leave",
                  PhoneOff,
                  () => {
                    transport.stopPresentation();
                    window.location.assign("/account");
                  },
                  false,
                  false,
                  true,
                )}
          </div>
        </section>
        <aside className={`live-drawer ${chatOpen ? "" : "is-collapsed"}`}>
          <div className="live-drawer-tabs">
            {chatOpen ? (
              <>
                <button
                  className={drawer === "chat" ? "is-active" : ""}
                  onClick={() => setDrawer("chat")}
                >
                  <MessageCircle size={18} />
                  Chat
                </button>
                <button
                  className={drawer === "people" ? "is-active" : ""}
                  onClick={() => setDrawer("people")}
                >
                  <UsersRound size={18} />
                  People
                </button>
              </>
            ) : null}
            <button
              aria-label={
                chatOpen ? "Collapse chat and people" : "Expand chat and people"
              }
              onClick={() => setChatOpen((value) => !value)}
            >
              {chatOpen ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </button>
          </div>
          {chatOpen && drawer === "chat" ? (
            <>
              <div className="live-messages">
                {chat.length ? (
                  chat.map((message) => (
                    <article key={message.id}>
                      <span
                        className="live-avatar"
                        style={{ background: avatar(message.name) }}
                      >
                        {message.name[0]?.toUpperCase()}
                      </span>
                      <div>
                        <header>
                          <strong>{message.name}</strong>
                          <time>
                            {new Date(message.createdAt).toLocaleTimeString(
                              [],
                              { hour: "numeric", minute: "2-digit" },
                            )}
                          </time>
                        </header>
                        <p>{message.body}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="live-empty-chat">
                    Your class chat will appear here.
                  </p>
                )}
              </div>
              <form className="live-message-form" onSubmit={(event) => void sendChat(event)}>
                <div className="live-emoji-wrap">
                  <button
                    type="button"
                    aria-label="Add emoji"
                    title="Add emoji"
                    disabled={paused || chatSending}
                    onClick={() => setEmojiOpen((open) => !open)}
                  >
                    <Smile size={19} />
                  </button>
                  {emojiOpen ? (
                    <div className="live-emoji-picker" aria-label="Choose an emoji">
                      {["😊", "😂", "🎉", "👍", "❤️", "🙏", "👏", "🌱"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Insert ${emoji}`}
                          onClick={() => {
                            setDraft((value) => `${value}${emoji}`);
                            setEmojiOpen(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  aria-label="Chat message"
                  placeholder="Type a message…"
                  value={draft}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={paused || chatSending}
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={paused || chatSending || !draft.trim()}
                >
                  {chatSending ? <span className="live-chat-sending">…</span> : <Send size={19} />}
                </button>
              </form>
            </>
          ) : null}
          {chatOpen && drawer === "people" ? (
            <div className="live-people">
              {transport.people.map((person) => {
                const isMuted =
                  moderation.find((participant) => participant.userId === person.userId)
                    ?.micMuted ?? false;
                const isLearner = person.userId !== creatorId;
                return (
                <article key={person.userId}>
                  <span
                    className="live-avatar"
                    style={{ background: avatar(person.name) }}
                  >
                    {person.name[0]?.toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {person.name}
                      {person.userId === userId ? " (you)" : ""}
                    </strong>
                    <small>
                      {person.userId === creatorId ? "Teacher" : "Learner"}
                    </small>
                  </div>
                  <span
                    className={`live-person-mic ${person.mic && !isMuted ? "is-on" : ""}`}
                    title={isMuted ? "Muted by teacher" : person.mic ? "Microphone on" : "Microphone off"}
                    role="img"
                    aria-label={isMuted ? "Muted by teacher" : person.mic ? "Microphone on" : "Microphone off"}
                  >
                    {person.mic && !isMuted ? <Mic size={15} /> : <MicOff size={15} />}
                  </span>
                  {creator && isLearner ? (
                    <div className="live-person-actions">
                      <button
                        type="button"
                        title={isMuted ? "Allow microphone" : "Mute learner"}
                        aria-label={`${isMuted ? "Allow microphone for" : "Mute"} ${person.name}`}
                        disabled={moderatingUser === person.userId}
                        onClick={() =>
                          void moderateParticipant(isMuted ? "unmute" : "mute", person.userId)
                        }
                      >
                        {isMuted ? <Volume2 size={15} /> : <VolumeX size={15} />}
                      </button>
                      <button
                        type="button"
                        className="is-remove"
                        title="Remove learner from class"
                        aria-label={`Remove ${person.name} from class`}
                        disabled={moderatingUser === person.userId}
                        onClick={() => void moderateParticipant("remove", person.userId)}
                      >
                        <UserX size={15} />
                      </button>
                    </div>
                  ) : null}
                </article>
              );})}
            </div>
          ) : null}
        </aside>
      </div>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void uploadImage(event)}
      />
      {Object.entries(transport.remote).map(([session, stream]) => (
        <MediaAudio
          key={session}
          stream={stream}
          paused={paused}
          onBlocked={() => setSoundBlocked(true)}
        />
      ))}
      {boardPicker ? (
        <div
          className="live-modal-backdrop"
          onClick={(event) => {
            if (event.currentTarget === event.target) setBoardPicker(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Add image to whiteboard"
            className="live-image-picker"
          >
            <header>
              <h2>Add image to whiteboard</h2>
              <button
                aria-label="Close image picker"
                onClick={() => setBoardPicker(false)}
              >
                <X size={20} />
              </button>
            </header>
            <button
              className="live-upload-button"
              disabled={uploading}
              onClick={() => pickUpload(true)}
            >
              <Plus size={18} />
              {uploading ? "Uploading…" : "Upload image"}
            </button>
            <div>
              {assets.map((asset) => (
                <button key={asset.id} onClick={() => addBoardImage(asset)}>
                  <img src={`${api}/assets/${asset.id}`} alt={asset.name} />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
function MediaVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label="Live shared video"
    />
  );
}
function MediaAudio({
  stream,
  paused,
  onBlocked,
}: {
  stream: MediaStream;
  paused: boolean;
  onBlocked: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const callback = useRef(onBlocked);
  callback.current = onBlocked;
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    if (!paused && stream.getAudioTracks().length)
      void audio.play().catch(() => callback.current());
    else audio.pause();
    return () => {
      audio.srcObject = null;
    };
  }, [stream, paused]);
  return <audio ref={ref} autoPlay hidden />;
}
function ZoomStage({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number } | null>(null);
  return (
    <div
      className="live-media-viewport"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        touches.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touches.current.size === 2) {
          const [a, b] = [...touches.current.values()];
          gesture.current = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            zoom,
          };
        }
      }}
      onPointerMove={(event) => {
        const prev = touches.current.get(event.pointerId);
        if (!prev) return;
        touches.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touches.current.size === 2 && gesture.current) {
          const [a, b] = [...touches.current.values()];
          setZoom(
            Math.min(
              4,
              Math.max(
                1,
                (gesture.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
                  gesture.current.distance,
              ),
            ),
          );
        } else if (zoom > 1)
          setPan((old) => ({
            x: old.x + event.clientX - prev.x,
            y: old.y + event.clientY - prev.y,
          }));
      }}
      onPointerUp={(event) => {
        touches.current.delete(event.pointerId);
        gesture.current = null;
      }}
      onPointerCancel={() => {
        touches.current.clear();
        gesture.current = null;
      }}
    >
      <div
        className="live-media-content"
        style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
      >
        {children}
      </div>
      <div className="live-board-zoom">
        <button
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(4, zoom + 0.25))}
        >
          +
        </button>
      </div>
    </div>
  );
}
