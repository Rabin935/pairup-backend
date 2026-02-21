import { Server as SocketIOServer, Socket } from "socket.io";
import { Types } from "mongoose";
import type { Server as HTTPServer } from "http";
import type jwt from "jsonwebtoken";
import { socketAuth } from "./middleware/socket-auth";
import { MessageModel } from "./models/message.model";
import { ConversationModel } from "./models/conversation.model";
import { ConnectionModel } from "./models/connection.model";
import { markOnline, markOffline } from "./services/presence.service";

type AuthedSocket = Socket & { user?: jwt.JwtPayload | string };

let ioInstance: SocketIOServer | null = null;

export function initSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  ioInstance = io;

  io.use(socketAuth);

  io.on("connection", (socket: AuthedSocket) => {
    const userPayload = socket.user as { id?: string; _id?: string } | undefined;
    const userId = userPayload?.id || userPayload?._id;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const userRoom = userId.toString();
    socket.join(userRoom);
    console.log(`User ${userRoom} connected and joined room ${userRoom}`);

    if (markOnline(userRoom)) {
      broadcastPresence(userRoom, "online").catch((err) =>
        console.error("Failed to broadcast presence online", err)
      );
    }

    socket.on(
      "sendMessage",
      async (
        payload: { senderId?: string; receiverId?: string; text?: string },
        callback?: (response: unknown) => void
      ) => {
        const { senderId, receiverId, text } = payload;
        const authUserId = userId.toString();

        if (!senderId || !receiverId || !text) {
          callback?.({ success: false, message: "Missing required fields" });
          return;
        }

        if (senderId !== authUserId) {
          callback?.({ success: false, message: "Sender mismatch" });
          return;
        }

        try {
          const memberIds = [senderId, receiverId]
            .map((id) => new Types.ObjectId(id))
            .sort((a, b) => a.toString().localeCompare(b.toString()));

          let conversation = await ConversationModel.findOne({
            members: { $all: memberIds },
          });

          if (!conversation) {
            conversation = await ConversationModel.create({ members: memberIds });
          }

          const message = await MessageModel.create({
            conversationId: conversation._id,
            sender: new Types.ObjectId(senderId),
            receiver: new Types.ObjectId(receiverId),
            text,
          });

          conversation.lastMessage = text;
          await conversation.save();

          io.to(receiverId.toString()).emit("receiveMessage", message);
          callback?.({ success: true, message });
        } catch (error) {
          console.error("Failed to send message", error);
          callback?.({ success: false, message: "Failed to send message" });
        }
      }
    );

    socket.on("disconnect", () => {
      const wentOffline = markOffline(userRoom);
      if (wentOffline) {
        broadcastPresence(userRoom, "offline").catch((err) =>
          console.error("Failed to broadcast presence offline", err)
        );
      }
      console.log(`User ${userRoom} disconnected`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized");
  }
  return ioInstance;
}

async function broadcastPresence(userId: string, status: "online" | "offline") {
  const io = getIO();
  const connections = await ConnectionModel.find({
    $or: [{ userA: userId }, { userB: userId }],
  }).select("userA userB");

  const peerIds = connections.map((conn) =>
    conn.userA.toString() === userId ? conn.userB.toString() : conn.userA.toString()
  );

  peerIds.forEach((peerId) => {
    io.to(peerId).emit("presence:update", { userId, status });
  });

  io.to(userId).emit("presence:update", { userId, status });
}
