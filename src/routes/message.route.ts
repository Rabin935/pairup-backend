import { Router } from "express";
import { MessageController } from "../controllers/message.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";
import { upload } from "../middleware/multer";

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
  upload.single("image"),
  messageController.createMessage.bind(messageController)
);

router.delete(
  "/:messageId",
  authorizedMiddleware,
  messageController.deleteMessage.bind(messageController)
);

export default router;
