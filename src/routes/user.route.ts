import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";
import { upload } from "../middleware/multer";


const router = Router();
const userController = new UserController();

router.get("/", authorizedMiddleware, userController.getAllUsers);
router.get("/discover", authorizedMiddleware, userController.discoverUsers);
router.get("/me", authorizedMiddleware, userController.getCurrentUser);
router.get("/me/stats", authorizedMiddleware, userController.getMyStats);
router.get(
	"/me/post-like-notifications",
	authorizedMiddleware,
	userController.getMyPostLikeNotifications
);
router.get("/profile/:userId", authorizedMiddleware, userController.getPublicUserProfile);
router.post("/report/:userId", authorizedMiddleware, userController.reportUser);
router.post(
	"/:userId/images/:imageId/like",
	authorizedMiddleware,
	userController.toggleUserImageLike
);
router.delete("/images/:imageId", authorizedMiddleware, userController.deleteUserImage);
router.get("/me/settings", authorizedMiddleware, userController.getMySettings);
router.patch("/settings/visibility", authorizedMiddleware, userController.updateOnlineVisibility);
router.patch("/settings/notifications", authorizedMiddleware, userController.updateNotificationPreferences);
router.patch("/settings/privacy", authorizedMiddleware, userController.updatePrivacySettings);
router.patch("/settings/password", authorizedMiddleware, userController.changePassword);
router.get("/blocks", authorizedMiddleware, userController.getBlockedUsers);
router.post("/block/:userId", authorizedMiddleware, userController.blockUser);
router.delete("/block/:userId", authorizedMiddleware, userController.unblockUser);
router.delete("/me", authorizedMiddleware, userController.deleteMyAccount);
router.put(
	"/update-profile",
	authorizedMiddleware,
	upload.single("profileImage"),
	userController.updateProfile
);

router.post(
	"/upload-images",
	authorizedMiddleware,
	upload.array("images", 6),
	userController.uploadUserImages
);

router.patch(
	"/set-thumbnail/:imageId",
	authorizedMiddleware,
	userController.setThumbnailImage
);

router.get("/users/:uid", userController.getUser);
router.put("/users/:uid", userController.updateUser);
router.delete("/users/:uid", userController.deleteUser);

export default router;
