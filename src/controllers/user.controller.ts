import { Request, Response } from "express";

import { UserModel } from "../models/user.model";
import { UserService } from "../services/user.service";
import { CloudinaryService } from "../services/cloudinary.service";

export class UserController {
	private userService: UserService;

	constructor(userService: UserService = new UserService()) {
		this.userService = userService;
	}

	getCurrentUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = req.user?.id
				? { uid: req.user.id }
				: req.user?.email
				? { email: req.user.email }
				: null;

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query).select("-password -profileImagePublicId");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({ success: true, data: user });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to retrieve profile",
				error: (error as Error).message,
			});
		}
	};

	updateProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = req.user?.id
				? { uid: req.user.id }
				: req.user?.email
				? { email: req.user.email }
				: null;

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const { gender, age, location, interests, bio } = req.body;

			if (typeof gender === "string" && gender.trim()) {
				const normalizedGender = gender.trim().toLowerCase();
				const allowedGenders = ["male", "female", "other"];
				if (!allowedGenders.includes(normalizedGender)) {
					res.status(400).json({
						success: false,
						message: "Invalid gender value",
					});
					return;
				}
				user.gender = normalizedGender as typeof user.gender;
			}

			if (typeof age !== "undefined") {
				const parsedAge = Number(age);
				if (Number.isNaN(parsedAge) || parsedAge <= 0) {
					res.status(400).json({
						success: false,
						message: "Age must be a positive number",
					});
					return;
				}
				user.age = parsedAge;
			}

			if (typeof location === "string") {
				user.location = location.trim();
			}

			if (typeof bio === "string") {
				user.bio = bio.trim();
			}

			if (typeof interests !== "undefined") {
				const parsedInterests = Array.isArray(interests)
					? interests
						.map((item) => item.toString().trim())
						.filter(Boolean)
					: (interests as string)
						.split(",")
						.map((item) => item.trim())
						.filter(Boolean);
				user.interests = parsedInterests;
			}

			if (req.file) {
				const previousPublicId = user.profileImagePublicId;
				const uploaded = await CloudinaryService.uploadImage(req.file);
				user.profileImage = uploaded.url;
				user.profileImagePublicId = uploaded.publicId;
				if (previousPublicId && previousPublicId !== uploaded.publicId) {
					await CloudinaryService.deleteImage(previousPublicId);
				}
			}

			user.isProfileComplete = Boolean(user.gender && user.age && user.location);

			await user.save();

			const { password, profileImagePublicId, ...safeUser } = user.toObject();

			res.status(200).json({
				success: true,
				message: "Profile updated successfully",
				data: safeUser,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update profile",
				error: (error as Error).message,
			});
		}
	};

	uploadUserImages = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = req.user?.id
				? { uid: req.user.id }
				: req.user?.email
				? { email: req.user.email }
				: null;

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const files = (req.files as Express.Multer.File[]) || [];
			if (!Array.isArray(files) || files.length === 0) {
				res.status(400).json({ success: false, message: "No images uploaded" });
				return;
			}

			const uploadResults = await Promise.all(
				files.map((file) => CloudinaryService.uploadImage(file))
			);

			user.images = user.images || [];
			const isFirstBatch = user.images.length === 0;
			const imagesToAppend = uploadResults.map((result, index) => ({
				url: result.url,
				public_id: result.publicId,
				isThumbnail: isFirstBatch && index === 0,
			}));

			user.images.push(...imagesToAppend);
			await user.save();

			const {
				password,
				profileImagePublicId,
				resetPasswordToken,
				resetPasswordExpire,
				...safeUser
			} = user.toObject();

			res.status(200).json({
				success: true,
				message: "Images uploaded successfully",
				data: safeUser,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to upload images",
				error: (error as Error).message,
			});
		}
	};

	getAllUsers = async (_req: Request, res: Response): Promise<void> => {
		try {
			const users = UserService.getAllUsers();
			res.json(users);
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	discoverUsers = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = req.user?.id
				? { uid: req.user.id }
				: req.user?.email
				? { email: req.user.email }
				: null;

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id swipes");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const swipedIds = (currentUser.swipes || [])
				.map((swipe) => swipe.user)
				.filter((id): id is typeof currentUser._id => Boolean(id));
			const exclusionIds = [currentUser._id, ...swipedIds];

			const discoverableUsers = await UserModel.find({
				_id: { $nin: exclusionIds },
				isProfileComplete: true,
				"images.0": { $exists: true },
			})
				.select("_id firstname lastname age bio images")
				.lean();

			const formattedUsers = discoverableUsers.map((user) => ({
				_id: user._id,
				name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
				age: user.age ?? null,
				bio: user.bio ?? "",
				images: user.images || [],
			}));

			res.status(200).json({ success: true, data: formattedUsers });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to fetch users",
				error: (error as Error).message,
			});
		}
	};

	getUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const user = UserService.getUserByEmail(uid);
			if (!user) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.json(user);
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	updateUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const updated = await UserService.updateUser(uid, req.body);
			if (!updated) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.json(updated);
		} catch (error) {
			res.status(400).json({ message: (error as Error).message });
		}
	};

	deleteUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { uid } = req.params;
			const deleted = UserService.deleteUser(uid);
			if (!deleted) {
				res.status(404).json({ message: "User not found" });
				return;
			}
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ message: (error as Error).message });
		}
	};

	setThumbnailImage = async (req: Request, res: Response): Promise<void> => {
		try {
			const { imageId } = req.params;
			if (!imageId) {
				res.status(400).json({ success: false, message: "Image ID is required" });
				return;
			}

			const query = req.user?.id
				? { uid: req.user.id }
				: req.user?.email
				? { email: req.user.email }
				: null;

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user || !Array.isArray(user.images) || user.images.length === 0) {
				res.status(404).json({ success: false, message: "No images available for this user" });
				return;
			}

			let selectedImage: typeof user.images[number] | undefined;
			user.images.forEach((img) => {
				img.isThumbnail = false;
				if (img._id?.toString() === imageId || img.public_id === imageId) {
					selectedImage = img;
				}
			});

			if (!selectedImage) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

			selectedImage.isThumbnail = true;
			await user.save();

			const {
				password,
				profileImagePublicId,
				resetPasswordToken,
				resetPasswordExpire,
				...safeUser
			} = user.toObject();

			res.status(200).json({
				success: true,
				message: "Thumbnail updated successfully",
				data: safeUser,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to set thumbnail",
				error: (error as Error).message,
			});
		}
	};
}

