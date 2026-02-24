import { Router } from "express";
import { ConversationController } from "../controllers/conversation.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const conversationController = new ConversationController();

router.get("/", authorizedMiddleware, conversationController.list);
router.get("/:id/messages", authorizedMiddleware, conversationController.messages);
router.post("/", authorizedMiddleware, conversationController.start);

export default router;
