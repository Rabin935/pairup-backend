import express from "express";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { isAdmin } from "../../middleware/admin.middleware";
import { upload } from "../../middleware/multer";

import {
 createUser
} from "../../controllers/admin/admin.controller";

const router = express.Router();

router.post("/users", authorizedMiddleware, isAdmin, upload.single("image"), createUser);

export default router;
