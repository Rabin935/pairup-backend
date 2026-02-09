import { Request, Response } from "express";

import { UserService } from "../services/user.service";

export class UserController {
	private userService: UserService;

	constructor(userService: UserService = new UserService()) {
		this.userService = userService;
	}

	getAllUsers = async (_req: Request, res: Response): Promise<void> => {
		try {
			const users = UserService.getAllUsers();
			res.json(users);
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	getUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const user = UserService.getUserByEmail(uid);
			if (!user) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.json(user);
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	updateUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const updated = await UserService.updateUser(uid, req.body);
			if (!updated) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.json(updated);
		} catch (error) {
			res.status(400).json({ message: (error as Error).message });
		}
	};

	deleteUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const deleted = UserService.deleteUser(uid);
			if (!deleted) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};
}

