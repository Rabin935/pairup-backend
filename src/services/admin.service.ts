import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../error/http-error";
import { JWT_SECRET } from "../config";
import { UserRepository } from "../repositories/auth.repository";
import { LoginUserDto } from "../dtos/user.dto";
import { IUser } from "../models/user.model";

const userRepository = new UserRepository();

export class AdminService {
  /**
   * Admin login - only admins can login
   */
  async adminLogin(data: LoginUserDto) {
    // Find user by email
    const user = await userRepository.getUserByEmail(data.email);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    // Check if user is admin
    if (user.role !== "admin") {
      throw new HttpError(403, "Only admins can login here");
    }

    // Validate password
    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      throw new HttpError(401, "Invalid credentials");
    }

    // Generate JWT token
    const payload = {
      id: user._id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    return { token, user };
  }

  /**
   * Get all users with their credentials (admin only)
   */
  async getAllUsers(): Promise<IUser[]> {
    const users = await userRepository.getAllUsers();
    return users;
  }

  /**
   * Get user by ID (admin only)
   */
  async getUserById(userId: string): Promise<IUser | null> {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    return user;
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: string): Promise<boolean> {
    const deleted = await userRepository.deleteUser(userId);
    if (!deleted) {
      throw new HttpError(404, "User not found");
    }
    return deleted;
  }
}
