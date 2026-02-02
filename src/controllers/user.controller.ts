import { Request, Response } from "express";
<<<<<<< HEAD
import { LoginUserDto, CreateUserDto } from "../dtos/user.dto";
import { UserService } from "../services/user.service";

export class UserController {

    /**
     * CREATE USER
     * POST /users
     */
    async createUser(req: Request, res: Response) {
        try {
            const parsedUser = CreateUserDto.safeParse(req.body);

            if (!parsedUser.success) {
                return res.status(400).json({
                    success: false,
                    errors: parsedUser.error
                });
            }

            const user = await UserService.createUser(parsedUser.data);

            return res.status(201).json({
                success: true,
                data: user,
                message: "User registered successfully"
            });

        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message || "Internal Server Error"
            });
        }
    }

    /**
     * LOGIN USER
     * POST /login
     */
    async loginUser(req: Request, res: Response) {
        try {
            const parsedLogin = LoginUserDto.safeParse(req.body);

            if (!parsedLogin.success) {
                return res.status(400).json({
                    success: false,
                    errors: parsedLogin.error
                });
            }

            const { email, password } = parsedLogin.data;
            const user = await UserService.loginUser(email, password);

            return res.status(200).json({
                success: true,
                data: user,
                message: "Login successful"
            });

        } catch (error: any) {
            return res.status(401).json({
                success: false,
                message: error.message || "Invalid credentials"
            });
        }
    }

    /**
     * GET ALL USERS
     * GET /getAllUsers
     */
    async getAllUsers(_req: Request, res: Response) {
        try {
            const users = await UserService.getAllUsers(); // ✅ await added

            return res.status(200).json({
                success: true,
                data: users
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal Server Error"
            });
        }
    }

    /**
     * GET SINGLE USER
     * GET /users/:uid
     */
    async getUser(req: Request, res: Response) {
        try {
            const { uid } = req.params;

            const user = await UserService.getUserByEmail(uid); 

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.status(200).json({
                success: true,
                data: user
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal Server Error"
            });
        }
    }

    /**
     * UPDATE USER
     * PUT /users/:uid
     */
    async updateUser(req: Request, res: Response) {
        try {
            const { uid } = req.params;
            const updatedUser = await UserService.updateUser(uid, req.body);

            return res.status(200).json({
                success: true,
                data: updatedUser,
                message: "User updated successfully"
            });
        } catch (error: any) {
            return res.status(404).json({
                success: false,
                message: error.message || "User not found"
            });
        }
    }

    /**
     * DELETE USER
     * DELETE /users/:uid
     */
    async deleteUser(req: Request, res: Response) {
        try {
            const { uid } = req.params;
            const deleted = await UserService.deleteUser(uid); // ✅ await added

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.status(200).json({
                success: true,
                message: "User deleted successfully"
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal Server Error"
            });
        }
    }
=======
import { UpdateUserDto } from "../dtos/user.dto";
import { UserService } from "../services/user.service";

export class UserController {
	private userService: UserService;

	constructor(userService: UserService = new UserService()) {
		this.userService = userService;
	}

	getAllUsers = async (_req: Request, res: Response): Promise<void> => {
		try {
			const users = await this.userService.getAllUsers();
			res.json(users);
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	getUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const user = await this.userService.getUser(uid);
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
			const payload: UpdateUserDto = { ...req.body, uid };
			const updated = await this.userService.updateUser(payload);
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
			const deleted = await this.userService.deleteUser(uid);
			res.status(200).json({message:"User deleted successfully"})
			if (!deleted) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};
>>>>>>> sprint-4
}
