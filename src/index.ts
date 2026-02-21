import dotenv from "dotenv";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app";
import { connectDB } from "./database/mongodb";
import { PORT } from "./config";
import { socketAuth } from "./middleware/socket-auth";

dotenv.config();

const app = createApp();
const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.use(socketAuth);

io.on("connection", (socket) => {
  const userPayload = socket.user as { id?: string; _id?: string } | undefined;
  const userId = userPayload?.id || userPayload?._id;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  socket.join(userId.toString());
  console.log(`User ${userId} connected and joined room ${userId}`);

  socket.on("disconnect", () => {
    console.log(`User ${userId} disconnected`);
  });
});

async function startServer() {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();