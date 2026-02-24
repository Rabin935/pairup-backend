import mongoose from "mongoose";
import { Request, Response } from "express";

import { MatchModel } from "../models/match.model";
import { isOnline } from "../services/presence.service";

type MatchUser = {
  _id: mongoose.Types.ObjectId;
  firstname?: string;
  lastname?: string;
  profileImage?: string;
  image?: string;
  images?: { url?: string; isThumbnail?: boolean }[];
};

const pickProfileImage = (user: MatchUser): string =>
  user.profileImage ||
  user.image ||
  user.images?.find((img) => img.isThumbnail)?.url ||
  user.images?.[0]?.url ||
  "";

export class MatchController {
  getMyMatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?._id || req.user?.mongoId;
      if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const currentObjectId = new mongoose.Types.ObjectId(currentUserId);

      const matchDocs = await MatchModel.find({
        users: { $in: [currentObjectId] },
      })
        .select("users createdAt")
        .populate("users", "firstname lastname profileImage image images")
        .sort({ createdAt: -1 })
        .lean();

      const seen = new Set<string>();
      const matches = matchDocs
        .map((match) => {
          const users = (match.users as unknown as MatchUser[] | undefined) ?? [];
          const otherUser = users.find((user) => user?._id?.toString() !== currentUserId);
          if (!otherUser?._id) return null;

          const otherUserId = otherUser._id.toString();
          if (seen.has(otherUserId)) return null;
          seen.add(otherUserId);

          const name =
            `${otherUser.firstname ?? ""} ${otherUser.lastname ?? ""}`.trim() || "PairUp user";

          return {
            _id: otherUserId,
            name,
            profileImage: pickProfileImage(otherUser),
            isOnline: isOnline(otherUserId),
          };
        })
        .filter((user): user is NonNullable<typeof user> => Boolean(user));

      console.log("[matches.getMyMatches]", {
        currentUserId,
        totalMatchDocs: matchDocs.length,
        returnedUsers: matches.length,
      });

      res.status(200).json({
        success: true,
        matches,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load matches",
        error: (error as Error).message,
      });
    }
  };
}
