import { z } from "zod";
import { UserSchema } from "../types/user.type";

export const RegisterDto = UserSchema.pick({
    uid: true,
    fullName: true,
    email: true,
    allergenicIngredients: true,
    authProvider: true,
    role: true,
    createdAt: true,
    updatedAt: true,
    password: true,
}).extend({
    confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Password and Confirm Password must be same",
    path: ["confirmPassword"],
});
export type RegisterDto = z.infer<typeof RegisterDto>;

export const LoginDto = z.object({
    email: z.email({ message: "Invalid email format" }),
    password: z.string().min(6),
});
export type LoginDto = z.infer<typeof LoginDto>;
