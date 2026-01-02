import { z } from "zod";
import bcrypt from "bcryptjs";

// Define User schema using Zod
export const UserSchema = z.object({
  uid: z.string().min(1, { error: "UID is required" }),
  fullName: z.string().min(1, { error: "Full name is required" }),
  email: z
    .string()
    .email({ message: "Invalid email format" })
    .min(1, { error: "Email is required" }),
  authProvider: z.string().min(1, { error: "Auth provider is required" }),
  role: z.enum(["admin", "user"]).default("user"),
  password: z.string().min(6, { error: "Password must be at least 6 char long" }),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type UserType = z.infer<typeof UserSchema>;

// In-memory "database"
const users: UserType[] = [];

export class UserService {
  /**
   * Register a new user
   */
  static async createUser(data: unknown): Promise<UserType> {
    // Validate input
    const parsed = UserSchema.parse(data);

    // Check if email already exists
    const existingUser = users.find((u) => u.email === parsed.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(parsed.password, 10);

    const newUser: UserType = {
      ...parsed,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.push(newUser);
    return newUser;
  }

  /**
   * Login user
   */
  static async loginUser(email: string, password: string): Promise<UserType> {
    const user = users.find((u) => u.email === email);

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    return user;
  }

  /**
   * Get all users (admin use)
   */
  static getAllUsers(): Omit<UserType, "password">[] {
    return users.map(({ password, ...rest }) => rest);
  }

  /**
   * Get user by email
   */
  static getUserByEmail(email: string): UserType | undefined {
    return users.find((u) => u.email === email);
  }

  /**
   * Update user
   */
  static async updateUser(email: string, data: Partial<UserType>): Promise<UserType> {
    const userIndex = users.findIndex((u) => u.email === email);
    if (userIndex === -1) throw new Error("User not found");

    const existingUser = users[userIndex];

    // If password is being updated, hash it
    let updatedPassword = existingUser.password;
    if (data.password) {
      updatedPassword = await bcrypt.hash(data.password, 10);
    }

    const updatedUser: UserType = {
      ...existingUser,
      ...data,
      password: updatedPassword,
      updatedAt: new Date(),
    };

    // Validate updated user
    UserSchema.parse(updatedUser);

    users[userIndex] = updatedUser;
    return updatedUser;
  }

  /**
   * Delete user
   */
  static deleteUser(email: string): boolean {
    const index = users.findIndex((u) => u.email === email);
    if (index === -1) return false;

    users.splice(index, 1);
    return true;
  }

  /**
   * Check if email exists
   */
  static doesEmailExist(email: string): boolean {
    return users.some((u) => u.email === email);
  }
}
