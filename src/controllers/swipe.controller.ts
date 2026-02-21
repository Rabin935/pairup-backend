import mongoose from "mongoose";
import { Request, Response } from "express";

import { SwipeModel } from "../models/swipe.model";
import { UserModel } from "../models/user.model";
import { getIO } from "../socket";

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

      const [swiperUser, swipedUser] = await Promise.all([
        UserModel.findOne(actorQuery).select("_id"),
        UserModel.findById(swipedUserId).select("_id"),
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

      const existingSwipe = await SwipeModel.findOne({
        swiper: swiperUser._id,
        swipedUser: swipedUser._id,
      });

      if (existingSwipe) {
        if (existingSwipe.action === action) {
          res.status(200).json({ success: true, message: "Swipe already recorded" });
          return;
        }

        existingSwipe.action = action;
        await existingSwipe.save();

        res.status(200).json({ success: true, message: "Swipe preference updated" });

        if (action === "like") {
          try {
            const io = getIO();
            io.to(swipedUser._id.toString()).emit("matchRequest", {
              fromUserId: swiperUser._id.toString(),
              toUserId: swipedUser._id.toString(),
              action,
              type: "swipe", // for frontend filtering
            });
          } catch (notifyError) {
            console.error("Failed to emit match request", notifyError);
          }
        }
        return;
      }

      await SwipeModel.create({
        swiper: swiperUser._id,
        swipedUser: swipedUser._id,
        action,
      });

      res.status(201).json({ success: true, message: "Swipe saved" });

      if (action === "like") {
        try {
          const io = getIO();
          io.to(swipedUser._id.toString()).emit("matchRequest", {
            fromUserId: swiperUser._id.toString(),
            toUserId: swipedUser._id.toString(),
            action,
            type: "swipe", // for frontend filtering
          });
        } catch (notifyError) {
          console.error("Failed to emit match request", notifyError);
        }
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
