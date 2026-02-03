import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}

export const authorizedMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // user is attached by auth middleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Check role
    if (req.user.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Admin access only",
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Authorization failed",
    });
  }
};
