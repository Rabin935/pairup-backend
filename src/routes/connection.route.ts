import { Router } from "express";
import { ConnectionController } from "../controllers/connection.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const connectionController = new ConnectionController();

router.get("/", authorizedMiddleware, connectionController.listConnections);

export default router;
