import express from "express";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { isAdmin } from "../../middleware/admin/admin.middleware";
import { upload } from "../../middleware/multer";

import {
 createUser,
 getUsers,
 getUserById,
 updateUser,
 deleteUser
} from "../../controllers/admin/admin.controller";

const router = express.Router();

router.post("/users", authorizedMiddleware, isAdmin, upload.single("image"), createUser);

router.get("/users", authorizedMiddleware, isAdmin, getUsers);

router.get("/users/:id", authorizedMiddleware, isAdmin, getUserById);

router.put("/users/:id", authorizedMiddleware, isAdmin, upload.single("image"), updateUser);

router.delete("/users/:id", authorizedMiddleware, isAdmin, deleteUser);

export default router;
