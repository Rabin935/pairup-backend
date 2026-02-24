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
    const tryListen = (port: number) =>
      new Promise<void>((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => {
          httpServer.removeListener("listening", onListening);
          reject(err);
        };

        const onListening = () => {
          httpServer.removeListener("error", onError);
          console.log(`Server running at http://localhost:${port}`);
          resolve();
        };

        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(port);
      });

    const startPort = Number(PORT) || 5000;
    const maxAttempts = 10;
    let port = startPort;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await tryListen(port);
        return;
      } catch (err: any) {
        if (err && err.code === "EADDRINUSE") {
          console.warn(`Port ${port} in use, trying ${port + 1}...`);
          port++;
          continue;
        }
        throw err;
      }
    }

    console.error(`Unable to bind to ports starting at ${startPort} after ${maxAttempts} attempts`);
    process.exit(1);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();