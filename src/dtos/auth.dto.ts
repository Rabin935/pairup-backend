import { z } from "zod";
import { UserSchema } from "../types/user.type";

/**
 * ============================
 * Register DTO
 * ============================
 */
export const RegisterDto = UserSchema.pick({
  // uid: true,
  fullName: true,
  // username: true,
  email: true,
  authProvider: true,
  role: true,
  password: true,
} as const).extend({
  confirmPassword: z.string().min(6, {
    message: "Confirm password must be at least 6 characters",
  }),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Password and Confirm Password must be same",
    path: ["confirmPassword"],
  }
);

export type RegisterDto = z.infer<typeof RegisterDto>;

/**
 * ============================
 * Login DTO
 * ============================
 */
export const LoginDto = z.object({
  email: z.email({
    message: "Invalid email format",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters",
  }),
});

export type LoginDto = z.infer<typeof LoginDto>;
