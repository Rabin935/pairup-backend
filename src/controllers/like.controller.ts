import mongoose from "mongoose";
import { Request, Response } from "express";

import { LikeModel } from "../models/like.model";
import { MatchModel } from "../models/match.model";
import { ConversationModel } from "../models/conversation.model";
import { getIO } from "../socket";

type SenderPreview = {
  _id: mongoose.Types.ObjectId;
  firstname?: string;
  lastname?: string;
  profileImage?: string;
  image?: string;
  images?: { url?: string; isThumbnail?: boolean }[];
};

const getReceiverIdFromRequest = (req: Request): string | null => {
  const user = req.user as { _id?: string; mongoId?: string } | undefined;
  const receiverId = user?._id || user?.mongoId;
  if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
    return null;
  }
  return receiverId;
};

const normalizeMatchUsers = (userA: string, userB: string): [mongoose.Types.ObjectId, mongoose.Types.ObjectId] => {
  const [first, second] = [userA, userB].sort((a, b) => a.localeCompare(b));
  return [new mongoose.Types.ObjectId(first), new mongoose.Types.ObjectId(second)];
};

export class LikeController {
  listPendingLikes = async (req: Request, res: Response): Promise<void> => {
    try {
      const receiverId = getReceiverIdFromRequest(req);
      if (!receiverId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const pendingLikes = await LikeModel.find({
        receiver: receiverId,
        status: "pending",
      })
        .populate("sender", "firstname lastname profileImage image images")
        .sort({ createdAt: -1 })
        .exec();

      const likes = pendingLikes
        .map((like) => {
          const sender = like.sender as unknown as SenderPreview | null;
          if (!sender?._id) return null;

          const name = `${sender.firstname ?? ""} ${sender.lastname ?? ""}`.trim() || "PairUp user";
          const image =
            sender.profileImage ||
            sender.image ||
            sender.images?.find((img) => img.isThumbnail)?.url ||
            sender.images?.[0]?.url ||
            "";

          return {
            likeId: like._id.toString(),
            senderId: sender._id.toString(),
            name,
            image,
            createdAt: like.createdAt,
            status: like.status,
          };
        })
        .filter((like): like is NonNullable<typeof like> => Boolean(like));

      res.status(200).json({
        success: true,
        likes,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load pending likes",
        error: (error as Error).message,
      });
    }
  };

  acceptLike = async (req: Request, res: Response): Promise<void> => {
    try {
      const receiverId = getReceiverIdFromRequest(req);
      if (!receiverId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const { senderId } = req.params;
      if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
        res.status(400).json({ success: false, message: "Valid senderId is required" });
        return;
      }

      const like = await LikeModel.findOne({
        sender: senderId,
        receiver: receiverId,
        status: "pending",
      });

      if (!like) {
        res.status(404).json({ success: false, message: "Pending like not found" });
        return;
      }

      like.status = "accepted";
      await like.save();

      const [userA, userB] = normalizeMatchUsers(senderId, receiverId);

      let match = await MatchModel.findOne({
        "users.0": userA,
        "users.1": userB,
      });

      if (!match) {
        try {
          match = await MatchModel.create({ users: [userA, userB] });
        } catch (createError) {
          if ((createError as { code?: number }).code === 11000) {
            match = await MatchModel.findOne({
              "users.0": userA,
              "users.1": userB,
            });
          } else {
            throw createError;
          }
        }
      }

      let conversationId: string | null = (
        await ConversationModel.findOne({
          "members.0": userA,
          "members.1": userB,
        })
          .select("_id")
          .lean()
      )?._id?.toString() ?? null;

      if (!conversationId) {
        try {
          const createdConversation = await ConversationModel.create({ members: [userA, userB] });
          conversationId = createdConversation._id.toString();
        } catch (conversationError) {
          if ((conversationError as { code?: number }).code === 11000) {
            conversationId = (
              await ConversationModel.findOne({
                "members.0": userA,
                "members.1": userB,
              })
                .select("_id")
                .lean()
            )?._id?.toString() ?? null;
          } else {
            throw conversationError;
          }
        }
      }

      res.status(200).json({
        success: true,
        message: "Like accepted successfully",
        match,
        matchId: match?._id?.toString() ?? null,
        conversationId,
      });

      try {
        const io = getIO();
        const senderUserId = senderId.toString();
        const receiverUserId = receiverId.toString();
        const payload = {
          senderId: senderUserId,
          receiverId: receiverUserId,
          matchId: match?._id?.toString() ?? null,
          conversationId,
        };

        io.to(senderUserId).emit("like:accepted", payload);
        io.to(receiverUserId).emit("like:accepted", payload);
        io.to(senderUserId).emit("chat:match:created", payload);
        io.to(receiverUserId).emit("chat:match:created", payload);

        console.log("[like.accept] emitted chat match created", {
          rooms: [senderUserId, receiverUserId],
          payload,
        });
      } catch (notifyError) {
        console.error("Failed to emit like accepted notification", notifyError);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to accept like",
        error: (error as Error).message,
      });
    }
  };

  declineLike = async (req: Request, res: Response): Promise<void> => {
    try {
      const receiverId = getReceiverIdFromRequest(req);
      if (!receiverId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const { senderId } = req.params;
      if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
        res.status(400).json({ success: false, message: "Valid senderId is required" });
        return;
      }

      const like = await LikeModel.findOne({
        sender: senderId,
        receiver: receiverId,
        status: "pending",
      });

      if (!like) {
        res.status(404).json({ success: false, message: "Pending like not found" });
        return;
      }

      like.status = "declined";
      await like.save();

      res.status(200).json({
        success: true,
        message: "Like declined successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to decline like",
        error: (error as Error).message,
      });
    }
  };
}
