import { Request, Response } from "express";

import { ConnectionModel } from "../models/connection.model";
import { IUser, UserModel } from "../models/user.model";
import { isOnline } from "../services/presence.service";

export class ConnectionController {
  listConnections = async (req: Request, res: Response): Promise<void> => {
    try {
      const actorUid = req.user?.id;
      if (!actorUid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const currentUser = await UserModel.findOne({ uid: actorUid }).select(
        "_id uid firstname lastname profileImage image images age location"
      );

      if (!currentUser) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const connections = await ConnectionModel.find({
        $or: [{ userA: currentUser._id }, { userB: currentUser._id }],
      })
        .populate<{ userA: IUser; userB: IUser }>([
          { path: "userA", select: "uid firstname lastname profileImage image images age location" },
          { path: "userB", select: "uid firstname lastname profileImage image images age location" },
        ])
        .exec();

      const formatted = connections.map((conn) => {
        const otherUser = conn.userA._id.equals(currentUser._id) ? conn.userB : conn.userA;
        const avatar =
          otherUser.profileImage ||
          otherUser.image ||
          otherUser.images?.find((img) => img.isThumbnail)?.url ||
          otherUser.images?.[0]?.url ||
          "";

        return {
          connectionId: conn._id.toString(),
          user: {
            id: otherUser._id.toString(),
            uid: otherUser.uid,
            firstname: otherUser.firstname,
            lastname: otherUser.lastname,
            age: otherUser.age,
            location: otherUser.location,
            avatar,
          },
          status: isOnline(otherUser._id.toString()) ? "online" : "offline",
        };
      });

      res.status(200).json({ success: true, connections: formatted });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load connections",
        error: (error as Error).message,
      });
    }
  };
}
