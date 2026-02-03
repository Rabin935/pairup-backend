import { AuthService } from "../services/auth.service";
import { CreateUserDto, LoginUserDto} from "../dtos/user.dto";
import z from "zod";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";



let authService = new AuthService();
export class AuthController{
    async registerUser(req: Request, res: Response){
        try{
            const parsedData = CreateUserDto.safeParse(req.body);
            if(!parsedData.success){
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                )
            }
            const newUser = await authService.registerUser(parsedData.data);
            return res.status(201).json(
                { success: true, data: newUser, message: "Registered Success" }
            )
        }catch(error: Error | any){
            return res.status(error.statusCode || 500).json(
                { success: false, message: error.message || "Internal Server Error" }
            )
        }
    }
    async loginUser(req: Request, res: Response){
        try{
            const parsedData = LoginUserDto.safeParse(req.body);
            if(!parsedData.success){
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                )
            }
            const { token , user } = await authService.loginUser(parsedData.data);
            return res.status(200).json(
                { success: true, data: user, token, message: "Login success" }
            )
        }catch(error: Error | any){
            return res.status(error.statusCode || 500).json(
                { success: false, message: error.message || "Internal Server Error" }
            )
        }
    }
    async updateProfile(req: Request, res: Response){
        try{
            const { id } = req.params;
            const image = req.file?.path;
            
            const updatedUser = await authService.updateProfile(id, {
                ...req.body,
                image
            });
            
            return res.status(200).json(
                { success: true, data: updatedUser, message: "Profile updated successfully" }
            )
        }catch(error: Error | any){
            return res.status(error.statusCode || 500).json(
                { success: false, message: error.message || "Internal Server Error" }
            )
        }
    }
}

