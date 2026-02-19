import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";
import { upload } from "../middleware/multer";


const router = Router();
const userController = new UserController();

router.get("/me", authorizedMiddleware, userController.getCurrentUser);
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

router.get("/getAllUsers", userController.getAllUsers);
router.get("/users/:uid", userController.getUser);
router.put("/users/:uid", userController.updateUser);
router.delete("/users/:uid", userController.deleteUser);

export default router;
