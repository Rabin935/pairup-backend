import { Request, Response, NextFunction } from "express";
import { UserModel as User } from "../../models/user.model";


export const createUser = async (req: Request, res: Response, next: NextFunction) => {
 const image = req.file?.path;

 const user = await User.create({
   ...req.body,
   image
 });

 res.json(user);
};