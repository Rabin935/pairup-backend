import { Server as SocketIOServer, Socket } from "socket.io";
import { Types } from "mongoose";
import type { Server as HTTPServer } from "http";
import type jwt from "jsonwebtoken";
import { socketAuth } from "./middleware/socket-auth";
import { MessageModel } from "./models/message.model";
import { ConversationModel } from "./models/conversation.model";
import { ConnectionModel } from "./models/connection.model";
import { ReportModel } from "./models/report.model";
import { markOnline, markOffline } from "./services/presence.service";
import { UserModel } from "./models/user.model";
import {
  buildModerationReportReason,
  moderateMessageText,
} from "./utils/message-moderation";

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

    socket.on("joinConversation", (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !Types.ObjectId.isValid(conversationId)) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("leaveConversation", (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !Types.ObjectId.isValid(conversationId)) return;
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on(
      "typing:start",
      (payload: { conversationId?: string; receiverId?: string }) => {
        const conversationId = payload?.conversationId;
        const receiverId = payload?.receiverId;

        if (!conversationId || !Types.ObjectId.isValid(conversationId)) return;
        if (!receiverId || !Types.ObjectId.isValid(receiverId)) return;
        if (receiverId === userRoom) return;

        io.to(receiverId).emit("typing:start", {
          conversationId,
          userId: userRoom,
        });
      }
    );

    socket.on(
      "typing:stop",
      (payload: { conversationId?: string; receiverId?: string }) => {
        const conversationId = payload?.conversationId;
        const receiverId = payload?.receiverId;

        if (!conversationId || !Types.ObjectId.isValid(conversationId)) return;
        if (!receiverId || !Types.ObjectId.isValid(receiverId)) return;
        if (receiverId === userRoom) return;

        io.to(receiverId).emit("typing:stop", {
          conversationId,
          userId: userRoom,
        });
      }
    );

    socket.on(
      "sendMessage",
      async (
        payload: { senderId?: string; receiverId?: string; text?: string; clientMessageId?: string },
        callback?: (response: unknown) => void
      ) => {
        const { senderId, receiverId, text, clientMessageId } = payload;
        const authUserId = userId.toString();
        const normalizedText = typeof text === "string" ? text.trim() : "";

        if (!senderId || !receiverId || !normalizedText) {
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

          const moderationResult = moderateMessageText(normalizedText);
          const message = await MessageModel.create({
            conversationId: conversation._id,
            sender: new Types.ObjectId(senderId),
            receiver: new Types.ObjectId(receiverId),
            text: normalizedText,
            flagged: moderationResult.flagged,
          });

          conversation.lastMessage = normalizedText;
          await conversation.save();

          if (moderationResult.flagged && senderId.toString() !== receiverId.toString()) {
            await ReportModel.create({
              reporter: new Types.ObjectId(receiverId),
              reportedUser: new Types.ObjectId(senderId),
              reason: buildModerationReportReason(moderationResult.matchedWords),
              status: "pending",
            });

            io.emit("admin:message-flagged", {
              messageId: message._id.toString(),
              senderId: senderId.toString(),
              receiverId: receiverId.toString(),
              matchedWords: moderationResult.matchedWords,
              createdAt: message.createdAt,
            });
          }

          const messagePayload = {
            id: message._id.toString(),
            conversationId: conversation._id.toString(),
            senderId: senderId.toString(),
            receiverId: receiverId.toString(),
            body: message.text,
            text: message.text,
            imageUrl: message.imageUrl || "",
            flagged: message.flagged,
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

    socket.on("disconnect", async () => {
      const wentOffline = markOffline(userRoom);
      if (wentOffline) {
        const lastSeen = new Date();

        try {
          await UserModel.findByIdAndUpdate(userRoom, { lastSeen });
        } catch (error) {
          console.error("Failed to update lastSeen", error);
        }

        broadcastPresence(userRoom, "offline", lastSeen.toISOString()).catch((err) =>
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

async function broadcastPresence(
  userId: string,
  status: "online" | "offline",
  lastSeen?: string
) {
  const io = getIO();
  const user = await UserModel.findById(userId).select("onlineVisibility").lean();
  const visibleStatus =
    status === "online" && user?.onlineVisibility === false ? "offline" : status;
  const connections = await ConnectionModel.find({
    $or: [{ userA: userId }, { userB: userId }],
  }).select("userA userB");

  const peerIds = connections.map((conn) =>
    conn.userA.toString() === userId ? conn.userB.toString() : conn.userA.toString()
  );

  const payload = { userId, status: visibleStatus, ...(lastSeen ? { lastSeen } : {}) };

  peerIds.forEach((peerId) => {
    io.to(peerId).emit("presence:update", payload);
  });

  io.to(userId).emit("presence:update", payload);
}
