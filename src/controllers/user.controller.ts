import { Request, Response } from "express";

import { UserModel } from "../models/user.model";
import { SwipeModel } from "../models/swipe.model";
import { UserService } from "../services/user.service";
import { CloudinaryService } from "../services/cloudinary.service";
import { isOnline } from "../services/presence.service";

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

				if (!Array.isArray(user.images)) {
					user.images = [];
				}

				let thumbnailEntry = user.images.find((img) => img.isThumbnail) ?? user.images[0];

				if (!thumbnailEntry) {
					user.images.push({
						url: uploaded.url,
						public_id: uploaded.publicId,
						isThumbnail: true,
					});
					thumbnailEntry = user.images[user.images.length - 1];
				} else {
					thumbnailEntry.url = uploaded.url;
					thumbnailEntry.public_id = uploaded.publicId;
					thumbnailEntry.isThumbnail = true;
				}

				user.images.forEach((img) => {
					if (img !== thumbnailEntry) {
						img.isThumbnail = false;
					}
				});

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

	getAllUsers = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorId = req.user?.id || req.user?.mongoId || (req.user as any)?._id;
			if (!actorId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentUser = await UserModel.findOne({ $or: [{ uid: actorId }, { _id: actorId }] }).select(
				"_id uid"
			);
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const excludeSelf = String(req.query.excludeSelf || "false").toLowerCase() === "true";

			const users = await UserModel.find(
				excludeSelf
					? { _id: { $ne: currentUser._id }, role: { $ne: "admin" } }
					: { role: { $ne: "admin" } }
			)
				.select(
					"_id uid firstname lastname email profileImage image images age location bio interests isProfileComplete"
				)
				.lean();

			const formatted = users.map((user) => {
				const avatar =
					user.profileImage ||
					user.image ||
					user.images?.find((img) => img?.isThumbnail)?.url ||
					user.images?.[0]?.url ||
					"";

				return {
					id: user._id.toString(),
					uid: user.uid,
					firstname: user.firstname,
					lastname: user.lastname,
					age: user.age,
					location: user.location,
					avatar,
					bio: user.bio,
					interests: user.interests,
					isProfileComplete: user.isProfileComplete,
					status: isOnline(user._id.toString()) ? "online" : "offline",
				};
			});

			res.status(200).json({ success: true, users: formatted, data: formatted, count: formatted.length });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load users",
				error: (error as Error).message,
			});
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

			const currentUser = await UserModel.findOne(query).select("_id");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const includePreviousParam = String(req.query.includePrevious || "true").toLowerCase();
			const includePrevious = includePreviousParam !== "false";

			const swipeDocs = await SwipeModel.find({ swiper: currentUser._id })
				.select("swipedUser")
				.lean();
			const swipedIds = swipeDocs
				.map((doc) => doc.swipedUser)
				.filter((id): id is typeof currentUser._id => Boolean(id));
			const exclusionIds = [currentUser._id, ...swipedIds];

			const formatUsers = (users: any[]) =>
				users.flatMap((user) => {
					const gallery = Array.isArray(user.images) ? user.images.filter(Boolean) : [];
					const normalizedImages =
						gallery.length > 0
							? gallery
							: user.profileImage
							? [
							      {
							          url: user.profileImage,
							          public_id: user.profileImagePublicId || user.profileImage,
							          isThumbnail: true,
							      },
						      ]
							: [];

					if (normalizedImages.length === 0) {
						return [];
					}

					return [
						{
							_id: user._id,
							name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
							age: user.age ?? null,
							bio: user.bio ?? "",
							images: normalizedImages,
						},
					];
				});

			const freshUsers = await UserModel.find({
				_id: { $nin: exclusionIds },
				isProfileComplete: true,
				role: { $ne: "admin" },
			})
				.select("_id firstname lastname age bio images profileImage profileImagePublicId")
				.lean();

			const previousUsers = includePrevious
				? await UserModel.find({
					_id: { $in: swipedIds },
					role: { $ne: "admin" },
				})
						.select("_id firstname lastname age bio images profileImage profileImagePublicId")
						.lean()
				: [];

			const recycledUsers: typeof freshUsers = await UserModel.find({
				_id: { $nin: [currentUser._id] },
				role: { $ne: "admin" },
			})
				.select("_id firstname lastname age bio images profileImage profileImagePublicId")
				.limit(50)
				.lean();

			const seen = new Set<string>();
			const merged = [...freshUsers, ...previousUsers, ...recycledUsers].filter((u) => {
				const id = u._id.toString();
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			});

			const formattedUsers = formatUsers(merged);

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
