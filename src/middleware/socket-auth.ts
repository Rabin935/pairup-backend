import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { JWT_SECRET } from "../config";

interface AuthedSocket extends Socket {
  user?: jwt.JwtPayload | string;
}

export const socketAuth = (
  socket: AuthedSocket,
  next: (err?: Error) => void
) => {
  const tokenFromAuth = socket.handshake.auth?.token;
  const tokenFromQuery = socket.handshake.query?.token;
  const token =
    typeof tokenFromAuth === "string"
      ? tokenFromAuth
      : typeof tokenFromQuery === "string"
        ? tokenFromQuery
        : undefined;

  if (!token) {
    return next(new Error("Unauthorized: missing token"));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const payload = decoded as jwt.JwtPayload;
    const candidateId =
      (typeof payload.id === "string" ? payload.id : undefined) ||
      (typeof payload._id === "string" ? payload._id : undefined) ||
      (typeof payload.userId === "string" ? payload.userId : undefined);

    if (!candidateId || !mongoose.Types.ObjectId.isValid(candidateId)) {
      return next(new Error("Unauthorized: invalid user id in token"));
    }

    socket.user = {
      ...payload,
      id: candidateId,
    };
    return next();
  } catch {
    return next(new Error("Unauthorized: invalid token"));
  }
};
