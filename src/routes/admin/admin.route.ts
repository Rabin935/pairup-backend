import express from "express";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { isAdmin } from "../../middleware/admin/admin.middleware";
import { upload } from "../../middleware/multer";

import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../../controllers/admin/admin.controller";
import { AdminController } from "../../controllers/admin/admin.controller";

const router = express.Router();
const adminController = new AdminController();

// Admin login route (public)
router.post("/login", (req, res) => adminController.adminLogin(req, res));

// Admin routes (protected)
router.get("/users", authorizedMiddleware, getUsers);
router.get("/users/:id", authorizedMiddleware, getUserById);
router.post(
  "/users",
  authorizedMiddleware,
  isAdmin,
  upload.single("image"),
  createUser
);
router.put(
  "/users/:id",
  authorizedMiddleware,
  isAdmin,
  upload.single("image"),
  updateUser
);
router.delete("/users/:id", authorizedMiddleware, isAdmin, deleteUser);

export default router;
