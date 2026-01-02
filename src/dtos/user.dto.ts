import { z } from "zod";
import { UserScheme } from "../types/user.type";

export const UpdateUserDto = UserScheme.pick({
    uid: true,
    fullName: true,
    email: true,
    allergenicIngredients: true,
    authProvider: true,
}).extend({
    fullName: UserScheme.shape.fullName.optional(),
    email: UserScheme.shape.email.optional(),
    allergenicIngredients: UserScheme.shape.allergenicIngredients.optional(),
    authProvider: UserScheme.shape.authProvider.optional(),
    updatedAt: UserScheme.shape.updatedAt.optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;