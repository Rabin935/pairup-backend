import { Request, Response, NextFunction } from "express";
import { AdminService } from "../../services/admin.service";
import { LoginUserDto } from "../../dtos/user.dto";
import z from "zod";
import { UserModel as User } from "../../models/user.model";

const adminService = new AdminService();

export class AdminController {
  /**
   * Admin login - only admins can access
   */
  async adminLogin(req: Request, res: Response) {
    try {
      const parsedData = LoginUserDto.safeParse(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          success: false,
          message: z.prettifyError(parsedData.error),
        });
      }

      const { token, user } = await adminService.adminLogin(parsedData.data);
      return res.status(200).json({
        success: true,
        data: user,
        token,
        message: "Admin login successful",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(req: Request, res: Response) {
    try {
      const users = await adminService.getAllUsers();
      return res.status(200).json({
        success: true,
        data: users,
        count: users.length,
        message: "Users retrieved successfully",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  /**
   * Get user by ID (admin only)
   */
  async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await adminService.getUserById(id);
      return res.status(200).json({
        success: true,
        data: user,
        message: "User retrieved successfully",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await adminService.deleteUser(id);
      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  /**
   * Create a new user from admin panel
   */
  async createUser(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const image = req.file?.path;

      const user = await User.create({
        ...req.body,
        image,
      });

      return res.status(201).json({
        success: true,
        data: user,
        message: "User created successfully",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  /**
   * Update user (admin only)
   */
  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;

      if (req.file) {
        data.image = req.file.path;
      }

      const user = await User.findByIdAndUpdate(id, data, { new: true });

      return res.status(200).json({
        success: true,
        data: user,
        message: "User updated successfully",
      });
    } catch (error: Error | any) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }
}

// Export instances for use in routes
export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const controller = new AdminController();
  return controller.createUser(req, res, next);
};

export const getUsers = async (req: Request, res: Response) => {
  const controller = new AdminController();
  return controller.getAllUsers(req, res);
};

export const getUserById = async (req: Request, res: Response) => {
  const controller = new AdminController();
  return controller.getUserById(req, res);
};

export const updateUser = async (req: Request, res: Response) => {
  const controller = new AdminController();
  return controller.updateUser(req, res);
};

export const deleteUser = async (req: Request, res: Response) => {
  const controller = new AdminController();
  return controller.deleteUser(req, res);
};