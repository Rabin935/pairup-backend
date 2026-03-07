import express from "express";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { isAdmin } from "../../middleware/admin/admin.middleware";
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
router.get("/stats", authorizedMiddleware, isAdmin, getAdminStats);
router.get("/metrics", authorizedMiddleware, isAdmin, getPlatformMetrics);
router.get("/analytics", authorizedMiddleware, isAdmin, getGrowthAnalytics);

router.get("/messages", authorizedMiddleware, isAdmin, getAdminMessages);
router.patch("/messages/:id/dismiss-flag", authorizedMiddleware, isAdmin, dismissMessageFlag);
router.delete("/messages/:id", authorizedMiddleware, isAdmin, deleteAdminMessage);

router.get("/reports", authorizedMiddleware, isAdmin, getReports);
router.patch("/reports/:id/review", authorizedMiddleware, isAdmin, reviewReport);
router.patch("/reports/:id/resolve", authorizedMiddleware, isAdmin, resolveReport);

router.get("/users", authorizedMiddleware, isAdmin, getUsers);
router.get("/users/:id", authorizedMiddleware, isAdmin, getUserById);
router.post(
  "/users",
  authorizedMiddleware,
  isAdmin,
  upload.single("image"),
  createUser
);
router.patch("/users/:id/ban", authorizedMiddleware, isAdmin, banUser);
router.patch("/users/:id/unban", authorizedMiddleware, isAdmin, unbanUser);
router.put(
  "/users/:id",
  authorizedMiddleware,
  isAdmin,
  upload.single("image"),
  updateUser
);
router.delete("/users/:id", authorizedMiddleware, isAdmin, deleteUser);

export default router;
