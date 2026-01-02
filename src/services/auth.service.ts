import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { RegisterDto, LoginDto } from "../dtos/auth.dto";
import { HttpError } from "../errors/http-error";
import { IUserRepository, UserRepository } from "../respositories/user.repository";
import { UserType } from "../types/user.type";

export type SafeUser = Omit<UserType, "password">;

export class AuthService {
    private userRepository: IUserRepository;

    constructor(userRepository: IUserRepository = new UserRepository()) {
        this.userRepository = userRepository;
    }

    async register(payload: RegisterDto): Promise<{ token: string; user: SafeUser }> {
        const data = RegisterDto.parse(payload);
        const normalizedEmail = data.email.toLowerCase();
        const existingByUid = await this.userRepository.getUser(data.uid);
        const existingByEmail = await this.userRepository.getUserByEmail(normalizedEmail);
        if (existingByUid || existingByEmail) {
            throw new HttpError(409, "User already exists");
        }

        const hashedPassword = await bcryptjs.hash(data.password, 10);
        const userToCreate: UserType = {
            uid: data.uid,
            fullName: data.fullName,
            email: normalizedEmail,
            allergenicIngredients: data.allergenicIngredients,
            authProvider: data.authProvider,
            role: data.role ?? "user",
            password: hashedPassword,
            createdAt: data.createdAt ?? new Date(),
            updatedAt: data.updatedAt ?? new Date(),
        };

        const created = await this.userRepository.createUser(userToCreate);
        const token = this.generateToken(created);
        return { token, user: this.sanitizeUser(created) };
    }

    async login(payload: LoginDto): Promise<{ token: string; user: SafeUser }> {
        const data = LoginDto.parse(payload);
        const normalizedEmail = data.email.toLowerCase();
        const user = await this.userRepository.getUserByEmail(normalizedEmail);
        if (!user) {
            throw new HttpError(404, "No user found");
        }

        const validPassword = await bcryptjs.compare(data.password, user.password);
        if (!validPassword) {
            throw new HttpError(401, "Invalid password");
        }

        const token = this.generateToken(user);
        return { token, user: this.sanitizeUser(user) };
    }

    private generateToken(user: UserType): string {
        const payload = {
            id: user.uid,
            email: user.email,
            fullName: user.fullName,
        };
        return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    }

    private sanitizeUser(user: UserType): SafeUser {
        const { password, ...safeUser } = user;
        return safeUser;
    }
}
