"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  BookOpen,
  Circle,
  Square,
  Copy,
  ImagePlus,
  Link2,
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
  Settings,
  Smile,
  Send,
  UserX,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { exportBoard, saveLocalFile } from "./instant-live/exportBoard";
import dynamic from "next/dynamic";
import { showContent, type ContentSelection } from "./instant-live/LiveContent";
const LiveContent = dynamic(() => import("./instant-live/LiveContent").then(m => m.LiveContent));
const ContentPicker = dynamic(() => import("./instant-live/LiveContent").then(m => m.ContentPicker));
import { useLocalRecording } from "./instant-live/useLocalRecording";
import { SettingsPanel, type RoomSettings } from "./instant-live/SettingsPanel";
import type { RecordingDirectoryHandle } from "./instant-live/exportBoard";
import { LiveBoard } from "./instant-live/LiveBoard";
import { LivePdfStage } from "./instant-live/LivePdfStage";
import { LiveImageStage } from "./instant-live/LiveImageStage";
import { useLiveTransport } from "./instant-live/useLiveTransport";
import { createZip } from "@/lib/instant-live/createZip";
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
import {
  isBrenUpAndroidShell,
  isBrenUpNativeApp,
  getNativeScreenCaptureStream,
  requestNativeScreenCapture,
  stopNativeScreenCapture,
} from "@/lib/nativeBridge";

type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
};
type ParticipantModeration = { userId: string; micMuted: boolean };
type ServerParticipant = Pick<LivePerson, "userId" | "name" | "role" | "joinedAt"> & { micMuted: boolean };
type WaitingParticipant = { userId: string; name: string; joinedAt: number };
type RoomClock = {
  status: string;
  elapsed_seconds: number;
  active_started_at: string;
  expires_at: string;
  pause_until?: string | null;
  room_locked?: boolean;
  learner_mic_enabled?: boolean;
  learner_chat_enabled?: boolean;
  learner_screen_share_enabled?: boolean;
};
const isPdfAsset = (asset: LiveAsset) => asset.name.toLowerCase().endsWith(".pdf");
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
  adminSupport?: boolean;
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
  adminSupport = false,
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
    status: initialEnded ? "PAUSED" : "LIVE",
    elapsed_seconds: elapsedOffset,
    active_started_at: startedAt,
    expires_at: "",
  });
  const [now, setNow] = useState(Date.now());
  const statusRef = useRef(clock.status);
  statusRef.current = clock.status;
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
  const [serverParticipants, setServerParticipants] = useState<ServerParticipant[]>([]);
  const [moderatingUser, setModeratingUser] = useState<string | null>(null);
  const [roomRevoked, setRoomRevoked] = useState(false);
  const [gallery, setGallery] = useState(false);
  const galleryLeftRef = useRef<HTMLDivElement>(null);
  const galleryRightRef = useRef<HTMLDivElement>(null);
  const [boardPicker, setBoardPicker] = useState(false);
  const [imageLinkOpen, setImageLinkOpen] = useState(false);
  const [imageLink, setImageLink] = useState("");
  const [imageLinkBusy, setImageLinkBusy] = useState(false);
  const [imageLinkError, setImageLinkError] = useState("");
  const [imageLinkTarget, setImageLinkTarget] = useState<"gallery" | "board">("gallery");
  const [pointer, setPointer] = useState<[number, number] | null>(null);
  const [stagePointer, setStagePointer] = useState<[number, number] | null>(null);
  const [stagePointerEnabled, setStagePointerEnabled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [stageFocus, setStageFocus] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [endClassOpen, setEndClassOpen] = useState(false);
  const [quitPrompt, setQuitPrompt] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [recordingAt, setRecordingAt] = useState<number | null>(null);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [waitingParticipants, setWaitingParticipants] = useState<WaitingParticipant[]>([]);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({ room_locked: false, learner_mic_enabled: true, learner_chat_enabled: true, learner_screen_share_enabled: true });
  const roomSettingsRef = useRef(roomSettings);
  const roomSettingsVersion = useRef(0);
  const roomSettingsRefreshId = useRef(0);
  const settingVersions = useRef<Partial<Record<keyof RoomSettings, number>>>({});
  const settingQueues = useRef(new Map<keyof RoomSettings, Promise<void>>());
  const [recordingDirectory, setRecordingDirectory] = useState<RecordingDirectoryHandle | null>(null);
  const [recordingDirectoryName, setRecordingDirectoryName] = useState("Browser downloads");
  const [contentPicker, setContentPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const uploadToBoard = useRef(false);
  const dirty = useRef(false);
  const boardVersion = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const mediaPageQueue = useRef<Promise<void>>(Promise.resolve());
  const mediaPagePending = useRef<number | null>(null);
  const drawerDragStart = useRef<number | null>(null);
  const drawerDragMoved = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTime = useRef(0);
  const previewBoard = useRef<BoardObject[]>([]);
  const pointerTime = useRef(0);
  const stagePointerTime = useRef(0);
  const receivedPreviewAt = useRef(0);
  const joinedAt = useRef(Date.now());
  const transportRef = useRef<ReturnType<typeof useLiveTransport> | null>(null);
  const paused = clock.status !== "LIVE";
  const ended = clock.status === "ENDED";
  const pauseRemaining = clock.pause_until
    ? Math.max(0, Math.floor((Date.parse(clock.pause_until) - now) / 1000))
    : 15 * 60;
  const api = `/api/instant-live/rooms/${roomId}`;
  const forceMuted = (!creator && !roomSettings.learner_mic_enabled) || moderation.some(
    (participant) => participant.userId === userId && participant.micMuted,
  );
  useEffect(() => {
    setSelf({
      userId,
      sessionId: crypto.randomUUID(),
      name: userName,
      role: adminSupport ? "SUPPORT" : role,
      joinedAt: joinedAt.current,
      mic: false,
    });
  }, [adminSupport, role, userId, userName]);
  useEffect(() => {
    if (!adminSupport) return;
    const leaveSupport = () => {
      void fetch(`/api/admin/instant-live/rooms/${roomId}/support`, {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leaveSupport);
    return () => window.removeEventListener("pagehide", leaveSupport);
  }, [adminSupport, roomId]);
  const applyState = useCallback((next: SharedState) => {
    const previous = stateRef.current;
    const merged = { ...previous };
    if (next.revision >= previous.revision) {
      merged.stage = next.stage;
      merged.asset_id = next.asset_id;
      merged.media_page = mediaPagePending.current ?? next.media_page;
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
    const settingsVersionAtRequest = roomSettingsVersion.current;
    const settingsRefreshId = ++roomSettingsRefreshId.current;
    try {
      const response = await fetch(`${api}/state${adminSupport ? "?adminSupport=1" : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          setRoomRevoked(true);
          setLoaded(true);
        }
        throw new Error(result.error || "Could not load the live stage.");
      }
      const chatResponse = adminSupport ? null : await fetch(`${api}/chat`, { cache: "no-store" });
      const chatResult = chatResponse?.ok ? await chatResponse.json() : null;
      applyState(result.state);
      setAssets(result.assets);
      setModeration(result.moderation ?? []);
      if (Array.isArray(result.participants)) setServerParticipants(result.participants);
      if (chatResult?.messages) setChat(chatResult.messages);
      setClock(result.room);
      if (
        settingsVersionAtRequest === roomSettingsVersion.current &&
        settingsRefreshId === roomSettingsRefreshId.current
      ) {
        const nextRoomSettings = {
          room_locked: Boolean(result.room?.room_locked),
          learner_mic_enabled: result.room?.learner_mic_enabled !== false,
          learner_chat_enabled: result.room?.learner_chat_enabled !== false,
          learner_screen_share_enabled: result.room?.learner_screen_share_enabled !== false,
        };
        roomSettingsRef.current = nextRoomSettings;
        setRoomSettings(nextRoomSettings);
      }
      if (creator && Array.isArray(result.waitingParticipants)) setWaitingParticipants(result.waitingParticipants);
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
  }, [api, applyState, creator, roomRevoked, adminSupport]);
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
        const p = data as { surface?: string; point?: [number, number] | null };
        const point = p.point && p.point.length === 2 && p.point.every(Number.isFinite) ? p.point : null;
        if (p.surface === "stage") setStagePointer(point);
        else setPointer(point);
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
    enabled: loaded && !roomRevoked && (!adminSupport || clock.status === "LIVE"),
    recordingStartedAt: recordingAt,
    receiveOnly: adminSupport,
    receiveOnlyFromUserId: adminSupport && (state.stage === "screen" || state.stage === "camera")
      ? state.presenter_id
      : null,
    onEvent,
    onNotice: setNotice,
  });
  transportRef.current = transport;
  const peopleByUser = new Map<string, LivePerson>();
  for (const participant of serverParticipants) {
    peopleByUser.set(participant.userId, {
      ...participant,
      sessionId: "",
      mic: false,
    });
  }
  for (const person of transport.people) peopleByUser.set(person.userId, person);
  const visiblePeople = [...peopleByUser.values()].sort(
    (a, b) => Number(b.role === "CREATOR") - Number(a.role === "CREATOR") || a.name.localeCompare(b.name),
  );
  const recording = useLocalRecording(roomId, [
    ...(transport.microphone?.getAudioTracks() ?? []),
    ...(transport.local?.getAudioTracks() ?? []),
    ...Object.values(transport.remote).flatMap(stream => stream.getAudioTracks()),
  ], setNotice);
  const canChooseRecordingFolder = !isBrenUpNativeApp() && typeof window !== "undefined" && "showDirectoryPicker" in window;
  async function chooseRecordingFolder() {
    const pickerWindow = window as Window & { showDirectoryPicker?: () => Promise<RecordingDirectoryHandle> };
    if (!pickerWindow.showDirectoryPicker) return;
    try {
      const handle = await pickerWindow.showDirectoryPicker();
      setRecordingDirectory(handle);
      setRecordingDirectoryName(handle.name);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("Could not select that folder.");
    }
  }
  function updateRoomSetting(key: keyof RoomSettings, value: boolean) {
    const previousValue = roomSettingsRef.current[key];
    const nextSettings = { ...roomSettingsRef.current, [key]: value };
    roomSettingsRef.current = nextSettings;
    setRoomSettings(nextSettings);
    roomSettingsVersion.current += 1;
    const version = (settingVersions.current[key] ?? 0) + 1;
    settingVersions.current[key] = version;
    const previousRequest = settingQueues.current.get(key) ?? Promise.resolve();
    const request = previousRequest.catch(() => {}).then(async () => {
      const response = await fetch(`${api}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save setting.");
      if (settingVersions.current[key] === version) {
        void transportRef.current?.send("state-changed", {});
      }
    }).catch((error: unknown) => {
      if (settingVersions.current[key] === version) {
        roomSettingsVersion.current += 1;
        const rolledBack = { ...roomSettingsRef.current, [key]: previousValue };
        roomSettingsRef.current = rolledBack;
        setRoomSettings(rolledBack);
        setNotice(error instanceof Error ? error.message : "Could not save room setting.");
        void refresh();
      }
    });
    settingQueues.current.set(key, request);
  }
  useEffect(() => { setRecordingAt(recording.startedAt); }, [recording.startedAt]);
  const recordingStop = useRef(recording.stop); recordingStop.current = recording.stop;
  useEffect(() => { if (paused || roomRevoked || transport.superseded) recordingStop.current(); }, [paused, roomRevoked, transport.superseded]);
  const visibleRecordingAt = creator ? recording.startedAt : transport.people.find(person => person.userId === creatorId)?.recordingStartedAt;

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
    }, adminSupport ? 2500 : 15000);
    return () => {
      clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh, adminSupport]);
  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ended]);
  useEffect(() => {
    if (!creator || clock.status !== "LIVE") return;
    const heartbeat = () => {
      void fetch(`${api}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
      }).catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 20_000);
    return () => clearInterval(timer);
  }, [api, clock.status, creator]);
  useEffect(() => {
    if (!creator || clock.status !== "LIVE") return;
    const pauseOnExit = () => {
      if (statusRef.current !== "LIVE") return;
      const board = dirty.current ? boardRef.current : undefined;
      const body = new Blob([JSON.stringify({ action: "pause", board })], { type: "application/json" });
      if (!navigator.sendBeacon(`${api}/end`, body)) {
        void fetch(`${api}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause", board }), keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", pauseOnExit);
    return () => window.removeEventListener("pagehide", pauseOnExit);
  }, [api, clock.status, creator]);
  useEffect(() => {
    if (!ended) return;
    const timer = window.setTimeout(() => window.location.assign("/account"), 2500);
    return () => window.clearTimeout(timer);
  }, [ended]);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStageFocus(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", listener);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => {
    setChatOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);
  useEffect(() => {
    const updateRoomHeight = () => {
      const node = root.current;
      if (!node || window.matchMedia("(min-width: 1024px)").matches) {
        node?.style.removeProperty("--live-available-height");
        return;
      }
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.max(0, node.getBoundingClientRect().top);
      node.style.setProperty("--live-available-height", `${Math.max(320, viewportHeight - top)}px`);
    };
    updateRoomHeight();
    window.addEventListener("resize", updateRoomHeight);
    window.visualViewport?.addEventListener("resize", updateRoomHeight);
    return () => {
      window.removeEventListener("resize", updateRoomHeight);
      window.visualViewport?.removeEventListener("resize", updateRoomHeight);
    };
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
  const changeSharedPdfPage = (assetId: string, page: number) => {
    mediaPagePending.current = page;
    stateRef.current = { ...stateRef.current, media_page: page };
    setState(stateRef.current);
    const request = mediaPageQueue.current.then(async () => {
      const result = await command({ action: "media-page", assetId, page });
      if (mediaPagePending.current === page) {
        mediaPagePending.current = null;
        if (result) applyState(result);
      }
    }).catch(async (error: unknown) => {
      if (mediaPagePending.current === page) mediaPagePending.current = null;
      setNotice(error instanceof Error ? error.message : "Could not change the shared PDF page.");
      await refresh();
    });
    mediaPageQueue.current = request;
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
  useEffect(() => {
    if (!stagePointer || creator) return;
    const timer = setTimeout(() => setStagePointer(null), 1500);
    return () => clearTimeout(timer);
  }, [stagePointer, creator]);
  function broadcastPointer(point: [number, number] | null) {
    setPointer(point);
    if (!point || Date.now() - pointerTime.current > 100) {
      pointerTime.current = Date.now();
      void transport.send("pointer", { surface: "board", point });
    }
  }
  function broadcastStagePointer(point: [number, number] | null) {
    setStagePointer(point);
    if (!point || Date.now() - stagePointerTime.current > 100) {
      stagePointerTime.current = Date.now();
      void transport.send("pointer", { surface: "stage", point });
    }
  }
  function toggleStagePointer() {
    if (stagePointerEnabled) broadcastStagePointer(null);
    setStagePointerEnabled(value => !value);
  }
  async function stopSharing() {
    if (!self) return;
    const errors: string[] = [];
    try {
      if (isBrenUpNativeApp()) {
        await stopNativeScreenCapture();
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
    transport.stopPresentation();
    try {
      await command({ action: "release", session: self.sessionId });
    } catch (error) {
      errors.push((error as Error).message);
    }
    setNotice(errors.join(" "));
  }
  async function switchToWhiteboard() {
    if (!self || !creator || paused || state.stage === "whiteboard") return;
    if (stagePointerEnabled) {
      broadcastStagePointer(null);
      setStagePointerEnabled(false);
    }
    if (state.stage !== "image" || !state.asset_id) {
      await stopSharing();
      return;
    }
    try {
      await command({ action: "show-whiteboard", session: self.sessionId });
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not switch to the whiteboard.");
    }
  }
  async function resumeParkedMedia() {
    const assetId = state.asset_id;
    if (!self || !creator || paused || !assetId) return;
    try {
      await command({
        action: "claim",
        stage: "image",
        assetId,
        session: self.sessionId,
      });
      setGallery(false);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not restore the presentation.");
    }
  }
  function startDrawerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    drawerDragStart.current = event.clientY;
    drawerDragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finishDrawerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const start = drawerDragStart.current;
    if (start === null) return;
    const distance = event.clientY - start;
    if (Math.abs(distance) > 34) {
      drawerDragMoved.current = true;
      setChatOpen(distance < 0);
    }
    drawerDragStart.current = null;
  }
  function toggleDrawerFromHandle() {
    if (drawerDragMoved.current) {
      drawerDragMoved.current = false;
      return;
    }
    setChatOpen(open => !open);
  }
  async function startSharing(kind: "screen" | "camera") {
    if (!creator && kind === "screen" && !roomSettings.learner_screen_share_enabled) {
      setNotice("The teacher has disabled learner screen sharing.");
      return;
    }
    if (!self || busy || locked || paused) return;
    if (kind === "screen" && isBrenUpNativeApp() && (recording.startedAt || recording.busy)) {
      setNotice("Stop or finish the local recording before starting a separate screen share.");
      return;
    }
    if (
      ownPresentation &&
      (state.stage === "screen" || state.stage === "camera")
    ) {
      await stopSharing();
      return;
    }
    if (kind === "screen" && !navigator.mediaDevices?.getDisplayMedia && !isBrenUpNativeApp()) {
      setNotice(
        isBrenUpAndroidShell()
          ? "BrenUp's Android screen-sharing connection is unavailable. Close and reopen the app. If this continues, contact support with your Android System WebView version."
          : /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
          ? "Full-screen sharing is not available in mobile web browsers. Please use the official BrenUp Android app or use Image to share content."
          : "This browser does not provide screen capture. Try a supported desktop browser or use Image to show a picture.",
      );
      return;
    }
    setBusy(true);
    let stream: MediaStream | null = null;
    let nativeCaptureStarted = false;
    try {
      if (kind === "screen" && isBrenUpNativeApp()) {
        const nativeConsent = await requestNativeScreenCapture("share");
        if (!nativeConsent.granted) {
          setNotice(nativeConsent.message || "Screen capture permission was declined.");
          setBusy(false);
          return;
        }
        if (!nativeConsent.streamUrl) throw new Error("Android did not provide a screen capture source.");
        nativeCaptureStarted = true;
        stream = await getNativeScreenCaptureStream(nativeConsent.streamUrl);
      }
      // Capture must be requested directly from this click, before awaiting server work.
      const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      if (!stream) stream =
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
      if (nativeCaptureStarted) await stopNativeScreenCapture().catch(() => undefined);
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
      setGallery(false);
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
    if (uploadToBoard.current && file.type === "application/pdf") {
      setNotice("PDFs can be shown from Media, but cannot be placed on the whiteboard.");
      uploadToBoard.current = false;
      return;
    }
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
  async function addImageLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = imageLink.trim();
    if (!url || imageLinkBusy) return;
    setImageLinkBusy(true);
    setImageLinkError("");
    try {
      if (new URL(url).protocol !== "https:") throw new Error("Use a public HTTPS link that opens the image directly.");
      const probe = new window.Image();
      probe.referrerPolicy = "no-referrer";
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("The image took too long to load.")), 15000);
        probe.onload = () => { window.clearTimeout(timeout); resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); };
        probe.onerror = () => { window.clearTimeout(timeout); reject(new Error("This link did not return a directly viewable image. Use the image file URL itself (not a webpage or share link), or upload the file.")); };
        probe.src = url;
      });
      const response = await fetch(`${api}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, width: dimensions.width, height: dimensions.height }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add this image link.");
      setAssets((old) => [...old, result.asset]);
      setGallery(true);
      void transport.send("assets-changed", {});
      if (imageLinkTarget === "board") addBoardImage(result.asset);
      setImageLink("");
      setImageLinkOpen(false);
    } catch (error) {
      setImageLinkError(error instanceof Error ? error.message : "Could not add this image link.");
    } finally {
      setImageLinkBusy(false);
    }
  }
  function openImageLink(target: "gallery" | "board") {
    setImageLinkTarget(target);
    setImageLinkError("");
    setImageLinkOpen(true);
  }
  async function removeGalleryAsset(asset: LiveAsset) {
    try {
      const response = await fetch(`${api}/assets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove this media item.");
      setAssets(old => old.filter(item => item.id !== asset.id));
      void transport.send("assets-changed", {});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove this media item.");
    }
  }
  async function lifecycle(action: "pause" | "restart" | "quit") {
    if (!creator || busy) return;
    setBusy(true);
    try {
      if (action !== "restart") {
        await saveBoard();
        if (dirty.current) throw new Error("Save the board before continuing.");
      }
      const response = await fetch(`${api}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update the class.");
      setClock((old) => ({
        ...old,
        status: result.status,
        elapsed_seconds: result.elapsedSeconds,
        active_started_at: result.activeStartedAt ?? old.active_started_at,
        expires_at: result.pauseUntil ?? old.expires_at,
        pause_until: result.pauseUntil ?? null,
      }));
      setNow(Date.now());
      void transport.send("state-changed", {});
      setEndClassOpen(false);
      if (action === "quit") setQuitPrompt(false);
      setNotice("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveMaterialsAndQuit() {
    if (savingMaterials || busy) return;
    setSavingMaterials(true);
    try {
      await saveBoard();
      if (dirty.current) throw new Error("Wait for the whiteboard to finish saving, then try again.");
      const svg = root.current?.querySelector<SVGSVGElement>(".live-board-svg");
      if (!svg) throw new Error("The whiteboard is not ready to export yet.");
      const boardImage = await exportBoard(svg);
      const folder = `${title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "BrenUp-Class"}-Materials`;
      const entries: Array<{ name: string; data: Uint8Array }> = [
        { name: `${folder}/whiteboard.png`, data: new Uint8Array(await boardImage.arrayBuffer()) },
      ];
      for (const [index, asset] of assets.entries()) {
        const response = await fetch(`${api}/assets/${asset.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not export image “${asset.name}”. Retry or remove unavailable images before quitting.`);
        const contentType = response.headers.get("content-type") ?? "image/webp";
        const extension = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : contentType.includes("gif") ? "gif" : contentType.includes("svg") ? "svg" : "webp";
        const base = asset.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || `image-${index + 1}`;
        entries.push({ name: `${folder}/images/${String(index + 1).padStart(2, "0")}-${base}.${extension}`, data: new Uint8Array(await (await response.blob()).arrayBuffer()) });
      }
      const archive = createZip(entries);
      const stamp = new Date().toISOString().slice(0, 10);
      const saved = await saveLocalFile(archive, `${folder}-${stamp}.zip`);
      if (!saved) return;
      setQuitPrompt(false);
      await lifecycle("quit");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare the class materials.");
    } finally {
      setSavingMaterials(false);
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
    action: "mute" | "unmute" | "remove" | "allow" | "deny" | "allow_all",
    targetUserId?: string,
  ) {
    if (!creator || moderatingUser) return;
    if (action !== "allow_all" && !targetUserId) return;
    const targetId = targetUserId ?? "";
    setModeratingUser(targetId || "waiting-list");
    try {
      const response = await fetch(`${api}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(targetId ? { userId: targetId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update this learner.");
      if (action === "allow" || action === "deny" || action === "allow_all") {
        setNotice(action === "allow_all" ? `${result.admitted ?? 0} learner${result.admitted === 1 ? "" : "s"} admitted.` : action === "allow" ? "Learner admitted." : "Request declined.");
      } else if (action === "remove") {
        setModeration((old) => old.filter((item) => item.userId !== targetId));
      } else {
        setModeration((old) => [
          ...old.filter((item) => item.userId !== targetId),
          { userId: targetId, micMuted: action === "mute" },
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
      void refresh();
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
  async function chooseContent(selection: ContentSelection) {
    if (!self || !creator) return;
    const next = await showContent(api, selection, self.sessionId, stateRef.current.revision);
    transport.stopPresentation();
    applyState(next);
    void transport.send("state-changed", {});
  }
  async function exportWhiteboard(addToGallery: boolean) {
    if (exporting) return;
    setExporting(true);
    try {
      const svg = root.current?.querySelector<SVGSVGElement>(".live-board-svg");
      if (!svg) throw new Error("Open the whiteboard first.");
      const blob = await exportBoard(svg);
      const name = `whiteboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      if (addToGallery) {
        const form = new FormData(); form.append("file", new File([blob], name, {type: "image/png"}));
        const response = await fetch(`${api}/assets`, {method: "POST", body: form});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not add the image.");
        setAssets(old => [...old, result.asset]); setGallery(true);
        void transport.send("assets-changed", {});
        setNotice("Whiteboard added to your image gallery.");
      } else {
        const saved = await saveLocalFile(blob, name);
        if (!saved) return;
        if (isBrenUpNativeApp()) setNotice("Whiteboard saved to your device.");
      }
      setExportOpen(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export the whiteboard."); }
    finally { setExporting(false); }
  }
  async function enableSound() {
    const results = await Promise.allSettled(Array.from(root.current?.querySelectorAll("audio") ?? []).map(audio => audio.play()));
    const blocked = results.some(result => result.status === "rejected");
    setSoundBlocked(blocked);
    if (blocked) throw new Error("Audio playback is still blocked.");
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
      className={`live-control ${active ? "is-active" : ""} ${cta ? "is-cta" : ""} ${label === "Mic" && active ? "is-mic-on" : ""} ${label === "Mic" && transport.audioActivity[self?.sessionId ?? ""]?.speaking ? "is-speaking" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label === "Mic" ? active ? (transport.audioActivity[self?.sessionId ?? ""]?.speaking ? "Microphone on · speaking" : "Microphone on · not speaking") : "Microphone off" : undefined}
    >
      <span className="live-control-icon">
        <Icon
          size={22}
          style={label === "Mic" && active ? {
            transform: `rotate(${transport.audioActivity[self?.sessionId ?? ""]?.tilt ?? 0}deg) scale(${1 + (transport.audioActivity[self?.sessionId ?? ""]?.level ?? 0) * 0.12})`,
          } : undefined}
        />
      </span>
      <span>{label}</span>
    </button>
  );
  const galleryLeft = assets.filter((_, index) => index % 2 === 1).reverse();
  const galleryRight = assets.filter((_, index) => index % 2 === 0);
  useEffect(() => {
    if (gallery && galleryLeftRef.current) galleryLeftRef.current.scrollLeft = galleryLeftRef.current.scrollWidth;
  }, [gallery, galleryLeft.length]);
  function renderGalleryAsset(asset: LiveAsset) {
    const usedOnBoard = board.some(item => item.kind === "image" && item.assetId === asset.id);
    return <div key={asset.id} className={`live-thumbnail ${state.asset_id === asset.id ? "is-active" : ""}`}>
      <button type="button" disabled={!creator || locked || paused} onClick={() => void showImage(asset)} title={creator ? `Show ${asset.name}` : asset.name}>
        {isPdfAsset(asset) ? <span className="live-pdf-thumbnail"><FileText size={25}/><b>PDF</b></span> : <img src={`${api}/assets/${asset.id}`} alt={asset.name} referrerPolicy="no-referrer"/>}
      </button>
      <span>{asset.name}</span>
      {creator && !isPdfAsset(asset) ? <button className="live-add-to-board" aria-label={`Add ${asset.name} to whiteboard`} title="Add to whiteboard" onClick={() => addBoardImage(asset)} disabled={paused}><Plus size={13}/></button> : null}
      {(creator || asset.owner_id === userId) ? <button className="live-remove-from-gallery" aria-label={`Remove ${asset.name} from gallery`} title={state.asset_id === asset.id ? "Remove it from the stage first" : usedOnBoard ? "Remove it from the whiteboard first" : "Remove from gallery"} onClick={() => void removeGalleryAsset(asset)} disabled={state.asset_id === asset.id || usedOnBoard}><X size={13}/></button> : null}
    </div>;
  }
  function scrollGallery(direction: -1 | 1) {
    const distance = Math.max(180, Math.round((galleryRightRef.current?.clientWidth ?? 320) * 0.72));
    for (const rail of [galleryLeftRef.current, galleryRightRef.current]) {
      rail?.scrollBy({ left: direction * distance, behavior: "smooth" });
    }
  }
  return (
    <main
      ref={root}
      className={`${styles.root} ${fullscreen ? styles.fullscreen : ""} ${stageFocus ? styles.stageFocused : ""}`}
      data-live-classroom
      data-role={role}
      data-admin-support={adminSupport ? "true" : undefined}
    >
      {adminSupport ? <div className="live-admin-support-banner" role="status">Admin support · read-only view</div> : null}
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
          {visiblePeople.length || 1}
        </span>
        {visibleRecordingAt ? <span className="live-recording-badge" role="status"><i/> REC {new Date(Math.max(0, now-visibleRecordingAt)).toISOString().slice(11,19)}</span> : null}
        <div className="live-header-actions">
          {creator ? (
            <button className="live-copy" onClick={() => void copyLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "Copied" : "Copy link"}</span>
            </button>
          ) : null}
          {!adminSupport ? <button title="Class settings" aria-label="Class settings" onClick={() => setSettingsOpen(true)}><Settings size={18}/></button> : null}
          {!adminSupport ? <button
            title="Refresh the shared board, chat, and media connection"
            aria-label="Refresh classroom and reconnect media"
            onClick={() => void syncClassroom()}
          >
            <RefreshCw size={18} />
          </button> : null}
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
          onClick={() => void enableSound().catch(() => {})}
        >
          Tap to hear the class
        </button>
      ) : null}
      <div className={`live-layout ${chatOpen ? "" : "drawer-closed"}`}>
        <section className={`live-main ${gallery ? "has-gallery" : ""}`}>
          <div className={`live-stage-shell ${stageFocus ? "is-focused" : ""}`}>
            <button className="live-stage-focus" type="button" title={stageFocus ? "Exit focused view" : "Focus on shared screen"} aria-label={stageFocus ? "Exit focused view" : "Focus on shared screen"} onClick={() => setStageFocus(value => !value)}>
              {stageFocus ? <X size={18}/> : <Maximize2 size={17}/>}
            </button>
            {creator && state.stage === "whiteboard" && state.asset_id ? (
              <button className="live-stage-resume-media" type="button" onClick={() => void resumeParkedMedia()} disabled={paused || busy}>
                Return to presentation
              </button>
            ) : null}
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
                adminSupport={adminSupport}
                pointer={pointer}
                onPointer={broadcastPointer}
              />
            </div>
            {state.stage === "content" ? adminSupport ? <div className="live-stage-placeholder">Lesson and quiz interactions are hidden in read-only support mode.</div> : <LiveContent api={api} revision={state.revision} creator={creator} paused={paused} onChoose={chooseContent} onNotice={setNotice}/> : null}
            {(state.stage === "image" || (state.stage === "whiteboard" && state.asset_id)) && state.asset_id ? (() => {
              const sharedAsset = assets.find(asset => asset.id === state.asset_id);
              if (!sharedAsset) return null;
              return <div className="live-projected-media" hidden={state.stage !== "image"}>
                {sharedAsset && isPdfAsset(sharedAsset) ? (
                    <LivePdfStage
                      api={api}
                      adminSupport={adminSupport}
                      assetId={sharedAsset.id}
                      page={state.media_page || 1}
                      creator={creator && !paused}
                      onPageChange={page => changeSharedPdfPage(sharedAsset.id, page)}
                      pointer={stagePointer}
                      pointerEnabled={stagePointerEnabled}
                      onPointerToggle={toggleStagePointer}
                      onStagePointer={broadcastStagePointer}
                    />
                ) : (
                  <LiveImageStage
                    key={sharedAsset.id}
                    api={api}
                    adminSupport={adminSupport}
                    assetId={sharedAsset.id}
                    images={assets.filter(asset => !isPdfAsset(asset))}
                    creator={creator && !paused}
                    onSelectAsset={id => {
                      const image = assets.find(asset => asset.id === id && !isPdfAsset(asset));
                      if (image) void showImage(image);
                    }}
                    pointer={stagePointer}
                    pointerEnabled={stagePointerEnabled}
                    onPointerToggle={toggleStagePointer}
                    onStagePointer={broadcastStagePointer}
                  />
                )}
                {creator ? <button className="live-stage-dismiss" type="button" aria-label="Remove media from stage" title="Remove from stage" onClick={() => void stopSharing()}><X size={18}/></button> : null}
              </div>;
            })() : null}
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
            {clock.status === "PAUSED" ? (
              <div className="live-paused-overlay">
                <div>
                  <h2>Class paused</h2>
                  <p>
                    {`The class will close automatically in ${Math.floor(pauseRemaining / 60)}:${String(pauseRemaining % 60).padStart(2, "0")}.`}
                  </p>
                  {creator ? (
                    <div className="live-paused-actions">
                      <button onClick={() => void lifecycle("restart")} disabled={busy}>
                        <RotateCcw size={17} /> Restart
                      </button>
                      <button className="is-quit" onClick={() => setQuitPrompt(true)} disabled={busy}>
                        <PhoneOff size={17} /> Quit
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {ended ? (
              <div className="live-paused-overlay live-ended-overlay">
                <div>
                  <h2>Class has ended</h2>
                  <p>You’re leaving this classroom.</p>
                  <button onClick={() => window.location.assign("/account")}>Return to BrenUp</button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="live-stage-caption">
            <span>
              <i className={transport.ready ? "connected" : ""} />
              {!loaded
                ? "Connecting"
                : clock.status === "PAUSED"
                  ? "Paused"
                  : ended
                    ? "Ended"
                  : transport.ready
                    ? "Live connection"
                    : "Reconnecting"}
              {presenter ? ` · ${presenter.name} is presenting` : ""}
            </span>
            {creator ? (
              <button onClick={() => void saveBoard()}>{saveStatus}</button>
            ) : null}
          </div>
          {gallery ? (
            <div className="live-gallery" aria-label="Media gallery">
              <button className="live-gallery-nav is-prev" type="button" aria-label="Scroll media left" onClick={() => scrollGallery(-1)}><ChevronLeft size={17}/></button>
              <div className="live-gallery-side is-left" ref={galleryLeftRef}>
                <div className="live-gallery-side-track">{galleryLeft.map(renderGalleryAsset)}</div>
              </div>
              <div className="live-gallery-add-tile">
                <button type="button" disabled={uploading || paused} onClick={() => pickUpload()} title="Upload media">
                  <Plus size={18}/><span>{uploading ? "Uploading…" : "Upload"}</span>
                </button>
                <button type="button" disabled={paused} onClick={() => openImageLink("gallery")} title="Add image link">
                  <Link2 size={17}/><span>Add Link</span>
                </button>
              </div>
              <div className="live-gallery-side is-right" ref={galleryRightRef}><div className="live-gallery-side-track">{galleryRight.map(renderGalleryAsset)}</div></div>
              <button className="live-gallery-nav is-next" type="button" aria-label="Scroll media right" onClick={() => scrollGallery(1)}><ChevronRight size={17}/></button>
            </div>
          ) : null}
          {!adminSupport ? <div className="live-bottom-rail">
            {button(
              forceMuted ? "Muted by teacher" : "Mic",
              transport.micOn && !forceMuted && !paused ? Mic : MicOff,
              () => { void enableSound().catch(() => {}); void transport.toggleMic(); },
              transport.micOn && !forceMuted && !paused,
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
                  () => void switchToWhiteboard(),
                  state.stage === "whiteboard",
                  paused || busy,
                )
              : null}
            {button(
              uploading ? "Uploading…" : "Media",
              ImagePlus,
              () => setGallery((value) => !value),
              gallery,
              paused || uploading,
            )}
            {creator ? button("Lesson / quiz", BookOpen, () => setContentPicker(true), state.stage === "content", paused || busy || locked) : null}
            {creator && state.stage === "whiteboard" ? button("Export", Download, () => setExportOpen(true), false, exporting) : null}
            {creator ? button(recording.startedAt ? "Stop recording" : "Record", recording.startedAt ? Square : Circle, () => recording.startedAt ? recording.stop() : setRecordingOpen(true), Boolean(recording.startedAt), recording.busy || paused || (isBrenUpNativeApp() && ownPresentation && state.stage === "screen")) : null}
            <span className="live-control-divider" />
            {creator && !ended
              ? button(
                  clock.status === "PAUSED" ? "Restart" : "End class",
                  clock.status === "PAUSED" ? RotateCcw : PhoneOff,
                  () => clock.status === "PAUSED" ? void lifecycle("restart") : setEndClassOpen(true),
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
          </div> : null}
        </section>
        {!adminSupport ? <aside className={`live-drawer ${chatOpen ? "" : "is-collapsed"}`}>
          <button className="live-drawer-handle" type="button" aria-label={chatOpen ? "Collapse chat and people" : "Expand chat and people"} onPointerDown={startDrawerDrag} onPointerUp={finishDrawerDrag} onPointerCancel={() => { drawerDragStart.current = null; }} onClick={toggleDrawerFromHandle}>
            <span aria-hidden="true" />
          </button>
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
                    disabled={paused || chatSending || (!creator && !roomSettings.learner_chat_enabled)}
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
                  disabled={paused || chatSending || (!creator && !roomSettings.learner_chat_enabled)}
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={paused || chatSending || (!creator && !roomSettings.learner_chat_enabled) || !draft.trim()}
                >
                  {chatSending ? <span className="live-chat-sending">…</span> : <Send size={19} />}
                </button>
              </form>
            </>
          ) : null}
          {chatOpen && drawer === "people" ? (
            <div className="live-people">
              {visiblePeople.map((person) => {
                const isMuted =
                  moderation.find((participant) => participant.userId === person.userId)
                    ?.micMuted ?? false;
                const isLearner = person.userId !== creatorId && person.role === "LEARNER";
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
                      {person.role === "SUPPORT" ? "Admin support" : person.userId === creatorId ? "Teacher" : "Learner"}
                    </small>
                  </div>
                  {person.role !== "SUPPORT" && !(creator && isLearner) ? <span
                    className={`live-person-mic ${person.mic && !isMuted ? "is-on" : ""} ${transport.audioActivity[person.sessionId]?.speaking ? "is-speaking" : ""}`}
                    title={isMuted ? "Muted by teacher" : person.mic ? (transport.audioActivity[person.sessionId]?.speaking ? "Microphone on · speaking" : "Microphone on · not speaking") : "Microphone off"}
                    role="img"
                    aria-label={isMuted ? "Muted by teacher" : person.mic ? "Microphone on" : "Microphone off"}
                  >
                    {person.mic && !isMuted ? <Mic size={15} style={{ transform: `rotate(${transport.audioActivity[person.sessionId]?.tilt ?? 0}deg) scale(${1 + (transport.audioActivity[person.sessionId]?.level ?? 0) * 0.12})` }} /> : <MicOff size={15} />}
                  </span> : null}
                  {creator && isLearner ? (
                    <div className="live-person-actions">
                      <button
                        className={`${person.mic && !isMuted ? "is-mic-on" : ""} ${transport.audioActivity[person.sessionId]?.speaking ? "is-speaking" : ""}`}
                        type="button"
                        title={isMuted ? "Muted by teacher · click to allow microphone (learner must turn it on)" : person.mic ? "Microphone on · click to mute" : "Microphone off · click to prevent unmuting"}
                        aria-label={`${isMuted ? "Allow microphone for" : "Mute"} ${person.name}`}
                        disabled={moderatingUser === person.userId}
                        onClick={() =>
                          void moderateParticipant(isMuted ? "unmute" : "mute", person.userId)
                        }
                      >
                        {person.mic && !isMuted ? <Mic size={15} style={{ transform: `rotate(${transport.audioActivity[person.sessionId]?.tilt ?? 0}deg) scale(${1 + (transport.audioActivity[person.sessionId]?.level ?? 0) * 0.12})` }} /> : <MicOff size={15} />}
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
              {creator && waitingParticipants.length ? <section className="live-waiting-list" aria-label="Waiting learners">
                <header><div><strong>Waiting</strong><span>{waitingParticipants.length}</span></div><button type="button" disabled={Boolean(moderatingUser)} onClick={() => void moderateParticipant("allow_all")}>Allow all</button></header>
                {waitingParticipants.map(person => <article key={person.userId}>
                  <span className="live-avatar" style={{ background: avatar(person.name) }}>{person.name[0]?.toUpperCase()}</span>
                  <div><strong>{person.name}</strong><small>Requesting to join</small></div>
                  <button className="live-waiting-allow" type="button" disabled={moderatingUser === person.userId} onClick={() => void moderateParticipant("allow", person.userId)}>Allow</button>
                </article>)}
              </section> : null}
            </div>
          ) : null}
        </aside> : null}
      </div>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
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
      {settingsOpen ? <SettingsPanel creator={creator} settings={roomSettings} recordingLocation={isBrenUpNativeApp() ? "Choose on save" : recordingDirectoryName} canChooseFolder={canChooseRecordingFolder} onClose={() => setSettingsOpen(false)} onRoomChange={(key,value) => void updateRoomSetting(key,value)} onChooseFolder={() => void chooseRecordingFolder()} onResetFolder={() => { setRecordingDirectory(null); setRecordingDirectoryName("Browser downloads"); }} onEnableSound={enableSound} onSelectMicrophone={transport.prepareMicrophone} connections={transport.connections}/>: null}
      {contentPicker && creator ? <ContentPicker api={api} onClose={() => setContentPicker(false)} onChoose={chooseContent}/> : null}
      {endClassOpen && creator ? (
        <div className="live-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) setEndClassOpen(false); }}>
          <section className="live-feature-panel live-class-end-dialog" role="dialog" aria-modal="true" aria-labelledby="live-end-title">
            <header><h2 id="live-end-title">End class</h2><button aria-label="Close" disabled={busy} onClick={() => setEndClassOpen(false)}><X size={18}/></button></header>
            <p>Pause to resume within 15 minutes, or quit permanently.</p>
            <div className="live-end-actions">
              <button disabled={busy} onClick={() => void lifecycle("pause")}><RotateCcw size={16}/> Pause · 15 min</button>
              <button className="is-quit" disabled={busy} onClick={() => { setEndClassOpen(false); setQuitPrompt(true); }}><PhoneOff size={16}/> Continue to quit</button>
            </div>
          </section>
        </div>
      ) : null}
      {quitPrompt && creator ? (
        <div className="live-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy && !savingMaterials) setQuitPrompt(false); }}>
          <section className="live-feature-panel live-class-end-dialog" role="dialog" aria-modal="true" aria-labelledby="live-quit-title">
            <header><h2 id="live-quit-title">Quit class?</h2><button aria-label="Close" disabled={busy || savingMaterials} onClick={() => setQuitPrompt(false)}><X size={18}/></button></header>
            <p>Uploaded media and the whiteboard are deleted from BrenUp after you quit.</p>
            <div className="live-end-actions live-quit-actions">
              <button disabled={busy || savingMaterials} onClick={() => void saveMaterialsAndQuit()}><Download size={16}/>{savingMaterials ? "Preparing…" : "Save copy & quit"}</button>
              <button className="is-quit" disabled={busy || savingMaterials} onClick={() => void lifecycle("quit")}><PhoneOff size={16}/> Quit without saving</button>
              <button className="is-cancel" disabled={busy || savingMaterials} onClick={() => setQuitPrompt(false)}>Back</button>
            </div>
          </section>
        </div>
      ) : null}
      {recordingOpen && creator ? <div className="live-modal-backdrop" onClick={e => {if(e.target === e.currentTarget && !recording.busy) setRecordingOpen(false);}}><section className="live-feature-panel" role="dialog" aria-modal="true" aria-label="Local recording"><header><h2 id="live-recording-title">Local recording</h2><button aria-label="Close recordings" onClick={() => setRecordingOpen(false)}><X size={18}/></button></header><p>{isBrenUpNativeApp() ? "Android will ask you to choose what to capture. The recording includes the selected screen and class audio, including your mic when on. Everyone sees a recording indicator. No upload or paid service." : "Choose this classroom tab in the browser's screen picker. Records its picture and class audio, including your mic when on. Everyone sees a recording indicator. No upload or paid service."}</p><p>{isBrenUpNativeApp() ? "Keep BrenUp open. Files are kept in this app's browser storage until you save or delete them. Android indicates active capture; stop the recording in BrenUp or from the Android notification when it is shown. A file stops at 500 MB; start another part if needed." : "Keep this tab open. Files are kept in this browser until you save or delete them. Screen capture requires a supported desktop browser. A file stops at 500 MB; start another part if needed."}</p>{isBrenUpNativeApp() && ownPresentation && state.stage === "screen" ? <p role="status">Stop your current screen share before starting a local recording.</p> : null}<button disabled={recording.busy || paused || Boolean(recording.startedAt) || (isBrenUpNativeApp() && ownPresentation && state.stage === "screen")} onClick={() => {setRecordingOpen(false); void recording.start();}}>Start recording</button>{recording.saved.map(file => <div className="live-recording-file" key={file.id}><span>{new Date(file.createdAt).toLocaleString()} · {(file.size/1e6).toFixed(1)} MB{!file.complete ? " · interrupted" : ""}</span><button disabled={recording.busy} onClick={() => void recording.save(file, recordingDirectory)}>Save to {recordingDirectoryName}</button><button disabled={recording.busy} onClick={() => {if(window.confirm("Delete this local recording? Save your file first.")) void recording.remove(file).catch(() => setNotice("Could not delete recording."));}}>Delete</button></div>)}</section></div> : null}
      {creator && recording.saved.length && !recording.startedAt ? <button className="live-recordings-ready" onClick={() => setRecordingOpen(true)}>Local recordings · {recording.saved.length}</button> : null}
      {exportOpen ? <div className="live-modal-backdrop" onClick={e => {if(e.target === e.currentTarget && !exporting) setExportOpen(false);}}><section className="live-feature-panel" role="dialog" aria-modal="true" aria-label="Export whiteboard"><header><h2>Export whiteboard</h2><button aria-label="Close export" disabled={exporting} onClick={() => setExportOpen(false)}><X size={18}/></button></header><p>The whole board, without toolbars or selection outlines.</p><button disabled={exporting} onClick={() => void exportWhiteboard(false)}>Save PNG to device</button><button disabled={exporting || paused} onClick={() => void exportWhiteboard(true)}>Add to image gallery</button>{exporting ? <p role="status">Preparing image…</p> : null}</section></div> : null}
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
            <button className="live-upload-button live-link-button" onClick={() => openImageLink("board")}>
              <Link2 size={18} /> Add image link
            </button>
            <div>
              {assets.filter(asset => !isPdfAsset(asset)).map((asset) => (
                <button key={asset.id} onClick={() => addBoardImage(asset)}>
                  <img src={`${api}/assets/${asset.id}`} alt={asset.name} referrerPolicy="no-referrer" />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {imageLinkOpen ? (
        <div className="live-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !imageLinkBusy) setImageLinkOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Add image link" className="live-image-picker live-image-link-dialog">
            <header><h2>Add image from a link</h2><button type="button" aria-label="Close" disabled={imageLinkBusy} onClick={() => setImageLinkOpen(false)}><X size={20}/></button></header>
            <p>Paste a public HTTPS link to an image. It will appear like any other gallery image.</p>
            <form onSubmit={(event) => void addImageLink(event)}>
              <label htmlFor="live-image-url">Image URL</label>
              <input id="live-image-url" type="url" inputMode="url" placeholder="https://example.com/image.jpg" value={imageLink} onChange={(event) => { setImageLink(event.target.value); setImageLinkError(""); }} required />
              {imageLinkError ? <p className="live-image-link-error" role="alert">{imageLinkError}</p> : null}
              <button className="live-upload-button" type="submit" disabled={imageLinkBusy}>{imageLinkBusy ? "Checking image…" : imageLinkTarget === "board" ? "Add to whiteboard" : "Add to gallery"}</button>
            </form>
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
    const play = () => {
      if (!paused && stream.getAudioTracks().some(track => track.readyState === "live"))
        void audio.play().catch(error => { if(error?.name !== "AbortError") callback.current(); });
      else audio.pause();
    };
    stream.addEventListener("addtrack", play);
    stream.addEventListener("removetrack", play);
    play();
    return () => {
      stream.removeEventListener("addtrack", play);
      stream.removeEventListener("removetrack", play);
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
                0.25,
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
          onClick={() => setZoom(Math.max(0.25, +(zoom - 0.1).toFixed(2)))}
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
          onClick={() => setZoom(Math.min(4, +(zoom + 0.1).toFixed(2)))}
        >
          +
        </button>
      </div>
    </div>
  );
}
