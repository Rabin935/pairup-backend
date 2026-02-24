import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { UserModel } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        _id?: string;
        mongoId?: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}

interface DecodedToken extends JwtPayload {
  id: string;
}

export const authorizedMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    req.user = {
      id: user.uid,
      _id: user._id.toString(),
      mongoId: user._id.toString(),
      role: user.role,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  const headerToken = req.headers["x-access-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    return headerToken;
  }

  if (typeof req.query.token === "string" && req.query.token.length > 0) {
    return req.query.token;
  }

  if (req.body && typeof req.body.token === "string" && req.body.token.length > 0) {
    return req.body.token;
  }

  return null;
};
