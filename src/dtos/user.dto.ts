import { z } from "zod";
import { UserSchema } from "../types/user.type";

/**
 * Create User DTO
 * Re-uses UserSchema and adds confirmPassword
 */
export const CreateUserDto = UserSchema.pick({
  uid: true,
  fullName: true,
  email: true,
  authProvider: true,
  password: true,
}).extend({
  confirmPassword: z.string().min(6, {
    message: "Confirm password must be at least 6 characters",
  }),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Password and Confirm Password must match",
    path: ["confirmPassword"],
  }
);

export type CreateUserDto = z.infer<typeof CreateUserDto>;

/**
 * Login User DTO
 */
export const LoginUserDto = z.object({
  email: z.string().email({ message: "Invalid email format" }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters",
  }),
});

export type LoginUserDto = z.infer<typeof LoginUserDto>;
