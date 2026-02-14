import { createApp } from "./app";
import { connectDB } from "./database/mongodb";
import { PORT } from "./config";

const app = createApp();

async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();