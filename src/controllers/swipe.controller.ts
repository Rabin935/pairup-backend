import mongoose from "mongoose";
import { Request, Response } from "express";

import { UserModel } from "../models/user.model";
import { InvitationModel } from "../models/invitation.model";
import { ConnectionModel } from "../models/connection.model";
import { checkRateLimit } from "../utils/rate-limit";
import { getIO } from "../socket";
import { sendEmail } from "../config/email";

export class SwipeController {
  createSwipe = async (req: Request, res: Response): Promise<void> => {
    try {
      const { swipedUserId, action } = req.body as {
        swipedUserId?: string;
        action?: "like" | "dislike";
      };

      if (!swipedUserId || !mongoose.Types.ObjectId.isValid(swipedUserId)) {
        res.status(400).json({ success: false, message: "Valid swipedUserId is required" });
        return;
      }

      if (!action || !["like", "dislike"].includes(action)) {
        res.status(400).json({ success: false, message: "Action must be 'like' or 'dislike'" });
        return;
      }

      const actorQuery = req.user?.id
        ? { uid: req.user.id }
        : req.user?.email
          ? { email: req.user.email }
          : null;

      if (!actorQuery) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const rateKey = "uid" in actorQuery ? actorQuery.uid : actorQuery.email;
      const swipeRate = checkRateLimit(`swipe:${rateKey}`, 40, 60_000);
      if (!swipeRate.allowed) {
        res
          .status(429)
          .json({ success: false, message: "Too many swipes. Please slow down." });
        return;
      }

      const [swiperUser, swipedUser] = await Promise.all([
        UserModel.findOne(actorQuery).select(
          "_id uid firstname lastname email profileImage profileImagePublicId image images age location"
        ),
        UserModel.findById(swipedUserId).select("_id uid firstname lastname email profileImage image images age location"),
      ]);

      if (!swiperUser) {
        res.status(404).json({ success: false, message: "Current user not found" });
        return;
      }

      if (!swipedUser) {
        res.status(404).json({ success: false, message: "Target user not found" });
        return;
      }

      if (swiperUser._id.equals(swipedUser._id)) {
        res.status(400).json({ success: false, message: "You cannot swipe on yourself" });
        return;
      }

      if (action === "dislike") {
        res.status(200).json({ success: true, message: "Swipe left ignored" });
        return;
      }

      const sortedIds = [swiperUser._id, swipedUser._id].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );

      const existingConnection = await ConnectionModel.findOne({
        userA: sortedIds[0],
        userB: sortedIds[1],
      });

      if (existingConnection) {
        res.status(200).json({ success: true, message: "Users are already connected" });
        return;
      }

      const pendingInvite = await InvitationModel.findOne({
        fromUser: swiperUser._id,
        toUser: swipedUser._id,
        status: "pending",
      });

      if (pendingInvite) {
        res.status(200).json({
          success: true,
          message: "Invitation already pending",
          invitation: pendingInvite,
        });
        return;
      }

      const invitation = await InvitationModel.create({
        fromUser: swiperUser._id,
        toUser: swipedUser._id,
        status: "pending",
      });

      const preview = {
        name: `${swiperUser.firstname} ${swiperUser.lastname}`.trim(),
        avatar:
          swiperUser.profileImage ||
          swiperUser.image ||
          swiperUser.images?.find((img) => img.isThumbnail)?.url ||
          swiperUser.images?.[0]?.url ||
          "",
        age: swiperUser.age,
        location: swiperUser.location,
      };

      res.status(201).json({ success: true, message: "Invitation created", invitation });

      try {
        const io = getIO();
        io.to(swipedUser._id.toString()).emit("invite:created", {
          invitationId: invitation._id.toString(),
          fromUserId: swiperUser._id.toString(),
          toUserId: swipedUser._id.toString(),
          preview,
          expiresAt: invitation.expiresAt,
        });
      } catch (notifyError) {
        console.error("Failed to emit invite:created", notifyError);
      }

      if (swipedUser.email) {
        const subject = "You have a new invite";
        const html = `<p>${preview.name} sent you an invite.</p>`;
        sendEmail(swipedUser.email, subject, html).catch((err) => {
          console.warn("Failed to send invite email", err.message);
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to record swipe",
        error: (error as Error).message,
      });
    }
  };
}
