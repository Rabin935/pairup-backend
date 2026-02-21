import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
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
    socket.user = decoded;
    return next();
  } catch {
    return next(new Error("Unauthorized: invalid token"));
  }
};
