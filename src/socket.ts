import { Server as SocketIOServer, Socket } from "socket.io";
import { Types } from "mongoose";
import type { Server as HTTPServer } from "http";
import type jwt from "jsonwebtoken";
import { socketAuth } from "./middleware/socket-auth";
import { MessageModel } from "./models/message.model";
import { ConversationModel } from "./models/conversation.model";
import { ConnectionModel } from "./models/connection.model";
import { markOnline, markOffline } from "./services/presence.service";
import { UserModel } from "./models/user.model";

type AuthedSocket = Socket & { user?: jwt.JwtPayload | string };

let ioInstance: SocketIOServer | null = null;

export function initSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "http://10.0.2.2:3000",
        "http://localhost:3000",
        "http://localhost:3001",
      ],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  ioInstance = io;

  io.use(socketAuth);

  io.on("connection", async (socket: AuthedSocket) => {
    const userPayload = socket.user as { id?: string; _id?: string } | undefined;
    const userId = userPayload?.id || userPayload?._id;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const userRoom = userId.toString();
    socket.join(userRoom);

    try {
      const userDoc = await UserModel.findById(userRoom).select("uid");
      if (userDoc?.uid) {
        socket.join(userDoc.uid);
        console.log(`User ${userRoom} connected and joined rooms ${userRoom} and ${userDoc.uid}`);
      } else {
        console.log(`User ${userRoom} connected and joined room ${userRoom}`);
      }
    } catch (lookupErr) {
      console.log(`User ${userRoom} connected and joined room ${userRoom}`);
      console.error("Failed to look up uid for socket join", lookupErr);
    }

    if (markOnline(userRoom)) {
      broadcastPresence(userRoom, "online").catch((err) =>
        console.error("Failed to broadcast presence online", err)
      );
    }

    socket.on(
      "sendMessage",
      async (
        payload: { senderId?: string; receiverId?: string; text?: string; clientMessageId?: string },
        callback?: (response: unknown) => void
      ) => {
        const { senderId, receiverId, text, clientMessageId } = payload;
        const authUserId = userId.toString();

        if (!senderId || !receiverId || !text) {
          callback?.({ success: false, message: "Missing required fields" });
          return;
        }

        if (!Types.ObjectId.isValid(senderId) || !Types.ObjectId.isValid(receiverId)) {
          callback?.({ success: false, message: "Invalid sender or receiver id" });
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
            try {
              conversation = await ConversationModel.create({ members: memberIds });
            } catch (conversationError) {
              if ((conversationError as { code?: number }).code === 11000) {
                conversation = await ConversationModel.findOne({
                  "members.0": memberIds[0],
                  "members.1": memberIds[1],
                });
              } else {
                throw conversationError;
              }
            }
          }

          if (!conversation) {
            callback?.({ success: false, message: "Unable to open conversation" });
            return;
          }

          const message = await MessageModel.create({
            conversationId: conversation._id,
            sender: new Types.ObjectId(senderId),
            receiver: new Types.ObjectId(receiverId),
            text,
          });

          conversation.lastMessage = text;
          await conversation.save();

          const messagePayload = {
            id: message._id.toString(),
            conversationId: conversation._id.toString(),
            senderId: senderId.toString(),
            receiverId: receiverId.toString(),
            text: message.text,
            createdAt: message.createdAt,
            clientMessageId,
          };

          io.to(receiverId.toString()).emit("receiveMessage", messagePayload);
          io.to(senderId.toString()).emit("receiveMessage", messagePayload);
          callback?.({ success: true, message: messagePayload });
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
