import { Router } from "express";
import { InviteController } from "../controllers/invite.controller";
import { SwipeController } from "../controllers/swipe.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const inviteController = new InviteController();
const swipeController = new SwipeController();

router.get("/pending", authorizedMiddleware, inviteController.listPending);

router.post("/", authorizedMiddleware, (req, res) => {
	if (!req.body.action) {
		req.body.action = "like";
	}
	return swipeController.createSwipe(req, res);
});

router.post("/:id/accept", authorizedMiddleware, inviteController.acceptInvite);
router.post("/:id/reject", authorizedMiddleware, inviteController.rejectInvite);

export default router;
