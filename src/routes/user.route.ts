import { Router } from "express";
import { UserController } from "../controller/user.controller";

const router = Router();
const userController = new UserController();

router.get("/getAllUsers", userController.getAllUsers);
router.get("/users/:uid", userController.getUser);
router.put("/users/:uid", userController.updateUser);
router.delete("/users/:uid", userController.deleteUser);

export default router;
