"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useSession } from "./session";

// Google's free public STUN servers help two browsers find a direct path to each other.
// Networks that block direct connections would need a TURN relay (not configured).
const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const SPEAKING_LEVEL = 0.035;

export type PeerStatus = "connecting" | "connected" | "failed";
type Member = { playerId: Id<"players">; name: string; muted: boolean; joinedAt: number };
type Signal = { _id: Id<"voiceSignals">; from: Id<"players">; kind: "offer" | "answer" | "ice"; payload: string };

export type Voice = {
  members: Member[];
  joined: boolean;
  joining: boolean;
  muted: boolean;
  /** Joined without a microphone (none, or permission refused). */
  listenOnly: boolean;
  peers: Record<string, PeerStatus>;
  speaking: Set<string>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
};

/**
 * Live voice for a room: a small mesh of direct browser-to-browser audio connections.
 * Convex only carries the connection-setup messages; the newer member always makes
 * the offer, so two browsers never both call each other.
 */
export function useVoice(roomId: Id<"rooms">, code: string, me: Id<"players">, online: Set<string>): Voice {
  const { token } = useSession();
  const convex = useConvex();
  const members = useQuery(api.voice.members, { roomId }) ?? [];
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [peers, setPeers] = useState<Record<string, PeerStatus>>({});
  const [speaking, setSpeaking] = useState<Set<string>>(() => new Set());
  const inbox = useQuery(api.voice.inbox, joined ? { token, code } : "skip");

  const joinM = useMutation(api.voice.join);
  const leaveM = useMutation(api.voice.leave);
  const signalM = useMutation(api.voice.signal);
  const ackM = useMutation(api.voice.ack);
  const muteM = useMutation(api.voice.setMuted);

  const wantJoined = useRef(false);
  const local = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const handled = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const audio = useRef(new Map<string, HTMLAudioElement>());
  const audioCtx = useRef<AudioContext | null>(null);
  const analysers = useRef(new Map<string, AnalyserNode>());

  const send = useCallback(
    (to: string, kind: Signal["kind"], payload: unknown) =>
      signalM({ token, code, to: to as Id<"players">, kind, payload: JSON.stringify(payload) }).catch(() => {}),
    [signalM, token, code],
  );

  const watchLevel = useCallback((id: string, stream: MediaStream) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analysers.current.set(id, analyser);
  }, []);

  const closePeer = useCallback((id: string) => {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    pendingIce.current.delete(id);
    analysers.current.delete(id);
    const el = audio.current.get(id);
    if (el) {
      el.srcObject = null;
      el.remove();
      audio.current.delete(id);
    }
    setPeers((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (id: string) => {
      closePeer(id);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = local.current;
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      else pc.addTransceiver("audio", { direction: "recvonly" });

      pc.onicecandidate = (e) => e.candidate && void send(id, "ice", e.candidate.toJSON());
      pc.ontrack = (e) => {
        const remote = e.streams[0] ?? new MediaStream([e.track]);
        let el = audio.current.get(id);
        if (!el) {
          el = document.createElement("audio");
          el.autoplay = true;
          el.setAttribute("playsinline", "");
          el.hidden = true;
          document.body.appendChild(el);
          audio.current.set(id, el);
        }
        el.srcObject = remote;
        void el.play().catch(() => {});
        watchLevel(id, remote);
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        const status: PeerStatus = s === "connected" ? "connected" : s === "failed" ? "failed" : "connecting";
        setPeers((p) => ({ ...p, [id]: status }));
      };
      pcs.current.set(id, pc);
      setPeers((p) => ({ ...p, [id]: "connecting" }));
      return pc;
    },
    [closePeer, send, watchLevel],
  );

  const flushIce = useCallback(async (id: string, pc: RTCPeerConnection) => {
    const waiting = pendingIce.current.get(id) ?? [];
    pendingIce.current.delete(id);
    for (const c of waiting) await pc.addIceCandidate(c).catch(() => {});
  }, []);

  const handle = useCallback(
    async (s: Signal) => {
      const data = JSON.parse(s.payload);
      if (s.kind === "offer") {
        // A (re)connecting member calls us: start a fresh connection for them.
        const pc = createPeer(s.from);
        await pc.setRemoteDescription(data);
        await flushIce(s.from, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        await send(s.from, "answer", pc.localDescription);
      } else if (s.kind === "answer") {
        const pc = pcs.current.get(s.from);
        if (pc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(data);
          await flushIce(s.from, pc);
        }
      } else {
        const pc = pcs.current.get(s.from);
        if (pc?.remoteDescription) await pc.addIceCandidate(data).catch(() => {});
        else pendingIce.current.set(s.from, [...(pendingIce.current.get(s.from) ?? []), data]);
      }
    },
    [createPeer, flushIce, send],
  );

  // Handle incoming connection messages strictly in order, then delete them on the server.
  useEffect(() => {
    if (!joined || !inbox) return;
    const fresh = inbox.filter((s) => !handled.current.has(s._id));
    if (fresh.length === 0) return;
    for (const s of fresh) handled.current.add(s._id);
    queue.current = queue.current.then(async () => {
      for (const s of fresh) await handle(s).catch((e) => console.warn("voice signal failed", e));
      await ackM({ token, code, ids: fresh.map((s) => s._id) }).catch(() => {});
    });
  }, [inbox, joined, handle, ackM, token, code]);

  // Connect to members who are online, and drop connections to anyone who left.
  const mine = members.find((m) => m.playerId === me);
  const others = members.filter((m) => m.playerId !== me && online.has(m.playerId));
  const othersKey = others.map((m) => `${m.playerId}:${m.joinedAt}`).join(",");
  useEffect(() => {
    if (!joined || !mine) return;
    const present = new Set(others.map((m) => m.playerId as string));
    for (const id of [...pcs.current.keys()]) if (!present.has(id)) closePeer(id);
    for (const m of others) {
      const iAmNewer = mine.joinedAt > m.joinedAt || (mine.joinedAt === m.joinedAt && me > m.playerId);
      if (!iAmNewer || pcs.current.has(m.playerId)) continue;
      queue.current = queue.current.then(async () => {
        const pc = createPeer(m.playerId);
        await pc.setLocalDescription(await pc.createOffer());
        await send(m.playerId, "offer", pc.localDescription);
      });
    }
    // `othersKey` captures membership changes; `others` itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, mine?.joinedAt, othersKey, me, createPeer, closePeer, send]);

  // A membership left over from a closed tab: clear it so others don't try to call us.
  const listedAsMember = Boolean(mine);
  useEffect(() => {
    if (listedAsMember && !joined && !wantJoined.current) void leaveM({ token, code }).catch(() => {});
  }, [listedAsMember, joined, leaveM, token, code]);

  // Who's talking: sample audio levels a few times a second.
  useEffect(() => {
    if (!joined) return;
    const buf = new Float32Array(512);
    const id = setInterval(() => {
      const now = new Set<string>();
      for (const [who, analyser] of analysers.current) {
        if (who === me && muted) continue;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        if (Math.sqrt(sum / buf.length) > SPEAKING_LEVEL) now.add(who);
      }
      setSpeaking((prev) => (prev.size === now.size && [...now].every((x) => prev.has(x)) ? prev : now));
    }, 150);
    return () => clearInterval(id);
  }, [joined, me, muted]);

  const teardown = useCallback(() => {
    for (const id of [...pcs.current.keys()]) closePeer(id);
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    analysers.current.clear();
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    handled.current.clear();
    setSpeaking(new Set());
  }, [closePeer]);

  const join = useCallback(async () => {
    if (wantJoined.current) return;
    wantJoined.current = true;
    setJoining(true);
    audioCtx.current = new AudioContext();
    try {
      local.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      watchLevel(me, local.current);
      setListenOnly(false);
    } catch {
      local.current = null; // no microphone, or permission refused: listen only
      setListenOnly(true);
    }
    try {
      await joinM({ token, code });
      setMuted(false);
      setJoined(true);
    } catch (err) {
      wantJoined.current = false;
      teardown();
      throw err;
    } finally {
      setJoining(false);
    }
  }, [joinM, token, code, me, watchLevel, teardown]);

  const leave = useCallback(() => {
    wantJoined.current = false;
    teardown();
    setJoined(false);
    void leaveM({ token, code }).catch(() => {});
  }, [teardown, leaveM, token, code]);

  const toggleMute = useCallback(() => {
    const stream = local.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    void muteM({ token, code, muted: next }).catch(() => {});
  }, [muted, muteM, token, code]);

  // Leave the call when the page closes (a normal request may not finish, so use a beacon)
  // or when this room view goes away.
  useEffect(() => {
    if (!joined) return;
    const onUnload = () => {
      const body = JSON.stringify({ path: "voice:leave", args: { token, code } });
      navigator.sendBeacon(`${convex.url}/api/mutation`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [joined, token, code, convex]);

  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);
  useEffect(() => () => {
    if (wantJoined.current) leaveRef.current();
  }, []);

  return { members, joined, joining, muted, listenOnly, peers, speaking, join, leave, toggleMute };
}
