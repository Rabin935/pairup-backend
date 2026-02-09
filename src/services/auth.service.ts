import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../error/http-error";
import { JWT_SECRET } from "../config";
import { UserRepository } from "../repositories/auth.repository";
import { v4 as uuidv4 } from "uuid";

const userRepository = new UserRepository();

export class AuthService {
  /**
   * Register a new user
   */
  async registerUser(data: CreateUserDto) {
    // Check if email already exists
    const emailExists = await userRepository.getUserByEmail(data.email);
    if (emailExists) {
      throw new HttpError(409, "Email already exists");
    }

    // // Check if username already exists
    // const usernameExists = await userRepository.getUserByUsername(data.username);
    // if (usernameExists) {
    //   throw new HttpError(701, "Username already exists");
    // }

    // Generate unique uid
    data.uid = uuidv4();

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(data.password, 10);
    data.password = hashedPassword;

    // Create user in repository
    const newUser = await userRepository.createUser(data);
    return newUser;
  }

  /**
   * Login user
   */
  async loginUser(data: LoginUserDto) {
    // Find user by email
    const user = await userRepository.getUserByEmail(data.email);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    // Validate password
    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      throw new HttpError(401, "Invalid credentials");
    }

    // Generate JWT token
    const payload = {
      id: user._id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    return { token, user };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: any) {
    // Check if user exists
    const user = await userRepository.getUserById(userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    // If password is being updated, hash it
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    // Update user in repository
    const updatedUser = await userRepository.updateProfile(userId, data);
    return updatedUser;
  }
}
