import { Request, Response, NextFunction } from "express";
import { HttpError } from "../../error/http-error";

const formatAdminError = (res: Response, error: unknown) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Failed to authorize admin request",
  });
};

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new HttpError(401, "Unauthorized");
    }

    if (req.user.role !== "admin") {
      throw new HttpError(403, "Forbidden: admin access required");
    }

    next();
  } catch (error) {
    formatAdminError(res, error);
  }
};

// Backward-compatible alias for existing imports.
export const isAdmin = adminOnly;
