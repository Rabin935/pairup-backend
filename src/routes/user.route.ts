import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authorizedMiddleware } from "../middleware/authorized.middleware";


const router = Router();
const userController = new UserController();

router.get("/me", authorizedMiddleware, userController.getCurrentUser);

router.get("/getAllUsers", userController.getAllUsers);
router.get("/users/:uid", userController.getUser);
router.put("/users/:uid", userController.updateUser);
router.delete("/users/:uid", userController.deleteUser);

export default router;
