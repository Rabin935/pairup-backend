import { Router } from "express";

import { LikeController } from "../controllers/like.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const likeController = new LikeController();

router.get("/pending", authorizedMiddleware, likeController.listPendingLikes);
router.post("/:senderId/accept", authorizedMiddleware, likeController.acceptLike);
router.post("/:senderId/decline", authorizedMiddleware, likeController.declineLike);

export default router;
