"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uniquePeople, type LivePerson } from "@/lib/instant-live/types";

type Signal = {
  from: string;
  to: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type Peer = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingAnswer: boolean;
  candidates: RTCIceCandidateInit[];
  chain: Promise<void>;
  restarts: number;
};
type Envelope = { from: string; userId: string; event: string; data: unknown };
const iceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
export function useLiveTransport({
  roomId,
  self,
  paused,
  forceMuted,
  enabled,
  onEvent,
  onNotice,
}: {
  roomId: string;
  self: LivePerson | null;
  paused: boolean;
  forceMuted: boolean;
  enabled: boolean;
  onEvent: (event: string, data: unknown, from: LivePerson | undefined) => void;
  onNotice: (notice: string) => void;
}) {
  const [client] = useState(() => createClient());
  const channel = useRef<ReturnType<typeof client.channel> | null>(null);
  const presenceChannel = useRef<ReturnType<typeof client.channel> | null>(
    null,
  );
  const readyRef = useRef(false);
  const peers = useRef(new Map<string, Peer>());
  const roster = useRef<LivePerson[]>([]);
  const mic = useRef<MediaStream | null>(null);
  const presentation = useRef<MediaStream | null>(null);
  const callbacks = useRef({ onEvent, onNotice });
  callbacks.current = { onEvent, onNotice };
  const forceMutedRef = useRef(forceMuted);
  forceMutedRef.current = forceMuted;
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState<LivePerson[]>([]);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(false);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [superseded, setSuperseded] = useState(false);
  const send = useCallback(
    async (event: string, data: unknown) => {
      if (!channel.current || !readyRef.current || !self) return;
      // Large boards recover from their saved snapshot; never exceed the
      // realtime payload limit or resend the entire document per pen move.
      if (
        (event === "board-preview" || event === "board-patch") &&
        JSON.stringify(data).length > 160000
      )
        return;
      const result = await channel.current.send({
        type: "broadcast",
        event: "message",
        payload: { from: self.sessionId, userId: self.userId, event, data },
      });
      if (result !== "ok")
        callbacks.current.onNotice(
          "The live connection is interrupted. Reconnecting…",
        );
    },
    [self],
  );
  useEffect(() => {
    if (!self || !enabled) return;
    let disposed = false;
    const connectionMap = peers.current;
    const room = client.channel(`instant-room:${roomId}`, {
      config: {
        private: true,
        presence: { key: self.userId },
        broadcast: { ack: true },
      },
    });
    presenceChannel.current = room;
    const publisher = client.channel(`instant-peer:${roomId}:${self.userId}`, {
      config: { private: true, broadcast: { ack: true } },
    });
    channel.current = publisher;
    const receivers = new Map<string, ReturnType<typeof client.channel>>();
    const removePeer = (id: string) => {
      const peer = peers.current.get(id);
      if (peer) {
        peer.pc.onconnectionstatechange = null;
        peer.pc.oniceconnectionstatechange = null;
        peer.pc.close();
      }
      peers.current.delete(id);
      setRemote((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
    };
    const ensure = (id: string): Peer => {
      const existing = peers.current.get(id);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers });
      const peer: Peer = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        settingAnswer: false,
        candidates: [],
        chain: Promise.resolve(),
        restarts: 0,
      };
      peers.current.set(id, peer);
      pc.onicecandidate = ({ candidate }) => {
        if (candidate)
          void send("signal", {
            from: self.sessionId,
            to: id,
            candidate: candidate.toJSON(),
          });
      };
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription)
            await send("signal", {
              from: self.sessionId,
              to: id,
              description: pc.localDescription.toJSON(),
            });
        } catch {
          if (!disposed && pc.signalingState !== "closed")
            callbacks.current.onNotice(
              "Could not connect media. Check the connection and retry Share.",
            );
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.ontrack = ({ track }) => {
        const refresh = () =>
          setRemote((old) => {
            const stream = new MediaStream(
              (old[id]?.getTracks() ?? []).filter(
                (t) =>
                  t.readyState !== "ended" &&
                  t.id !== track.id &&
                  !(track.kind === "video" && t.kind === "video"),
              ),
            );
            if (track.readyState !== "ended") stream.addTrack(track);
            return { ...old, [id]: stream };
          });
        track.onunmute = refresh;
        track.onended = refresh;
        refresh();
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" && peer.restarts < 2) {
          peer.restarts++;
          pc.restartIce();
        } else if (pc.iceConnectionState === "failed")
          callbacks.current.onNotice(
            "A network is blocking the media connection. Rejoin or try another network; this free direct connection has no relay.",
          );
      };
      for (const stream of [mic.current, presentation.current])
        stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
      return peer;
    };
    const receive = (actorId: string, payload: unknown) => {
      const envelope = payload as Envelope;
      if (
        !envelope ||
        envelope.from === self.sessionId ||
        typeof envelope.event !== "string" ||
        envelope.userId !== actorId
      )
        return;
      const sender = roster.current.find(
        (p) => p.sessionId === envelope.from && p.userId === envelope.userId,
      );
      if (!sender) return;
      if (envelope.event === "hello") {
        ensure(envelope.from);
        callbacks.current.onEvent("state-request", {}, sender);
      } else if (envelope.event === "signal") {
        const signal = envelope.data as Signal;
        if (signal.to !== self.sessionId || signal.from !== envelope.from)
          return;
        const peer = ensure(signal.from);
        peer.chain = peer.chain
          .then(async () => {
            const { pc } = peer;
            if (pc.signalingState === "closed") return;
            if (signal.description) {
              const offer = signal.description.type === "offer";
              const collision =
                offer &&
                (peer.makingOffer ||
                  !(pc.signalingState === "stable" || peer.settingAnswer));
              peer.ignoreOffer = self.sessionId < signal.from && collision;
              if (peer.ignoreOffer) {
                peer.candidates = [];
                return;
              }
              peer.settingAnswer = signal.description.type === "answer";
              try {
                await pc.setRemoteDescription(signal.description);
              } finally {
                peer.settingAnswer = false;
              }
              for (const candidate of peer.candidates.splice(0))
                await pc.addIceCandidate(candidate);
              if (offer) {
                await pc.setLocalDescription();
                if (pc.localDescription)
                  await send("signal", {
                    from: self.sessionId,
                    to: signal.from,
                    description: pc.localDescription.toJSON(),
                  });
              }
            } else if (signal.candidate && !peer.ignoreOffer) {
              if (pc.remoteDescription)
                await pc.addIceCandidate(signal.candidate);
              else peer.candidates.push(signal.candidate);
            }
          })
          .catch(() => {
            if (!disposed)
              callbacks.current.onNotice(
                "Media is reconnecting. If it stays blank, use Reconnect media.",
              );
          });
      } else if (envelope.event === "media-reconnect") {
        const data = envelope.data as { target?: string };
        if (data.target === self.sessionId) {
          removePeer(envelope.from);
          ensure(envelope.from);
        }
      } else callbacks.current.onEvent(envelope.event, envelope.data, sender);
    };
    room.on("presence", { event: "sync" }, () => {
      const entries = Object.values(room.presenceState<LivePerson>()).flat();
      const list = uniquePeople(entries);
      roster.current = list;
      setPeople(list);
      const activeSelf = list.find((p) => p.userId === self.userId);
      const replaced = Boolean(
        activeSelf && activeSelf.sessionId !== self.sessionId,
      );
      setSuperseded(replaced);
      if (replaced) {
        mic.current?.getTracks().forEach((t) => {
          t.enabled = false;
        });
        presentation.current?.getTracks().forEach((t) => t.stop());
      }
      const active = new Set(
        list.filter((p) => p.userId !== self.userId).map((p) => p.sessionId),
      );
      peers.current.forEach((_, id) => {
        if (!active.has(id)) removePeer(id);
      });
      for (const [actor, receiver] of receivers) {
        if (!list.some((p) => p.userId === actor)) {
          void client.removeChannel(receiver);
          receivers.delete(actor);
        }
      }
      if (!replaced)
        for (const person of list) {
          if (person.userId === self.userId) continue;
          if (receivers.has(person.userId)) {
            void send("hello", { target: person.sessionId });
            continue;
          }
          const receiver = client.channel(
            `instant-peer:${roomId}:${person.userId}`,
            { config: { private: true } },
          );
          receivers.set(person.userId, receiver);
          receiver.on("broadcast", { event: "message" }, ({ payload }) =>
            receive(person.userId, payload),
          );
          void receiver.subscribe((status) => {
            if (status === "SUBSCRIBED")
              void send("hello", { target: person.sessionId });
          });
        }
      callbacks.current.onEvent("presence", list, undefined);
    });
    const subscribePresence = () =>
      room.subscribe(async (status) => {
        if (disposed) return;
        readyRef.current = status === "SUBSCRIBED";
        setReady(readyRef.current);
        if (status === "SUBSCRIBED") {
          await room.track({
            ...self,
            mic:
              !forceMutedRef.current &&
              (mic.current?.getAudioTracks().some((t) => t.enabled) ?? false),
          });
          await send("state-request", {});
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          callbacks.current.onNotice(
            "Live connection interrupted. Trying to reconnect…",
          );
      });
    void publisher.subscribe((status) => {
      if (
        status === "SUBSCRIBED" &&
        !disposed &&
        room.state !== "joined" &&
        room.state !== "joining"
      )
        subscribePresence();
    });
    return () => {
      disposed = true;
      readyRef.current = false;
      setReady(false);
      void room.untrack();
      void client.removeChannel(room);
      void client.removeChannel(publisher);
      receivers.forEach((receiver) => void client.removeChannel(receiver));
      presenceChannel.current = null;
      for (const peer of connectionMap.values()) peer.pc.close();
      connectionMap.clear();
      channel.current = null;
    };
  }, [client, enabled, roomId, self, send]);
  useEffect(() => {
    if (!self || !ready) return;
    void presenceChannel.current?.track({
      ...self,
      mic: micOn && !paused && !forceMuted,
    });
  }, [forceMuted, micOn, paused, ready, self]);
  useEffect(() => {
    mic.current?.getTracks().forEach((t) => {
      t.enabled = micOn && !paused && !superseded && !forceMuted;
    });
    presentation.current?.getTracks().forEach((t) => {
      t.enabled = !paused && !superseded;
    });
  }, [forceMuted, paused, micOn, superseded]);
  useEffect(
    () => () => {
      mic.current?.getTracks().forEach((t) => t.stop());
      presentation.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const toggleMic = async () => {
    if (forceMuted) {
      callbacks.current.onNotice("Your teacher has muted your microphone.");
      return;
    }
    try {
      if (!mic.current) {
        mic.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        for (const { pc } of peers.current.values())
          mic.current.getTracks().forEach((t) => pc.addTrack(t, mic.current!));
      }
      const next = !micOn;
      mic.current.getTracks().forEach((t) => {
        t.enabled = next;
      });
      setMicOn(next);
      if (self && ready)
        await presenceChannel.current?.track({ ...self, mic: next && !paused });
    } catch {
      callbacks.current.onNotice(
        "Allow microphone access in your browser to speak.",
      );
    }
  };
  const stopPresentation = useCallback(() => {
    const stream = presentation.current;
    presentation.current = null;
    setLocal(null);
    if (!stream) return;
    const ids = new Set(stream.getTracks().map((t) => t.id));
    for (const { pc } of peers.current.values())
      for (const sender of pc.getSenders())
        if (sender.track && ids.has(sender.track.id)) pc.removeTrack(sender);
    stream.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
  }, []);
  const present = useCallback(
    (stream: MediaStream) => {
      stopPresentation();
      presentation.current = stream;
      setLocal(stream);
      for (const { pc } of peers.current.values())
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    },
    [stopPresentation],
  );
  const reconnect = () => {
    for (const [id, peer] of peers.current) {
      peer.pc.restartIce();
      void send("media-reconnect", { target: id });
    }
    void send("state-request", {});
  };
  return {
    ready,
    people,
    remote,
    local,
    micOn,
    toggleMic,
    present,
    stopPresentation,
    send,
    reconnect,
    superseded,
  };
}
