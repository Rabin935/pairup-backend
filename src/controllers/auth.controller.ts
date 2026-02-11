import { NextFunction, Request, Response } from "express";
import z from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendEmail } from "../config/email";
import { AuthService } from "../services/auth.service";
import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import { UserModel } from "../models/user.model";

const authService = new AuthService();
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class AuthController {
  async registerUser(req: Request, res: Response) {
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

  async loginUser(req: Request, res: Response) {
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

  async updateProfile(req: Request, res: Response) {
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

  async forgotPassword(req: Request, res: Response) {
    const safeResponse = {
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    };

    try {
      const { email } = req.body;
      if (!email) {
        return res.status(200).json(safeResponse);
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await UserModel.findOne({ email: normalizedEmail });

      if (user) {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto
          .createHash("sha256")
          .update(resetToken)
          .digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpire = new Date(Date.now() + PASSWORD_RESET_WINDOW_MS);
        await user.save({ validateBeforeSave: false });

        const resetUrl = `http://localhost:5000/reset-password/${resetToken}`;

        try {
          await sendEmail(
            user.email,
            "Password Reset Instructions",
            `
            <p>You requested a password reset.</p>
            <p>Click the link below (valid for 15 minutes):</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>If you did not request this, you can safely ignore this email.</p>
          `
          );
        } catch (mailError) {
          console.error("Forgot-password email failed", mailError);
          user.resetPasswordToken = undefined;
          user.resetPasswordExpire = undefined;
          await user.save({ validateBeforeSave: false });
          return res.status(500).json({
            success: false,
            message: "Unable to send reset email. Please try again later.",
          });
        }
      }

      return res.status(200).json(safeResponse);
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { password } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message: "Reset token and new password are required.",
        });
      }

      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

      const user = await UserModel.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { $gt: new Date() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Reset token is invalid or has expired.",
        });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Password reset successful. You can now log in.",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }
}