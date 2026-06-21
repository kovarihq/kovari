const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config();

const API_URL = process.env.API_URL || "https://kovari.in/api";
const SOCKET_URL = process.env.SOCKET_URL || "https://socket.kovari.in";
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || "25", 10);
const DURATION_MS = parseInt(process.env.DURATION_MS || "10000", 10); // 10 seconds
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate a valid custom Kovari JWT token for load testing
function generateTestToken(userId) {
  if (!JWT_ACCESS_SECRET) {
    console.warn("⚠️ JWT_ACCESS_SECRET not found in .env.local. Socket connection will fail validation.");
    return "invalid-mock-token";
  }
  return jwt.sign(
    { 
      sub: userId, 
      email: `${userId}@kovari-load-test.com`, 
      iss: "kovari-mobile", 
      type: "access" 
    },
    JWT_ACCESS_SECRET,
    { expiresIn: "1h" }
  );
}

async function runLoadTest() {
  console.log(`==================================================`);
  console.log(`🚀 KOVARI LOAD TESTING ENGINE`);
  console.log(`==================================================`);
  console.log(`Target API URL:      ${API_URL}`);
  console.log(`Target Socket URL:   ${SOCKET_URL}`);
  console.log(`Simulated Users:     ${CONCURRENT_USERS}`);
  console.log(`Duration:            ${DURATION_MS / 1000}s`);
  console.log(`JWT secret configured: ${!!JWT_ACCESS_SECRET}`);
  console.log(`==================================================\n`);

  let apiRequestsSent = 0;
  let apiRequestsSuccess = 0;
  let apiRequestsFailed = 0;
  const apiLatencies = [];

  let socketConnectionsAttempted = 0;
  let socketConnectionsSuccess = 0;
  let socketConnectionsFailed = 0;
  let socketMessagesSent = 0;
  let socketMessagesAck = 0;
  const socketAckLatencies = [];

  const startTime = Date.now();
  let keepRunning = true;

  // --- Phase 1: API Concurrency Load Testing ---
  console.log(`⏳ Phase 1: Running API HTTP load testing...`);
  
  const apiTasks = Array.from({ length: CONCURRENT_USERS }).map(async (_, index) => {
    while (keepRunning) {
      const requestStart = Date.now();
      apiRequestsSent++;
      try {
        const res = await fetch(`${API_URL}/health`);
        const duration = Date.now() - requestStart;
        apiLatencies.push(duration);

        if (res.status === 200) {
          apiRequestsSuccess++;
        } else {
          apiRequestsFailed++;
        }
      } catch (err) {
        apiRequestsFailed++;
      }
      // Add a slight delay (50-200ms jitter) to simulate real user pacing
      await sleep(50 + Math.random() * 150);
    }
  });

  // --- Phase 2: Socket.io Concurrency Load Testing ---
  console.log(`⏳ Phase 2: Simulating concurrent socket connections & messaging...`);
  const sockets = [];

  const socketTasks = Array.from({ length: CONCURRENT_USERS }).map(async (_, index) => {
    socketConnectionsAttempted++;
    
    // Use valid UUID shape for userId to satisfy isUUIDv4 checks in socket auth middleware
    const mockUserId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const token = generateTestToken(mockUserId);

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      forceNew: true,
      auth: {
        userId: mockUserId,
        token: token,
        deviceId: `load-test-device-${index}`,
        sessionId: `load-test-session-${index}`,
      },
    });

    sockets.push(socket);

    socket.on("connect", () => {
      socketConnectionsSuccess++;
    });

    socket.on("connect_error", (err) => {
      socketConnectionsFailed++;
    });

    // Message emission simulation loop
    while (keepRunning) {
      if (socket.connected) {
        socketMessagesSent++;
        const msgStart = Date.now();
        
        socket.emit("typing_start", { chatId: `test-chat-${index}` });
        socketMessagesAck++;
        socketAckLatencies.push(Date.now() - msgStart);
      }
      await sleep(200 + Math.random() * 300);
    }
  });

  // Let the test run for the designated duration
  await sleep(DURATION_MS);
  keepRunning = false;

  // Wait for pending promises to finish
  await Promise.all([...apiTasks, ...socketTasks]);

  // Clean up all socket connections
  sockets.forEach((s) => s.disconnect());

  // --- Metrics Aggregation ---
  const totalDuration = (Date.now() - startTime) / 1000;
  
  const avgApiLatency = apiLatencies.length 
    ? (apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length).toFixed(2)
    : "N/A";
  const maxApiLatency = apiLatencies.length ? Math.max(...apiLatencies) : "N/A";

  const avgSocketLatency = socketAckLatencies.length
    ? (socketAckLatencies.reduce((a, b) => a + b, 0) / socketAckLatencies.length).toFixed(2)
    : "N/A";

  console.log(`\n==================================================`);
  console.log(`📊 LOAD TEST REPORT SUMMARY`);
  console.log(`==================================================`);
  console.log(`Test Duration:           ${totalDuration.toFixed(2)}s`);
  console.log(`\n[HTTP API METRICS]`);
  console.log(`Requests Sent:           ${apiRequestsSent}`);
  console.log(`Requests Success:        ${apiRequestsSuccess} (${((apiRequestsSuccess/apiRequestsSent)*100 || 0).toFixed(1)}%)`);
  console.log(`Requests Failed:         ${apiRequestsFailed}`);
  console.log(`Average Latency:         ${avgApiLatency} ms`);
  console.log(`Max Latency:             ${maxApiLatency} ms`);
  console.log(`\n[SOCKET.IO METRICS]`);
  console.log(`Connections Attempted:   ${socketConnectionsAttempted}`);
  console.log(`Connections Success:     ${socketConnectionsSuccess}`);
  console.log(`Connections Failed:      ${socketConnectionsFailed}`);
  console.log(`Messages Sent:           ${socketMessagesSent}`);
  console.log(`Messages Acked:          ${socketMessagesAck}`);
  console.log(`Average Ack Latency:     ${avgSocketLatency} ms`);
  console.log(`==================================================\n`);
}

runLoadTest().catch(console.error);
