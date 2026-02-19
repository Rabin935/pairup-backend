import { Request, Response, NextFunction } from "express";
import { AdminService } from "../../services/admin.service";
import { LoginUserDto } from "../../dtos/user.dto";
import z from "zod";
import { UserModel as User } from "../../models/user.model";
import { CloudinaryService } from "../../services/cloudinary.service";

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
      const parsedPage = parseInt(req.query.page as string, 10);
      const parsedLimit = parseInt(req.query.limit as string, 10);

      const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
      const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : parsedLimit;
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find().select("-password").skip(skip).limit(limit),
        User.countDocuments(),
      ]);

      return res.status(200).json({
        success: true,
        data: users,
        pagination: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
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
      let uploadedImage: { url: string; publicId: string } | null = null;

      if (req.file) {
        uploadedImage = await CloudinaryService.uploadImage(req.file);
      }

      const user = await User.create({
        ...req.body,
        image: uploadedImage?.url || "",
        profileImage: uploadedImage?.url || "",
        profileImagePublicId: uploadedImage?.publicId || "",
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
      const updates = { ...req.body } as Record<string, unknown>;

      const existingUser = await User.findById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (req.file) {
        const uploaded = await CloudinaryService.uploadImage(req.file);
        updates.image = uploaded.url;
        updates.profileImage = uploaded.url;
        updates.profileImagePublicId = uploaded.publicId;
        await CloudinaryService.deleteImage(existingUser.profileImagePublicId);
      }

      const user = await User.findByIdAndUpdate(id, updates, { new: true });

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