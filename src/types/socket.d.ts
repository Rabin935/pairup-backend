import type { JwtPayload } from "jsonwebtoken";

declare module "socket.io" {
  interface Socket {
    user?: JwtPayload | string;
  }
}
