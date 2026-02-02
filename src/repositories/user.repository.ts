import { IUser, UserModel } from "../models/user.model";

/**
 * User repository interface
 */
export interface IUserRepository {
  createUser(data: Partial<IUser>): Promise<IUser>;
  getUserByEmail(email: string): Promise<IUser | null>;
  // getUserByUsername(fullName: string): Promise<IUser | null>;
  getUserById(uid: string): Promise<IUser | null>;
  getAllUsers(): Promise<IUser[]>;
  deleteUser(uid: string): Promise<boolean>;
}

/**
 * User repository implementation
 */
export class UserRepository implements IUserRepository {
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
    return UserModel.findOne({ email });
  }

  /**
   * Find user by fullName (as username)
   */
  // async getUserByUsername(fullName: string): Promise<IUser | null> {
  //   return UserModel.findOne({ fullName });
  // }

  /**
   * Find user by uid
   */
  async getUserById(uid: string): Promise<IUser | null> {
    return UserModel.findOne({ uid });
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<IUser[]> {
    return UserModel.find();
  }

  /**
   * Delete user by uid
   */
  async deleteUser(uid: string): Promise<boolean> {
    const result = await UserModel.deleteOne({ uid });
    return result.deletedCount === 1;
  }
}
