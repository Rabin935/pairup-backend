import { IUser, UserModel } from "../models/user.model";

/**
 * User repository interface
 */
export interface IUserRepository {
  createUser(data: Partial<IUser>): Promise<IUser>;
  getUserByEmail(email: string): Promise<IUser | null>;
  // getUserByUsername(fullname: string): Promise<IUser | null>;
  getUserById(userId: string): Promise<IUser | null>;
  getAllUsers(): Promise<IUser[]>;
  deleteUser(userId: string): Promise<boolean>;
  updateProfile(userId: string, data: Partial<IUser>): Promise<IUser | null>;
}

/**
 * User repository implementation
 */
export class UserRepository implements IUserRepository {
  async updateProfile(userId: string, data: Partial<IUser>): Promise<IUser | null> {
    return UserModel.findByIdAndUpdate(userId, data, { new: true });
  }
  /**
   * Create a new user
   */
  async createUser(data: Partial<IUser>): Promise<IUser> {
    const newUser = new UserModel(data);
    await newUser.save();
    return newUser;
  }

  /**
   * Find user by email
   */
  async getUserByEmail(email: string): Promise<IUser | null> {
    const user = await UserModel.findOne({ email });
    return user;
  }

  /**
   * Find user by username
   */
  // async getUserByUsername(fullName: string): Promise<IUser | null> {
  //   const user = await UserModel.findOne({ fullName });
  //   return user;
  // }

  /**
   * Find user by userId
   */
  async getUserById(userId: string): Promise<IUser | null> {
    const user = await UserModel.findById(userId);
    return user;
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<IUser[]> {
    return UserModel.find();
  }

  /**
   * Delete user by userId
   */
  async deleteUser(userId: string): Promise<boolean> {
    const result = await UserModel.deleteOne({ _id: userId });
    return result.deletedCount === 1;
  }
}
