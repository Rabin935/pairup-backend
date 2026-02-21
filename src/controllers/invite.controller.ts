import mongoose from "mongoose";
import { Request, Response } from "express";

import { InvitationModel } from "../models/invitation.model";
import { ConnectionModel } from "../models/connection.model";
import { UserModel } from "../models/user.model";
import { checkRateLimit } from "../utils/rate-limit";
import { getIO } from "../socket";
import { isOnline } from "../services/presence.service";

const INVITE_ACTION_LIMIT = 40;
const INVITE_WINDOW_MS = 60_000;

export class InviteController {
  acceptInvite = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Valid invitation id is required" });
        return;
      }

      const actorUid = req.user?.id;
      if (!actorUid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const rate = checkRateLimit(`invite-action:${actorUid}`, INVITE_ACTION_LIMIT, INVITE_WINDOW_MS);
      if (!rate.allowed) {
        res.status(429).json({ success: false, message: "Too many actions. Please slow down." });
        return;
      }

      const currentUser = await UserModel.findOne({ uid: actorUid }).select("_id uid firstname lastname");
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

      res.status(200).json({ success: true, invitation, connection: ensuredConnection });

      try {
        const io = getIO();
        const fromId = invitation.fromUser.toString();
        const toId = invitation.toUser.toString();

        io.to(fromId).emit("invite:accepted", {
          invitationId: invitation._id.toString(),
          fromUserId: fromId,
          toUserId: toId,
          connectionId: ensuredConnection._id.toString(),
        });

        const fromStatus = isOnline(fromId) ? "online" : "offline";
        const toStatus = isOnline(toId) ? "online" : "offline";

        io.to(fromId).emit("presence:update", { userId: toId, status: toStatus });
        io.to(toId).emit("presence:update", { userId: fromId, status: fromStatus });
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

      const actorUid = req.user?.id;
      if (!actorUid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const rate = checkRateLimit(`invite-action:${actorUid}`, INVITE_ACTION_LIMIT, INVITE_WINDOW_MS);
      if (!rate.allowed) {
        res.status(429).json({ success: false, message: "Too many actions. Please slow down." });
        return;
      }

      const currentUser = await UserModel.findOne({ uid: actorUid }).select("_id uid firstname lastname");
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
