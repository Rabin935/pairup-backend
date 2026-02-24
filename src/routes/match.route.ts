import { Router } from "express";

import { MatchController } from "../controllers/match.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";

const router = Router();
const matchController = new MatchController();

router.get("/", authorizedMiddleware, matchController.getMyMatches);

export default router;
