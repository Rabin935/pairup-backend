import dotenv from "dotenv";
import { createServer } from "http";
import { createApp } from "./app";
import { connectDB } from "./database/mongodb";
import { PORT } from "./config";
import { initSocket } from "./socket";

dotenv.config();

const app = createApp();
const httpServer = createServer(app);

export const io = initSocket(httpServer);

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