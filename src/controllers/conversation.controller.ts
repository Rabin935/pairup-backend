import { Request, Response } from "express";
import mongoose from "mongoose";
import { ConversationModel } from "../models/conversation.model";
import { MessageModel } from "../models/message.model";
import { UserModel } from "../models/user.model";
import { isOnline } from "../services/presence.service";

function pickAvatar(user: any): string {
  return (
    user?.profileImage ||
    user?.image ||
    user?.images?.find((img: any) => img?.isThumbnail)?.url ||
    user?.images?.[0]?.url ||
    ""
  );
}

const getActorMongoId = (req: Request): string | null => {
  const actorId = req.user?._id || req.user?.mongoId;
  if (!actorId || !mongoose.Types.ObjectId.isValid(actorId)) return null;
  return actorId;
};

export class ConversationController {
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const currentUser = await UserModel.findById(actorUserId).select("_id uid firstname lastname");
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const conversations = await ConversationModel.find({ members: currentUser._id })
        .sort({ updatedAt: -1 })
        .lean();

      const memberIds = Array.from(
        new Set(
          conversations.flatMap((c) =>
            c.members.map((m) => m.toString())
          )
        )
      );

      const memberDocs = await UserModel.find({ _id: { $in: memberIds } })
        .select("_id uid firstname lastname profileImage image images age location")
        .lean();

      const memberMap = new Map(memberDocs.map((u) => [u._id.toString(), u]));

      const results = await Promise.all(
        conversations.map(async (conv) => {
          const lastMessage = await MessageModel.findOne({ conversationId: conv._id })
            .sort({ createdAt: -1 })
            .select("text sender createdAt")
            .lean();

          const unreadCount = await MessageModel.countDocuments({
            conversationId: conv._id,
            receiver: currentUser._id,
            read: false,
          });

          const participants = conv.members
            .map((memberId) => memberMap.get(memberId.toString()))
            .filter(Boolean)
            .map((user: any) => {
              const online = isOnline(user._id.toString());
              const avatar = pickAvatar(user);
              return {
                id: user._id.toString(),
                _id: user._id.toString(),
                uid: user.uid,
                firstname: user.firstname,
                lastname: user.lastname,
                name: `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || "PairUp user",
                age: user.age,
                location: user.location,
                avatar,
                profileImage: avatar,
                isOnline: online,
                status: online ? "online" : "offline",
              };
            });

          return {
            id: conv._id.toString(),
            lastMessage: lastMessage?.text || "",
            lastMessageAt: lastMessage?.createdAt || conv.updatedAt,
            updatedAt: conv.updatedAt,
            unreadCount,
            participants,
          };
        })
      );

      console.log("[conversations.list]", {
        currentUserId: currentUser._id.toString(),
        conversationCount: conversations.length,
      });

      res.status(200).json({ success: true, conversations: results });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load conversations",
        error: (error as Error).message,
      });
    }
  };

  messages = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Valid conversation id is required" });
        return;
      }

      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const currentUser = await UserModel.findById(actorUserId).select("_id");
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const conversation = await ConversationModel.findById(id);
      if (!conversation || !conversation.members.some((m) => m.equals(currentUser._id))) {
        res.status(404).json({ success: false, message: "Conversation not found" });
        return;
      }

      const messages = await MessageModel.find({ conversationId: id })
        .sort({ createdAt: 1 })
        .select("_id conversationId sender receiver text createdAt")
        .lean();

      const formatted = messages.map((msg) => ({
        id: msg._id.toString(),
        conversationId: msg.conversationId.toString(),
        senderId: msg.sender.toString(),
        body: msg.text,
        createdAt: msg.createdAt,
      }));

      res.status(200).json({ success: true, messages: formatted });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load messages",
        error: (error as Error).message,
      });
    }
  };

  start = async (req: Request, res: Response): Promise<void> => {
    try {
      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const { participantId } = req.body as { participantId?: string };
      if (!participantId || !mongoose.Types.ObjectId.isValid(participantId)) {
        res.status(400).json({ success: false, message: "Valid participantId is required" });
        return;
      }

      const [currentUser, otherUser] = await Promise.all([
        UserModel.findById(actorUserId).select("_id"),
        UserModel.findById(participantId).select("_id"),
      ]);

      if (!currentUser || !otherUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      if (currentUser._id.equals(otherUser._id)) {
        res.status(400).json({ success: false, message: "Cannot start conversation with yourself" });
        return;
      }

      const memberIds = [currentUser._id, otherUser._id].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );

      const existing = await ConversationModel.findOne({
        members: { $all: memberIds },
      });

      if (existing) {
        res.status(200).json({ success: true, conversationId: existing._id.toString() });
        return;
      }

      const conversation = await ConversationModel.create({ members: memberIds });
      res.status(201).json({ success: true, conversationId: conversation._id.toString() });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to start conversation",
        error: (error as Error).message,
      });
    }
  };
}
