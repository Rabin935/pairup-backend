import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import multer from "multer";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.route";
import adminRoutes from "./routes/admin/admin.route";
import swipeRoutes from "./routes/swipe.route";
import messageRoutes from "./routes/message.route";
import inviteRoutes from "./routes/invite.route";
import connectionRoutes from "./routes/connection.route";
import conversationRoutes from "./routes/conversation.route";
import likeRoutes from "./routes/like.route";
import matchRoutes from "./routes/match.route";

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
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/swipes", swipeRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/invites", inviteRoutes);
  app.use("/api/likes", likeRoutes);
  app.use("/api/matches", matchRoutes);
  app.use("/api/connections", connectionRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/admin", adminRoutes);

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5MB or smaller"
          : err.message;
      res.status(400).json({ success: false, message });
      return;
    }

    if (err instanceof Error && err.message === "Unsupported file type. Please upload a valid image.") {
      res.status(400).json({ success: false, message: err.message });
      return;
    }

    next(err);
  });

  return app;
}
