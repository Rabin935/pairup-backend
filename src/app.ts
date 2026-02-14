import express, { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.route";
import adminRoutes from "./routes/admin/admin.route";

export function createApp(): Application {
  const app: Application = express();

  app.use(
    cors({
      origin: [
        "http://10.0.2.2:3000", // Android Emulator
        "http://localhost:3001",
        "http://localhost:3000", // Flutter web
        "*", // Allow all (dev only)
      ],
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/auth", userRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/", adminRoutes);

  return app;
}
