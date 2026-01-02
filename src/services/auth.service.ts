import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../error/http-error";
import { JWT_SECRET } from "../config";
import { UserRepository } from "../repositories/auth.repository";

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

    // Check if username already exists
    const usernameExists = await userRepository.getUserByUsername(data.username);
    if (usernameExists) {
      throw new HttpError(701, "Username already exists");
    }

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
      fullName: user.fullName,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    return { token, user };
  }
}
