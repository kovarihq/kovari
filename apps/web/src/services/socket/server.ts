import { Server } from "socket.io";
import { createServer } from "http";
import { registerSocketEvents } from "./events";
import { resolveSupabaseUserIdFromAuthId } from "./resolveSocketUser";
import { connectRedis, redisAdapter } from "./redis";
import { PresenceManager } from "./presence";
import { createAdminSupabaseClient } from "@kovari/api";
import {
  InterServerEvents,
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents
} from "@kovari/types";
import dotenv from "dotenv";
import path from "path";
import { verifyToken } from "@clerk/backend";
import { verifyAccessToken } from "../../lib/auth/jwt";

// Load environment variables since this is a standalone Node process
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PORT = process.env.PORT || 3005;

const httpServer = createServer((req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Socket server running');
      return;
    }
  }
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      // Allow the mobile dev LAN IP range
      /^http:\/\/172\.\d+\.\d+\.\d+:3000$/,
      /^http:\/\/10\.\d+\.\d+\.\d+:3000$/,
      /^http:\/\/192\.168\.\d+\.\d+:3000$/,
      "https://kovari.in",
      "https://www.kovari.in"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Adapter is set after Redis connects (or skipped in offline-dev mode)
});

// Auth middleware — also resolve Supabase UUID once and cache in socket.data
io.use(async (socket, next) => {
  const { userId, deviceId, sessionId, token } = socket.handshake.auth;
  
  if (!userId || !token) {
    return next(new Error("Authentication error: missing credentials"));
  }

  // SECURITY: Verify the token to prevent identity spoofing
  let verifiedUserId: string | null = null;
  // 1. Try to verify as a Clerk session token (Web client)
  if (process.env.CLERK_SECRET_KEY && token.length > 200) {
    try {
      const claims = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      verifiedUserId = claims.sub;
    } catch (err) {
      // Non-fatal: fall back to custom mobile JWT
      console.log(`[Socket Auth] Clerk token check failed for ${userId}, trying mobile JWT...`);
    }
  }
  
  // 2. Try to verify as Kovari custom mobile JWT
  if (!verifiedUserId) {
    try {
      const payload = verifyAccessToken(token);
      if (payload) verifiedUserId = payload.sub;
    } catch (err) {
      console.warn(`[Socket Auth] Custom JWT check failed for ${userId}:`, err);
    }
  }

  if (!verifiedUserId || verifiedUserId !== userId) {
    console.warn(`[Socket Auth] Failed verification for requested userId: ${userId}`);
    return next(new Error("Authentication error: invalid token"));
  }

  socket.data.userId = verifiedUserId;
  socket.data.deviceId = deviceId;
  socket.data.sessionId = sessionId;

  // Resolve Supabase UUID and profile_photo once at connection (two queries, no join — avoids schema cache issues)
  try {
    const supabase = createAdminSupabaseClient();
    const supabaseId = await resolveSupabaseUserIdFromAuthId(userId);
    socket.data.supabaseId = supabaseId;

    if (supabaseId) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("profile_photo, name, username")
        .eq("user_id", supabaseId)
        .single();
      
      (socket.data as any).profilePhoto = profileRow?.profile_photo || null;
      (socket.data as any).fullName = profileRow?.name || profileRow?.username || "Someone";
    } else {
      (socket.data as any).profilePhoto = null;
      (socket.data as any).fullName = "Someone";
    }
  } catch (err) {
    console.error("[Socket Auth] Supabase lookup failed — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars:", err);
    socket.data.supabaseId = null;
    (socket.data as any).profilePhoto = null;
    (socket.data as any).fullName = "Someone";
  }

  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const supabaseId = socket.data.supabaseId || null;
  console.log(`[Socket] User connected: ${userId} supabaseId: ${supabaseId} (Socket ID: ${socket.id})`);

  // Join the user-specific room so that events (like new_notification) sent to this user are received by this socket.
  socket.join(`user_socket:${userId}`);

  PresenceManager.userConnected(userId, socket.id);

  registerSocketEvents(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] User disconnected: ${userId} (Socket ID: ${socket.id}). Reason: ${reason}`);
    PresenceManager.userDisconnected(userId, socket.id, (cId, uId, lastSeen) => {
      io.to(cId).emit("user_offline", { chatId: cId, userId: uId, supabaseId, lastSeen });
    });
  });
});

// Start server — Redis is optional for local dev.
// In production, Redis is required for multi-instance pub/sub.
async function startServer() {
  const redisConnected = await connectRedis();

  if (redisConnected) {
    io.adapter(redisAdapter);
    console.log("[Socket] Redis adapter enabled (multi-instance mode)");
  } else {
    console.warn(
      "[Socket] ⚠️  Redis unavailable — running in single-instance (in-memory) mode.\n" +
      "           This is fine for local development. Do NOT use in production."
    );
  }

  // Clear stale socket presence data from any previous server run
  await PresenceManager.flushStalePresence();

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[Socket] 🚀 Server listening on port ${PORT} at 0.0.0.0`);
  });
}

startServer();

