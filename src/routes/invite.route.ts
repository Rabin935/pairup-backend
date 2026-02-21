import { Router } from "express";
import { InviteController } from "../controllers/invite.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const inviteController = new InviteController();

router.post("/:id/accept", authorizedMiddleware, inviteController.acceptInvite);
router.post("/:id/reject", authorizedMiddleware, inviteController.rejectInvite);

export default router;
