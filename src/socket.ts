import { Server as SocketIOServer, Socket } from "socket.io";
import { Types } from "mongoose";
import type { Server as HTTPServer } from "http";
import type jwt from "jsonwebtoken";
import { socketAuth } from "./middleware/socket-auth";
import { MessageModel } from "./models/message.model";
import { ConversationModel } from "./models/conversation.model";

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

    socket.join(userId.toString());
    console.log(`User ${userId} connected and joined room ${userId}`);

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
      console.log(`User ${userId} disconnected`);
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
