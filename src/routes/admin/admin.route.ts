import express from "express";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { adminOnly } from "../../middleware/admin/admin.middleware";
import { upload } from "../../middleware/multer";

import {
  adminLogin,
  getAdminStats,
  getPlatformMetrics,
  getGrowthAnalytics,
  getAdminMessages,
  dismissMessageFlag,
  deleteAdminMessage,
  createUser,
  getUsers,
  getUserById,
  updateUser,
  banUser,
  unbanUser,
  deleteUser,
  getReports,
  reviewReport,
  resolveReport,
} from "../../controllers/admin/admin.controller";

const router = express.Router();

// Admin login route (public)
router.post("/login", adminLogin);

// Admin routes (protected)
router.use(authorizedMiddleware, adminOnly);

router.get("/dashboard", getAdminStats);
router.get("/platform-metrics", getPlatformMetrics);
router.get("/analytics", getGrowthAnalytics);
router.get("/messages", getAdminMessages);
router.patch("/messages/:id/dismiss-flag", dismissMessageFlag);
router.delete("/messages/:id", deleteAdminMessage);

router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id/ban", banUser);
router.patch("/users/:id/unban", unbanUser);
router.post(
  "/users",
  upload.single("image"),
  createUser
);
router.put(
  "/users/:id",
  upload.single("image"),
  updateUser
);
router.delete("/users/:id", deleteUser);

router.get("/reports", getReports);
router.patch("/reports/:id/review", reviewReport);
router.patch("/reports/:id/resolve", resolveReport);

export default router;
