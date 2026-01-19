import { number, z } from "zod";

// Import your schema
export const UserSchema = z.object({
  uid: z.string().min(1, { error: "UID is required" }),
  firstname: z.string().min(1, { error: "Name is required" }),
  lastname: z.string().min(1, { error: "Name is required" }),
  email: z.email({ message: "Invalid email format" }).min(1, { error: "Email is required" }),
  number: z.string().min(1, { error: "Phone number is required" }),
  authProvider: z.string().min(1, { error: "Auth provider is required" }),
  role: z.enum(["admin", "user"]).default("user"),
  password: z.string().min(6, { error: "Password must be at least 6 char long" }),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type UserType = z.infer<typeof UserSchema>;

// In-memory storage for demonstration
const users: Record<string, UserType> = {};

export class UserService {
  // Create a new user
  static createUser(data: Partial<UserType>): UserType {
    const parsedUser = UserSchema.parse({
      ...data,
      uid: data.uid || crypto.randomUUID(),
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    });

    users[parsedUser.uid] = parsedUser;
    return parsedUser;
  }

  // Get a user by UID
  static getUser(uid: string): UserType | null {
    return users[uid] || null;
  }

  // Update a user
  static updateUser(uid: string, data: Partial<UserType>): UserType | null {
    const existingUser = users[uid];
    if (!existingUser) return null;

    const updatedUser = UserSchema.parse({
      ...existingUser,
      ...data,
      uid, // UID remains the same
      updatedAt: new Date(),
    });

    users[uid] = updatedUser;
    return updatedUser;
  }

  // Delete a user
  static deleteUser(uid: string): boolean {
    if (!users[uid]) return false;
    delete users[uid];
    return true;
  }

  // Get all users
  static getAllUsers(): UserType[] {
    return Object.values(users);
  }

  // Find user by email
  static findByEmail(email: string): UserType | null {
    return Object.values(users).find((user) => user.email === email) || null;
  }

  // Check if email exists
  static doesEmailExist(email: string): boolean {
    return !!Object.values(users).find((user) => user.email === email);
  }
}
