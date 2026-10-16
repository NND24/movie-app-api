// "Xem cùng nhau" / "Đọc cùng nhau": watch-party and read-together rooms over socket.io.
// Manga rooms (kind "manga": slug = manga id, episode = chapter id) also share where each member
// is reading (page), since the reader is our own page.
// The movie player is an embedded iframe whose
// playback can't be controlled, so a room doesn't sync seeking; it gives friends a shared chat for
// an episode, ready checks, and a 3-2-1 countdown (timed by the server clock) to press play together.
// Rooms live in memory: they disappear when the server restarts or shortly after everyone leaves.
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model";
import { allowedOrigins } from "./allowedOrigins";

const MAX_MEMBERS = 20;
const MAX_MESSAGES = 100;
const MAX_TEXT = 500;
const MIN_MESSAGE_GAP_MS = 600;
const COUNTDOWN_MS = 3500;
// An empty room is kept this long, so a reload or a short disconnect doesn't lose it.
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const REACTIONS = ["😂", "😱", "😭", "❤️", "🔥", "👏"];

interface Member {
  userId: string;
  name: string;
  avatar: string;
  ready: boolean;
  // Manga rooms: page being read (0-based) out of total.
  page: number;
  total: number;
  // Open tabs of this user in the room (one member per user).
  sockets: Set<string>;
}

export interface ChatMessage {
  id: string;
  kind: "user" | "system";
  userId?: string;
  name?: string;
  avatar?: string;
  text: string;
  at: number;
}

interface Room {
  code: string;
  kind: "movie" | "manga";
  hostId: string;
  slug: string;
  episode: string;
  movieName: string;
  poster: string;
  members: Map<string, Member>;
  messages: ChatMessage[];
  countdownAt: number | null;
  // Host's player (when it is ours, e.g. Internet Archive copies): position at server time "at".
  player: { playing: boolean; position: number; at: number; episode: string } | null;
  emptySince: number | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();
let messageSeq = 0;

const newCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const snapshot = (room: Room) => ({
  code: room.code,
  kind: room.kind,
  hostId: room.hostId,
  slug: room.slug,
  episode: room.episode,
  movieName: room.movieName,
  poster: room.poster,
  members: [...room.members.values()].map((m) => ({ userId: m.userId, name: m.name, avatar: m.avatar, ready: m.ready, page: m.page, total: m.total })),
  messages: room.messages,
  countdownAt: room.countdownAt && room.countdownAt > Date.now() - 3000 ? room.countdownAt : null,
  player: room.player && room.player.episode === room.episode ? room.player : null,
  serverTime: Date.now(),
});

export const attachWatchParty = (server: HttpServer) => {
  const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    // Small payloads only (chat text).
    maxHttpBufferSize: 16 * 1024,
  });

  // Every connection must carry a valid access token; banned users are refused.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const decoded = jwt.verify(String(token || ""), process.env.ACCESS_TOKEN_SECRET as string) as { id?: string };
      const user = decoded?.id ? await userModel.findById(decoded.id).select("name avatar banned").lean() : null;
      if (!user || (user as any).banned) return next(new Error("unauthorized"));
      socket.data.user = { userId: String(user._id), name: (user as any).name, avatar: (user as any).avatar?.url || "" };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  const broadcastMembers = (room: Room) => io.to(room.code).emit("room:update", snapshot(room));

  const systemMessage = (room: Room, text: string) => {
    const msg: ChatMessage = { id: `m${++messageSeq}`, kind: "system", text, at: Date.now() };
    room.messages = [...room.messages, msg].slice(-MAX_MESSAGES);
    io.to(room.code).emit("chat:message", msg);
  };

  const leave = (socket: Socket, room: Room) => {
    const me = socket.data.user;
    const member = room.members.get(me.userId);
    socket.leave(room.code);
    socket.data.room = undefined;
    if (!member) return;
    member.sockets.delete(socket.id);
    if (member.sockets.size) return;
    room.members.delete(me.userId);
    if (room.members.size === 0) {
      room.emptySince = Date.now();
      return;
    }
    // The host left: the longest-present member takes over.
    if (room.hostId === me.userId) {
      const next = room.members.values().next().value as Member;
      room.hostId = next.userId;
      systemMessage(room, `${me.name} đã rời phòng. ${next.name} giờ là chủ phòng.`);
    } else {
      systemMessage(room, `${me.name} đã rời phòng.`);
    }
    broadcastMembers(room);
  };

  io.on("connection", (socket) => {
    const me = socket.data.user as { userId: string; name: string; avatar: string };
    const currentRoom = () => (socket.data.room ? rooms.get(socket.data.room) : undefined);
    let lastMessageAt = 0;
    let lastReactionAt = 0;
    let lastPositionAt = 0;

    const join = (room: Room, ack: (res: unknown) => void) => {
      const old = currentRoom();
      if (old && old.code !== room.code) leave(socket, old);
      let member = room.members.get(me.userId);
      if (!member) {
        if (room.members.size >= MAX_MEMBERS) return ack({ error: `Phòng đã đủ ${MAX_MEMBERS} người` });
        member = { ...me, ready: false, page: 0, total: 0, sockets: new Set() };
        room.members.set(me.userId, member);
        if (room.members.size > 1) systemMessage(room, `${me.name} đã vào phòng.`);
      }
      member.sockets.add(socket.id);
      room.emptySince = null;
      // A room left empty passes to whoever comes back first.
      if (!room.members.has(room.hostId)) room.hostId = me.userId;
      socket.join(room.code);
      socket.data.room = room.code;
      broadcastMembers(room);
      ack({ room: snapshot(room), me: me.userId });
    };

    socket.on("room:create", (payload, ack = () => undefined) => {
      const slug = str(payload?.slug, 200);
      const episode = str(payload?.episode, 50);
      if (!slug || !episode) return ack({ error: "Thiếu thông tin phim" });
      const room: Room = {
        code: newCode(),
        kind: payload?.kind === "manga" ? "manga" : "movie",
        hostId: me.userId,
        slug,
        episode,
        movieName: str(payload?.movieName, 300),
        poster: str(payload?.poster, 1000),
        members: new Map(),
        messages: [],
        countdownAt: null,
        player: null,
        emptySince: null,
        createdAt: Date.now(),
      };
      rooms.set(room.code, room);
      join(room, ack);
      systemMessage(room, `${me.name} đã tạo phòng. Gửi link cho bạn bè để ${room.kind === "manga" ? "đọc" : "xem"} cùng nhé!`);
    });

    socket.on("room:join", (payload, ack = () => undefined) => {
      const room = rooms.get(str(payload?.code, 10).toUpperCase());
      if (!room) return ack({ error: "Phòng không tồn tại hoặc đã đóng" });
      join(room, ack);
    });

    socket.on("room:leave", () => {
      const room = currentRoom();
      if (room) leave(socket, room);
    });

    socket.on("chat:send", (payload, ack = () => undefined) => {
      const room = currentRoom();
      const text = str(payload?.text, MAX_TEXT);
      if (!room || !text) return ack({ error: "Không gửi được" });
      if (Date.now() - lastMessageAt < MIN_MESSAGE_GAP_MS) return ack({ error: "Bạn gửi nhanh quá" });
      lastMessageAt = Date.now();
      const msg: ChatMessage = { id: `m${++messageSeq}`, kind: "user", userId: me.userId, name: me.name, avatar: me.avatar, text, at: Date.now() };
      room.messages = [...room.messages, msg].slice(-MAX_MESSAGES);
      io.to(room.code).emit("chat:message", msg);
      ack({ ok: true });
    });

    // Floating emoji reactions (not kept in the history).
    socket.on("chat:react", (payload) => {
      const room = currentRoom();
      if (!room || !REACTIONS.includes(payload?.emoji)) return;
      if (Date.now() - lastReactionAt < 250) return;
      lastReactionAt = Date.now();
      io.to(room.code).emit("chat:reaction", { emoji: payload.emoji, name: me.name, at: Date.now() });
    });

    // Manga rooms: the page this member is on (sent while scrolling, at most ~3 times a second).
    socket.on("member:position", (payload) => {
      const room = currentRoom();
      const member = room?.members.get(me.userId);
      if (!room || !member || Date.now() - lastPositionAt < 300) return;
      lastPositionAt = Date.now();
      const total = Math.max(0, Math.min(2000, Math.floor(Number(payload?.total) || 0)));
      member.total = total;
      member.page = Math.max(0, Math.min(total, Math.floor(Number(payload?.page) || 0)));
      io.to(room.code).emit("member:position", { userId: me.userId, page: member.page, total: member.total });
    });

    socket.on("member:ready", (payload) => {
      const room = currentRoom();
      const member = room?.members.get(me.userId);
      if (!room || !member) return;
      member.ready = !!payload?.ready;
      broadcastMembers(room);
    });

    // Host only: everyone gets the same moment (server time) to press play.
    socket.on("countdown:start", (_payload, ack = () => undefined) => {
      const room = currentRoom();
      if (!room) return ack({ error: "Bạn không ở trong phòng" });
      if (room.hostId !== me.userId) return ack({ error: "Chỉ chủ phòng mới bắt đầu được" });
      if (room.countdownAt && room.countdownAt > Date.now()) return ack({ error: "Đang đếm ngược" });
      room.countdownAt = Date.now() + COUNTDOWN_MS;
      room.members.forEach((m) => (m.ready = false));
      io.to(room.code).emit("countdown", { startAt: room.countdownAt, serverTime: Date.now(), by: me.name });
      systemMessage(room, `${me.name} bắt đầu đếm ngược — cùng bấm play khi về 0!`);
      broadcastMembers(room);
      ack({ ok: true });
    });

    // Host only: move the whole room to another episode.
    socket.on("room:episode", (payload, ack = () => undefined) => {
      const room = currentRoom();
      const episode = str(payload?.episode, 50);
      if (!room || !episode) return ack({ error: "Không đổi được tập" });
      if (room.hostId !== me.userId) return ack({ error: "Chỉ chủ phòng mới đổi tập được" });
      if (room.episode === episode) return ack({ ok: true });
      room.episode = episode;
      room.countdownAt = null;
      room.player = null;
      room.members.forEach((m) => {
        m.ready = false;
        m.page = 0;
      });
      const label = str(payload?.label, 100);
      systemMessage(room, room.kind === "manga" ? `${me.name} chuyển cả phòng sang ${label || "chương khác"}.` : `${me.name} chuyển cả phòng sang tập ${episode}.`);
      broadcastMembers(room);
      ack({ ok: true });
    });

    // Host only: play / pause / seek (and a heartbeat while playing) of our own player; the others
    // follow it. "event" is a deliberate action, "tick" the heartbeat (drift correction only).
    // At most one relay per 200 ms, but never dropping the last state: a pause/seek/play burst
    // ends with the newest state sent (an event wins over a heartbeat in the same window).
    let lastPlayerAt = 0;
    let pendingPlayer: { payload: any; timer: NodeJS.Timeout } | null = null;
    const relayPlayer = (payload: any) => {
      const room = currentRoom();
      if (!room || room.kind !== "movie" || room.hostId !== me.userId) return;
      lastPlayerAt = Date.now();
      const position = Math.max(0, Math.min(6 * 3600, Number(payload?.position) || 0));
      room.player = { playing: !!payload?.playing, position, at: Date.now(), episode: room.episode };
      socket.to(room.code).emit("player:state", { ...room.player, kind: payload?.kind === "tick" ? "tick" : "event" });
    };
    socket.on("player:state", (payload) => {
      const wait = lastPlayerAt + 200 - Date.now();
      if (wait <= 0 && !pendingPlayer) return relayPlayer(payload);
      const kind = pendingPlayer?.payload?.kind === "event" || payload?.kind !== "tick" ? "event" : "tick";
      if (pendingPlayer) clearTimeout(pendingPlayer.timer);
      // The position is the host's at sending time: shift it by the delay when playing.
      const sentAt = Date.now();
      const timer = setTimeout(() => {
        const p = pendingPlayer?.payload;
        pendingPlayer = null;
        if (p) relayPlayer({ ...p, position: (Number(p.position) || 0) + (p.playing ? (Date.now() - p.sentAt) / 1000 : 0) });
      }, Math.max(0, wait));
      pendingPlayer = { payload: { ...payload, kind, sentAt }, timer };
    });

    socket.on("time:ping", (_payload, ack = () => undefined) => ack({ serverTime: Date.now() }));

    socket.on("disconnect", () => {
      const room = currentRoom();
      if (room) leave(socket, room);
    });
  });

  // Drop rooms that stayed empty.
  setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, code) => {
      if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) rooms.delete(code);
    });
  }, 60 * 1000).unref();

  return io;
};

export const watchPartyStats = () => ({ rooms: rooms.size, members: [...rooms.values()].reduce((n, r) => n + r.members.size, 0) });
