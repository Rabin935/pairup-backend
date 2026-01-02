import z from "zod";
import { UserSchema } from "../types/user.type";

export const CreateUserDto = UserSchema.pick( // re use userSchema
    {
        firstName: true, // true - include from userSchema
        lastName: true,
        email: true,
        username: true,
        password: true
    }
).extend( // add new attriute to schema
    {
        confirmPassword: z.string().min(6)
    }
).refine( // extra validation from existing attributess
    (data: { password: any; confirmPassword: any; }) => data.password === data.confirmPassword,
    {
        message: "Password and Confirm Password must match",
        path: ["confirmPassword"] // throws error on confirmPassword field
    }
)
export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const LoginUserDto = z.object({
    email: z.email(),
    password: z.string().min(6)
})
export type LoginUserDto = z.infer<typeof LoginUserDto>;