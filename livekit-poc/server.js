const express = require("express");
const dotenv = require("dotenv");
const { AccessToken } = require("livekit-server-sdk");
const cors = require("cors");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env.local") });

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const API_KEY = process.env.LIVEKIT_API_KEY || "APIL7PcWirzTbRJ";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "ef1ge1V8t2CO4RbRJ6KCnSNrwlyCefOPiULA4FLdkjCH";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "wss://poc-iyszd10u.livekit.cloud";
const roomState = new Map();

function getRoomState(roomName) {
  if (!roomState.has(roomName)) {
    roomState.set(roomName, {
      streamerIdentity: null,
      participants: new Set(),
    });
  }

  return roomState.get(roomName);
}

function getRoleForJoin(roomName, identity) {
  const state = getRoomState(roomName);
  state.participants.add(identity);

  if (!state.streamerIdentity) {
    state.streamerIdentity = identity;
    return "streamer";
  }

  if (state.streamerIdentity === identity) {
    return "streamer";
  }

  return "viewer";
}

function removeParticipant(roomName, identity) {
  const state = roomState.get(roomName);
  if (!state) {
    return { streamerCleared: false };
  }

  state.participants.delete(identity);
  const streamerCleared = state.streamerIdentity === identity;
  if (streamerCleared) {
    state.streamerIdentity = null;
  }

  if (state.participants.size === 0) {
    roomState.delete(roomName);
  }

  return { streamerCleared };
}

app.get("/health", (req, res) => {
    res.send("OK"); 
}); 

app.get("/config", (req, res) => {
  res.json({ livekitUrl: LIVEKIT_URL });
});

app.get("/room-state", (req, res) => {
  const room = req.query.room || "test-room";
  const state = getRoomState(room);

  res.json({
    room,
    streamerIdentity: state.streamerIdentity,
    participantCount: state.participants.size,
  });
});

app.get("/token", async (req, res) => {
  try {
    const room = req.query.room || "test-room";
    const identity = req.query.user || "user-" + Math.random();
    const role = getRoleForJoin(room, identity);

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: role === "streamer",
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    res.json({
      token,
      room,
      identity,
      role,
      livekitUrl: LIVEKIT_URL,
      streamerIdentity: getRoomState(room).streamerIdentity,
    });
  } catch (error) {
    console.error("Failed to generate token:", error);
    res.status(500).json({ error: error.message || "Failed to generate token" });
  }
});

app.post("/leave", express.json(), (req, res) => {
  const room = req.body?.room;
  const identity = req.body?.identity;

  if (!room || !identity) {
    return res.status(400).json({ error: "room and identity are required" });
  }

  const result = removeParticipant(room, identity);
  return res.json({
    ok: true,
    streamerCleared: result.streamerCleared,
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(3000, () => console.log("Server running on port 3000"));
