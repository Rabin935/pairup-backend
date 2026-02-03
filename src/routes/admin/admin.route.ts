import express from "express";
import { protect } from "../../middleware/authorized.middleware";
import { isAdmin } from "../../middleware/admin.middleware";
import { upload } from "../../middleware/multer";

import {
 createUser,
 getUsers,
 getUserById,
 updateUser,
 deleteUser
} from "../../controllers/admin/admin.controller";

const router = express.Router();

router.post("/users", protect, isAdmin, upload.single("image"), createUser);

router.get("/users", protect, isAdmin, getUsers);

router.get("/users/:id", protect, isAdmin, getUserById);

router.put("/users/:id", protect, isAdmin, upload.single("image"), updateUser);

router.delete("/users/:id", protect, isAdmin, deleteUser);

export default router;
