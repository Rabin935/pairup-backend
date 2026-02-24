import { Request, Response } from "express";
import { Types } from "mongoose";
import { MessageModel } from "../models/message.model";
import { ConversationModel } from "../models/conversation.model";

export class MessageController {
  async getMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;

      if (!conversationId) {
        res.status(400).json({ success: false, message: "conversationId is required" });
        return;
      }

      const messages = await MessageModel.find({
        conversationId: new Types.ObjectId(conversationId),
      })
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
      console.error("Failed to fetch messages", error);
      res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
  }

  async createMessage(req: Request, res: Response) {
    try {
      const { conversationId, senderId, receiverId, text } = req.body;

      if (!conversationId || !senderId || !receiverId || !text) {
        res.status(400).json({ success: false, message: "conversationId, senderId, receiverId, and text are required" });
        return;
      }

      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        res.status(404).json({ success: false, message: "Conversation not found" });
        return;
      }

      const message = await MessageModel.create({
        conversationId: new Types.ObjectId(conversationId),
        sender: new Types.ObjectId(senderId),
        receiver: new Types.ObjectId(receiverId),
        text,
      });

      conversation.lastMessage = text;
      await conversation.save();

      res.status(201).json({
        success: true,
        message: {
          id: message._id.toString(),
          conversationId: message.conversationId.toString(),
          senderId: message.sender.toString(),
          body: message.text,
          createdAt: message.createdAt,
        },
      });
    } catch (error) {
      console.error("Failed to create message", error);
      res.status(500).json({ success: false, message: "Failed to create message" });
    }
  }
}
