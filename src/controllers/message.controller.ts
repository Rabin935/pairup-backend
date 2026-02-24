import { Request, Response } from "express";
import { Types } from "mongoose";
import { MessageModel } from "../models/message.model";
import { ConversationModel } from "../models/conversation.model";
import { ReportModel } from "../models/report.model";
import { getIO } from "../socket";
import { CloudinaryService } from "../services/cloudinary.service";
import {
  buildModerationReportReason,
  moderateMessageText,
} from "../utils/message-moderation";

const getActorMongoId = (req: Request): string | null => {
  const actor = req.user?.mongoId || req.user?._id;
  if (!actor || typeof actor !== "string" || !Types.ObjectId.isValid(actor)) {
    return null;
  }
  return actor;
};

const mapMessagePayload = (message: {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  text: string;
  imageUrl?: string;
  flagged: boolean;
  createdAt: Date;
}) => ({
  id: message._id.toString(),
  conversationId: message.conversationId.toString(),
  senderId: message.sender.toString(),
  receiverId: message.receiver.toString(),
  body: message.text || "",
  imageUrl: message.imageUrl || "",
  flagged: message.flagged,
  createdAt: message.createdAt,
});

export class MessageController {
  async getMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const actorMongoId = getActorMongoId(req);

      if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ success: false, message: "Valid conversationId is required" });
        return;
      }

      if (!actorMongoId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const conversation = await ConversationModel.findById(conversationId)
        .select("members")
        .lean();

      if (!conversation) {
        res.status(404).json({ success: false, message: "Conversation not found" });
        return;
      }

      const actorInConversation = conversation.members.some(
        (memberId) => memberId.toString() === actorMongoId
      );

      if (!actorInConversation) {
        res.status(403).json({ success: false, message: "Not allowed to view this conversation" });
        return;
      }

      const messages = await MessageModel.find({
        conversationId: new Types.ObjectId(conversationId),
      })
        .sort({ createdAt: 1 })
        .select("_id conversationId sender receiver text imageUrl flagged createdAt")
        .lean();

      const formatted = messages.map((msg) => ({
        id: msg._id.toString(),
        conversationId: msg.conversationId.toString(),
        senderId: msg.sender.toString(),
        receiverId: msg.receiver.toString(),
        body: msg.text || "",
        imageUrl: msg.imageUrl || "",
        flagged: msg.flagged,
        createdAt: msg.createdAt,
      }));

      res.status(200).json({ success: true, messages: formatted });
    } catch (error) {
      console.error("Failed to fetch messages", error);
      res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
  }

  async createMessage(req: Request, res: Response) {
    try {
      const { conversationId, senderId, receiverId, text } = req.body as {
        conversationId?: string;
        senderId?: string;
        receiverId?: string;
        text?: string;
      };

      const actorMongoId = getActorMongoId(req);
      const normalizedText = typeof text === "string" ? text.trim() : "";
      const hasImage = Boolean(req.file);

      if (!conversationId || !senderId || !receiverId || (!normalizedText && !hasImage)) {
        res.status(400).json({
          success: false,
          message: "conversationId, senderId, receiverId, and text or image are required",
        });
        return;
      }

      if (
        !Types.ObjectId.isValid(conversationId) ||
        !Types.ObjectId.isValid(senderId) ||
        !Types.ObjectId.isValid(receiverId)
      ) {
        res.status(400).json({ success: false, message: "Invalid conversationId, senderId, or receiverId" });
        return;
      }

      if (!actorMongoId || actorMongoId !== senderId) {
        res.status(403).json({ success: false, message: "Sender mismatch" });
        return;
      }

      const senderObjectId = new Types.ObjectId(senderId);
      const receiverObjectId = new Types.ObjectId(receiverId);
      const conversation = await ConversationModel.findById(conversationId);

      if (!conversation) {
        res.status(404).json({ success: false, message: "Conversation not found" });
        return;
      }

      const members = conversation.members.map((memberId) => memberId.toString());
      if (!members.includes(senderObjectId.toString()) || !members.includes(receiverObjectId.toString())) {
        res.status(403).json({ success: false, message: "Users are not part of this conversation" });
        return;
      }

      let uploadedImage: { url: string; publicId: string } | null = null;
      if (req.file) {
        uploadedImage = await CloudinaryService.uploadImage(req.file, "pairup/messages");
      }

      const moderationResult = normalizedText
        ? moderateMessageText(normalizedText)
        : { flagged: false, matchedWords: [] as string[] };

      const message = await MessageModel.create({
        conversationId: new Types.ObjectId(conversationId),
        sender: senderObjectId,
        receiver: receiverObjectId,
        text: normalizedText,
        imageUrl: uploadedImage?.url ?? "",
        imagePublicId: uploadedImage?.publicId ?? "",
        flagged: moderationResult.flagged,
      });

      conversation.lastMessage = normalizedText || "Photo";
      await conversation.save();

      if (moderationResult.flagged && senderObjectId.toString() !== receiverObjectId.toString()) {
        await ReportModel.create({
          reporter: receiverObjectId,
          reportedUser: senderObjectId,
          reason: buildModerationReportReason(moderationResult.matchedWords),
          status: "pending",
        });

        try {
          const io = getIO();
          io.emit("admin:message-flagged", {
            messageId: message._id.toString(),
            senderId: senderObjectId.toString(),
            receiverId: receiverObjectId.toString(),
            matchedWords: moderationResult.matchedWords,
            createdAt: message.createdAt,
          });
        } catch {
          // Socket broadcast is optional and should not fail message creation.
        }
      }

      const messagePayload = mapMessagePayload({
        _id: message._id,
        conversationId: message.conversationId,
        sender: message.sender,
        receiver: message.receiver,
        text: message.text,
        imageUrl: message.imageUrl,
        flagged: message.flagged,
        createdAt: message.createdAt,
      });

      try {
        const io = getIO();
        io.to(receiverId).emit("receiveMessage", messagePayload);
        io.to(senderId).emit("receiveMessage", messagePayload);
      } catch {
        // Socket delivery is best effort.
      }

      res.status(201).json({
        success: true,
        message: messagePayload,
      });
    } catch (error) {
      console.error("Failed to create message", error);
      res.status(500).json({ success: false, message: "Failed to create message" });
    }
  }

  async deleteMessage(req: Request, res: Response) {
    try {
      const { messageId } = req.params;
      const actorMongoId = getActorMongoId(req);

      if (!messageId || !Types.ObjectId.isValid(messageId)) {
        res.status(400).json({ success: false, message: "Valid message id is required" });
        return;
      }

      if (!actorMongoId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const message = await MessageModel.findById(messageId).select(
        "_id conversationId sender receiver imagePublicId"
      );

      if (!message) {
        res.status(404).json({ success: false, message: "Message not found" });
        return;
      }

      if (message.sender.toString() !== actorMongoId) {
        res.status(403).json({ success: false, message: "You can delete only your own messages" });
        return;
      }

      const conversationId = message.conversationId.toString();
      const senderId = message.sender.toString();
      const receiverId = message.receiver.toString();
      const imagePublicId = message.imagePublicId || "";

      await message.deleteOne();

      if (imagePublicId) {
        await CloudinaryService.deleteImage(imagePublicId);
      }

      const latestMessage = await MessageModel.findOne({ conversationId: message.conversationId })
        .sort({ createdAt: -1 })
        .select("text imageUrl")
        .lean();

      await ConversationModel.findByIdAndUpdate(message.conversationId, {
        lastMessage:
          (latestMessage?.text || "").trim() ||
          (latestMessage?.imageUrl ? "Photo" : ""),
      });

      try {
        const io = getIO();
        const payload = { messageId, conversationId, senderId };
        io.to(senderId).emit("message:deleted", payload);
        io.to(receiverId).emit("message:deleted", payload);
      } catch {
        // Socket delivery is best effort.
      }

      res.status(200).json({
        success: true,
        message: "Message deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete message", error);
      res.status(500).json({ success: false, message: "Failed to delete message" });
    }
  }
}
