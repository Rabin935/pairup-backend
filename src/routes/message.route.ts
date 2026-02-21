import { Router } from "express";
import { MessageController } from "../controllers/message.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const messageController = new MessageController();

router.get(
  "/:conversationId",
  authorizedMiddleware,
  messageController.getMessages.bind(messageController)
);

router.post(
  "/",
  authorizedMiddleware,
  messageController.createMessage.bind(messageController)
);

export default router;
