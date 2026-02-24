import { Router } from "express";

import { SwipeController } from "../controllers/swipe.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const swipeController = new SwipeController();

router.post("/right", authorizedMiddleware, swipeController.swipeRight);
router.post("/", authorizedMiddleware, swipeController.createSwipe);

export default router;
