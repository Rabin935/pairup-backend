import { z } from "zod";

export const UserScheme = z.object({
    uid: z.string().min(1, { error: "UID is required" }),
    fullName: z.string().min(1, { error: "Username is required" }),
    email: z.email({ message: "Invalid email format" }).min(1, { error: "Email is required" }),
    allergenicIngredients: z.array(z.string()).default([]),
    authProvider: z.string().min(1, { error: "Auth provider is required" }),
    role: z.enum(["admin", "user"]).default("user"),
    password: z.string().min(6, { error: "Password must be at least 6 char long" }),
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
});

export type UserType = z.infer<typeof UserScheme>;