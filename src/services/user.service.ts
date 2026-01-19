import { number, z } from "zod";
import bcrypt from "bcryptjs";

/* -------------------- ZOD SCHEMA -------------------- */
export const UserSchema = z.object({
  uid: z.string().min(1, "UID is required"),
  fisrtname: z.string().min(1, "Name is required"),
  lastname: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  number: z.string().min(1, "Phone number is required"),
  authProvider: z.string().min(1, "Auth provider is required"),
  role: z.enum(["admin", "user"]).default("user"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

export type UserType = z.infer<typeof UserSchema>;

/* -------------------- IN-MEMORY DB -------------------- */
const users: UserType[] = [];

/* -------------------- USER SERVICE -------------------- */
export class UserService {
  /**
   * Create/Register User
   */
  static async createUser(data: unknown): Promise<Omit<UserType, "password">> {
    // Validate input
    const parsed = UserSchema.parse(data);

    // Check if email exists
    const exists = users.find((u) => u.email === parsed.email);
    if (exists) {
      throw new Error("User already exists with this email");
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

    // Remove password before returning
    const { password, ...safeUser } = newUser;
    return safeUser;
  }

  /**
   * Login User
   */
  static async loginUser(
    email: string,
    password: string
  ): Promise<Omit<UserType, "password">> {
    const user = users.find((u) => u.email === email);

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }

    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get all users (Admin)
   */
  static getAllUsers(): Omit<UserType, "password">[] {
    return users.map(({ password, ...rest }) => rest);
  }

  /**
   * Get user by email
   */
  static getUserByEmail(
    email: string
  ): Omit<UserType, "password"> | undefined {
    const user = users.find((u) => u.email === email);
    if (!user) return undefined;

    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Update user
   */
  static async updateUser(
    email: string,
    data: Partial<UserType>
  ): Promise<Omit<UserType, "password">> {
    const index = users.findIndex((u) => u.email === email);
    if (index === -1) throw new Error("User not found");

    const existingUser = users[index];

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

    users[index] = updatedUser;

    const { password, ...safeUser } = updatedUser;
    return safeUser;
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
   * Check email existence
   */
  static doesEmailExist(email: string): boolean {
    return users.some((u) => u.email === email);
  }
}
