import mongoose from "mongoose";
import { Request, Response } from "express";

import { InvitationModel } from "../models/invitation.model";
import { ConnectionModel } from "../models/connection.model";
import { MatchModel } from "../models/match.model";
import { ConversationModel } from "../models/conversation.model";
import { UserModel } from "../models/user.model";
import { checkRateLimit } from "../utils/rate-limit";
import { getIO } from "../socket";
import { isOnline } from "../services/presence.service";

const INVITE_ACTION_LIMIT = 40;
const INVITE_WINDOW_MS = 60_000;

const getActorMongoId = (req: Request): string | null => {
  const actorId = req.user?._id || req.user?.mongoId;
  if (!actorId || !mongoose.Types.ObjectId.isValid(actorId)) return null;
  return actorId;
};

export class InviteController {
  listPending = async (req: Request, res: Response): Promise<void> => {
    try {
      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const currentUser = await UserModel.findById(actorUserId).select("_id uid");
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const invites = await InvitationModel.find({
        toUser: currentUser._id,
        status: "pending",
      })
        .populate("fromUser", "uid firstname lastname profileImage image images age location")
        .sort({ createdAt: -1 })
        .exec();

      const formatted = invites.map((invite) => {
        const fromUser = invite.fromUser as unknown as {
          _id: mongoose.Types.ObjectId;
          uid?: string;
          firstname?: string;
          lastname?: string;
          profileImage?: string;
          image?: string;
          images?: { url?: string; isThumbnail?: boolean }[];
          age?: number;
          location?: string;
        };

        const avatar =
          fromUser.profileImage ||
          fromUser.image ||
          fromUser.images?.find((img) => img.isThumbnail)?.url ||
          fromUser.images?.[0]?.url ||
          "";

        return {
          invitationId: invite._id.toString(),
          fromUserId: fromUser._id.toString(),
          status: invite.status,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          preview: {
            name: `${fromUser.firstname ?? ""} ${fromUser.lastname ?? ""}`.trim(),
            avatar,
            age: fromUser.age,
            location: fromUser.location,
          },
        };
      });

      res.status(200).json({ success: true, invitations: formatted });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load invites",
        error: (error as Error).message,
      });
    }
  };

  acceptInvite = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Valid invitation id is required" });
        return;
      }

      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const rate = checkRateLimit(`invite-action:${actorUserId}`, INVITE_ACTION_LIMIT, INVITE_WINDOW_MS);
      if (!rate.allowed) {
        res.status(429).json({ success: false, message: "Too many actions. Please slow down." });
        return;
      }

      const currentUser = await UserModel.findById(actorUserId).select("_id uid firstname lastname");
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const invitation = await InvitationModel.findById(id);
      if (!invitation || invitation.status !== "pending") {
        res.status(404).json({ success: false, message: "Invitation not found or already handled" });
        return;
      }

      if (!invitation.toUser.equals(currentUser._id)) {
        res.status(403).json({ success: false, message: "You are not allowed to act on this invitation" });
        return;
      }

      invitation.status = "accepted";
      await invitation.save();

      const participants = [invitation.fromUser, invitation.toUser].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );

      const existingConnection = await ConnectionModel.findOne({
        userA: participants[0],
        userB: participants[1],
      });

      const ensuredConnection =
        existingConnection || (await ConnectionModel.create({ userA: participants[0], userB: participants[1] }));

      let ensuredMatch = await MatchModel.findOne({
        "users.0": participants[0],
        "users.1": participants[1],
      });

      if (!ensuredMatch) {
        try {
          ensuredMatch = await MatchModel.create({ users: [participants[0], participants[1]] });
        } catch (matchError) {
          if ((matchError as { code?: number }).code === 11000) {
            ensuredMatch = await MatchModel.findOne({
              "users.0": participants[0],
              "users.1": participants[1],
            });
          } else {
            throw matchError;
          }
        }
      }

      let conversationId: string | null = (
        await ConversationModel.findOne({
          "members.0": participants[0],
          "members.1": participants[1],
        })
          .select("_id")
          .lean()
      )?._id?.toString() ?? null;

      if (!conversationId) {
        try {
          const createdConversation = await ConversationModel.create({
            members: [participants[0], participants[1]],
          });
          conversationId = createdConversation._id.toString();
        } catch (conversationError) {
          if ((conversationError as { code?: number }).code === 11000) {
            conversationId = (
              await ConversationModel.findOne({
                "members.0": participants[0],
                "members.1": participants[1],
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
        invitation,
        connection: ensuredConnection,
        match: ensuredMatch,
        matchId: ensuredMatch?._id?.toString() ?? null,
        conversationId,
      });

      try {
        const io = getIO();
        const senderId = invitation.fromUser.toString();
        const receiverId = invitation.toUser.toString();
        const acceptedPayload = {
          invitationId: invitation._id.toString(),
          senderId,
          receiverId,
          connectionId: ensuredConnection._id.toString(),
          matchId: ensuredMatch?._id?.toString() ?? null,
          conversationId,
        };

        io.to(senderId).emit("invite:accepted", acceptedPayload);
        io.to(receiverId).emit("invite:accepted", acceptedPayload);

        io.to(senderId).emit("chat:match:created", acceptedPayload);
        io.to(receiverId).emit("chat:match:created", acceptedPayload);

        console.log("[invite.accept] emitted chat match created", {
          rooms: [senderId, receiverId],
          payload: acceptedPayload,
        });

        const fromStatus = isOnline(senderId) ? "online" : "offline";
        const toStatus = isOnline(receiverId) ? "online" : "offline";

        io.to(senderId).emit("presence:update", { userId: receiverId, status: toStatus });
        io.to(receiverId).emit("presence:update", { userId: senderId, status: fromStatus });
      } catch (notifyError) {
        console.error("Failed to emit accept notifications", notifyError);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to accept invitation",
        error: (error as Error).message,
      });
    }
  };

  rejectInvite = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Valid invitation id is required" });
        return;
      }

      const actorUserId = getActorMongoId(req);
      if (!actorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const rate = checkRateLimit(`invite-action:${actorUserId}`, INVITE_ACTION_LIMIT, INVITE_WINDOW_MS);
      if (!rate.allowed) {
        res.status(429).json({ success: false, message: "Too many actions. Please slow down." });
        return;
      }

      const currentUser = await UserModel.findById(actorUserId).select("_id uid firstname lastname");
      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const invitation = await InvitationModel.findById(id);
      if (!invitation || invitation.status !== "pending") {
        res.status(404).json({ success: false, message: "Invitation not found or already handled" });
        return;
      }

      if (!invitation.toUser.equals(currentUser._id)) {
        res.status(403).json({ success: false, message: "You are not allowed to act on this invitation" });
        return;
      }

      invitation.status = "rejected";
      await invitation.save();

      res.status(200).json({ success: true, invitation });

      try {
        const io = getIO();
        io.to(invitation.fromUser.toString()).emit("invite:rejected", {
          invitationId: invitation._id.toString(),
          fromUserId: invitation.fromUser.toString(),
          toUserId: invitation.toUser.toString(),
        });
      } catch (notifyError) {
        console.error("Failed to emit reject notification", notifyError);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to reject invitation",
        error: (error as Error).message,
      });
    }
  };
}
