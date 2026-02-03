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

export const getUsers = async (req: Request, res: Response) => {
 const users = await User.find();
 res.json(users);
};

export const getUserById = async (req: Request, res: Response) => {
 const user = await User.findById(req.params.id);
 res.json(user);
};

export const updateUser = async (req: Request, res: Response) => {
 const data = req.body;

 if(req.file){
   data.image = req.file.path;
 }

 const user = await User.findByIdAndUpdate(req.params.id, data, { new: true });

 res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
 const user = await User.findByIdAndDelete(req.params.id);
 res.json(user);
};

