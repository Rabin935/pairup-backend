import { NextFunction, Request, Response } from "express";
import z from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { AuthService } from "../services/auth.service";
import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import { UserModel } from "../models/user.model";

const authService = new AuthService();
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class AuthController {
  async registerUser(req: Request, res: Response) {
    /* ...existing code... */
  }

  async loginUser(req: Request, res: Response) {
    /* ...existing code... */
  }

  async updateProfile(req: Request, res: Response) {
    /* ...existing code... */
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

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password
          },
        });

        const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
        const mailOptions = {
          from: `PairUp Support <${process.env.GMAIL_USER}>`,
          to: user.email,
          subject: "Password Reset Instructions",
          html: `
            <p>You requested a password reset.</p>
            <p>Click the link below (valid for 15 minutes):</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>If you did not request this, you can safely ignore this email.</p>
          `,
        };

        try {
          await transporter.sendMail(mailOptions);
        } catch (mailError) {
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
}