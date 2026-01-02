import { Request, Response } from "express";
import { LoginUserDto, CreateUserDto } from "../dtos/user.dto";
import { UserService } from "../services/user.service";

export class UserController {

    async createUser(req: Request, res: Response) {
        try {
            // validate input
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

    async loginUser(req: Request, res: Response) {
        try {
            // validate input
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

    async getAllUsers(_req: Request, res: Response) {
        try {
            const users = UserService.getAllUsers();
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
}
