import { Request, Response } from "express";
import { z } from "zod";
import { RegisterDto, LoginDto } from "../dtos/user.dto";
import { UserService } from "../services/user.service";
import { IUser } from "../models/user.model";

const userService = new UserService();

export class UserController {

    async registerUser(req: Request, res: Response) {
        try {
            // validate input (DTO responsibility)
            const parsedUser = RegisterDto.safeParse(req.body);

            if (!parsedUser.success) {
                return res.status(400).json({
                    errors: parsedUser.error
                });
            }

            // call service
            const newUser: IUser = await userService.createUser(parsedUser.data);

            return res.status(201).json({
                success: true,
                data: newUser,
                message: "User registered successfully"
            });

        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({ message: error.message || "Internal Server Error" });
        }
    }

    async loginUser(req: Request, res: Response) {
        try {
            // validate input
            const parsedLogin = LoginDto.safeParse(req.body);

            if (!parsedLogin.success) {
                return res.status(400).json({
                    errors: parsedLogin.error
                });
            }

            const { token, user } = await userService.loginUser(parsedLogin.data);

            return res.status(200).json({
                success: true,
                data: user,
                token,
                message: "Login successful"
            });

        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({ message: error.message || "Internal Server Error" });
        }
    }

    async getAllUsers(_req: Request, res: Response) {
        try {
            const users = await userService.getAllUsers();
            return res.status(200).json(users);
        } catch (error: Error | any) {
            return res.status(500).json({
                message: error.message || "Internal Server Error"
            });
        }
    }
}
