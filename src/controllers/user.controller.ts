import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { UserModel } from "../models/user.model";
import { SwipeModel } from "../models/swipe.model";
import { MatchModel } from "../models/match.model";
import { ConnectionModel } from "../models/connection.model";
import { ReportModel } from "../models/report.model";
import { UserService } from "../services/user.service";
import { CloudinaryService } from "../services/cloudinary.service";
import { isOnline } from "../services/presence.service";

export class UserController {
	private userService: UserService;

	constructor(userService: UserService = new UserService()) {
		this.userService = userService;
	}

	private resolveCurrentUserQuery = (
		req: Request
	): { uid: string } | { email: string } | null => {
		if (req.user?.id) {
			return { uid: req.user.id };
		}
		if (req.user?.email) {
			return { email: req.user.email };
		}
		return null;
	};

	getCurrentUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);

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

	getMyStats = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id images updatedAt");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const likes = Array.isArray(currentUser.images)
				? currentUser.images.reduce(
						(sum, image) => sum + (Array.isArray(image.likes) ? image.likes.length : 0),
						0
				  )
				: 0;

			const [profileViews, connectionMatches, modelMatches] = await Promise.all([
				SwipeModel.countDocuments({ swipedUser: currentUser._id }),
				ConnectionModel.countDocuments({
					$or: [{ userA: currentUser._id }, { userB: currentUser._id }],
				}),
				MatchModel.countDocuments({ users: { $in: [currentUser._id] } }),
			]);

			res.status(200).json({
				success: true,
				data: {
					views: profileViews,
					likes,
					matches: Math.max(connectionMatches, modelMatches),
					updatedAt: currentUser.updatedAt?.toISOString?.() ?? new Date().toISOString(),
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load profile stats",
				error: (error as Error).message,
			});
		}
	};

	getMyPostLikeNotifications = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select(
				"_id images notificationPreferences blockedUsers updatedAt"
			);
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			if (currentUser.notificationPreferences?.postLikes === false) {
				res.status(200).json({
					success: true,
					notifications: [],
					data: { notifications: [] },
				});
				return;
			}

			const blockedSet = new Set(currentUser.blockedUsers.map((id) => id.toString()));
			const likeEntries: Array<{
				notificationId: string;
				fromUserId: string;
				imageId: string;
			}> = [];

			(currentUser.images || []).forEach((image, index) => {
				const imageId =
					image._id?.toString() ||
					image.public_id ||
					image.url ||
					`image-${index + 1}`;
				(image.likes || []).forEach((likerId) => {
					const liker = likerId.toString();
					if (liker === currentUser._id.toString()) return;
					if (blockedSet.has(liker)) return;
					likeEntries.push({
						notificationId: `${imageId}:${liker}`,
						fromUserId: liker,
						imageId,
					});
				});
			});

			if (likeEntries.length === 0) {
				res.status(200).json({
					success: true,
					notifications: [],
					data: { notifications: [] },
				});
				return;
			}

			const uniqueLikerIds = Array.from(new Set(likeEntries.map((entry) => entry.fromUserId)));
			const likerUsers = await UserModel.find({ _id: { $in: uniqueLikerIds } })
				.select("_id firstname lastname profileImage image images blockedUsers")
				.lean();

			const blockedMeSet = new Set(
				likerUsers
					.filter((likerUser) =>
						Array.isArray(likerUser.blockedUsers) &&
						likerUser.blockedUsers.some((blockedId) => blockedId.equals(currentUser._id))
					)
					.map((likerUser) => likerUser._id.toString())
			);

			const likerMap = new Map(
				likerUsers.map((likerUser) => {
					const avatar =
						likerUser.profileImage ||
						likerUser.image ||
						likerUser.images?.find((img) => img?.isThumbnail)?.url ||
						likerUser.images?.[0]?.url ||
						"";
					const name =
						[likerUser.firstname, likerUser.lastname].filter(Boolean).join(" ").trim() ||
						"PairUp user";

					return [
						likerUser._id.toString(),
						{
							name,
							avatar,
						},
					];
				})
			);

			const notifications = likeEntries
				.filter((entry) => !blockedMeSet.has(entry.fromUserId))
				.map((entry) => {
					const liker = likerMap.get(entry.fromUserId);
					return {
						id: entry.notificationId,
						fromUserId: entry.fromUserId,
						imageId: entry.imageId,
						name: liker?.name || "PairUp user",
						image: liker?.avatar || "",
						createdAt: currentUser.updatedAt?.toISOString?.(),
						message: "liked your post",
					};
				});

			res.status(200).json({
				success: true,
				notifications,
				data: { notifications },
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load post like notifications",
				error: (error as Error).message,
			});
		}
	};

	getPublicUserProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const rawUserId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
			if (!rawUserId) {
				res.status(400).json({ success: false, message: "userId is required" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const targetQuery = mongoose.Types.ObjectId.isValid(rawUserId)
				? { $or: [{ _id: rawUserId }, { uid: rawUserId }] }
				: { uid: rawUserId };

			const targetUser = await UserModel.findOne(targetQuery).select(
				"_id uid firstname lastname age location bio interests profileImage image images lastSeen onlineVisibility privacy blockedUsers"
			);
			if (!targetUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			if (targetUser._id.equals(currentUser._id)) {
				res.status(200).json({
					success: true,
					data: {
						id: targetUser._id.toString(),
						isOwnProfile: true,
					},
				});
				return;
			}

			const blockedByMe = currentUser.blockedUsers.some((blockedId) =>
				blockedId.equals(targetUser._id)
			);
			const blockedMe = targetUser.blockedUsers.some((blockedId) =>
				blockedId.equals(currentUser._id)
			);

			if (blockedByMe || blockedMe) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const images = Array.isArray(targetUser.images)
				? targetUser.images
						.map((image, index) => {
							const imageId =
								image._id?.toString() ||
								image.public_id ||
								image.url ||
								`image-${index + 1}`;
							const likes = Array.isArray(image.likes) ? image.likes : [];

							return {
								id: imageId,
								url: image.url,
								isThumbnail: Boolean(image.isThumbnail),
								likesCount: likes.length,
								likedByMe: likes.some((id) => id.equals(currentUser._id)),
							};
						})
						.filter((image) => Boolean(image.url))
				: [];

			const profileImage =
				targetUser.profileImage ||
				targetUser.image ||
				images.find((image) => image.isThumbnail)?.url ||
				images[0]?.url ||
				"";

			const visibleLastSeen =
				targetUser.onlineVisibility !== false && targetUser.privacy?.showOnlineStatus !== false
					? targetUser.lastSeen ?? null
					: null;

			const totalImageLikes = images.reduce((sum, image) => sum + (image.likesCount ?? 0), 0);

			res.status(200).json({
				success: true,
				data: {
					id: targetUser._id.toString(),
					uid: targetUser.uid,
					firstname: targetUser.firstname,
					lastname: targetUser.lastname,
					age: targetUser.age,
					location: targetUser.location,
					bio: targetUser.bio,
					interests: Array.isArray(targetUser.interests) ? targetUser.interests : [],
					profileImage,
					images,
					isOwnProfile: false,
					lastSeen: visibleLastSeen,
					stats: {
						views: 0,
						likes: totalImageLikes,
						matches: 0,
					},
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load user profile",
				error: (error as Error).message,
			});
		}
	};

	deleteUserImage = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const imageId = typeof req.params.imageId === "string" ? req.params.imageId.trim() : "";
			if (!imageId) {
				res.status(400).json({ success: false, message: "Image ID is required" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			if (!Array.isArray(user.images) || user.images.length === 0) {
				res.status(404).json({ success: false, message: "No images available for this user" });
				return;
			}

			const imageIndex = user.images.findIndex(
				(image) => image._id?.toString() === imageId || image.public_id === imageId
			);
			if (imageIndex === -1) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

			const [removedImage] = user.images.splice(imageIndex, 1);
			if (!removedImage) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

			if (user.images.length > 0) {
				const hasThumbnail = user.images.some((image) => image.isThumbnail);
				if (!hasThumbnail || removedImage.isThumbnail) {
					user.images.forEach((image) => {
						image.isThumbnail = false;
					});
					user.images[0].isThumbnail = true;
				}
			}

			const nextProfileImage = user.images.find((image) => image.isThumbnail) || user.images[0];
			if (!nextProfileImage) {
				user.profileImage = "";
				user.profileImagePublicId = "";
			} else if (
				user.profileImage === removedImage.url ||
				user.profileImagePublicId === removedImage.public_id
			) {
				user.profileImage = nextProfileImage.url;
				user.profileImagePublicId = nextProfileImage.public_id;
			}

			await user.save();

			if (removedImage.public_id) {
				await CloudinaryService.deleteImage(removedImage.public_id).catch(() => {
					return;
				});
			}

			const {
				password,
				profileImagePublicId,
				resetPasswordToken,
				resetPasswordExpire,
				...safeUser
			} = user.toObject();

			res.status(200).json({
				success: true,
				message: "Image deleted successfully",
				data: safeUser,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to delete image",
				error: (error as Error).message,
			});
		}
	};

	reportUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const rawUserId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
			if (!rawUserId) {
				res.status(400).json({ success: false, message: "userId is required" });
				return;
			}

			const reason =
				typeof req.body.reason === "string" && req.body.reason.trim().length
					? req.body.reason.trim()
					: "User reported";

			const currentUser = await UserModel.findOne(query).select("_id");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const targetQuery = mongoose.Types.ObjectId.isValid(rawUserId)
				? { $or: [{ _id: rawUserId }, { uid: rawUserId }] }
				: { uid: rawUserId };
			const targetUser = await UserModel.findOne(targetQuery).select("_id");
			if (!targetUser) {
				res.status(404).json({ success: false, message: "Target user not found" });
				return;
			}

			if (currentUser._id.equals(targetUser._id)) {
				res.status(400).json({ success: false, message: "You cannot report yourself" });
				return;
			}

			const report = await ReportModel.create({
				reporter: currentUser._id,
				reportedUser: targetUser._id,
				reason,
			});

			res.status(201).json({
				success: true,
				message: "Report submitted successfully",
				data: {
					id: report._id.toString(),
					reportedUser: targetUser._id.toString(),
					reason: report.reason,
					status: report.status,
					createdAt: report.createdAt,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to submit report",
				error: (error as Error).message,
			});
		}
	};

	toggleUserImageLike = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const rawUserId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
			const rawImageId = typeof req.params.imageId === "string" ? req.params.imageId.trim() : "";

			if (!rawUserId || !rawImageId) {
				res.status(400).json({ success: false, message: "userId and imageId are required" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const targetQuery = mongoose.Types.ObjectId.isValid(rawUserId)
				? { $or: [{ _id: rawUserId }, { uid: rawUserId }] }
				: { uid: rawUserId };
			const targetUser = await UserModel.findOne(targetQuery).select("_id images blockedUsers");
			if (!targetUser) {
				res.status(404).json({ success: false, message: "Target user not found" });
				return;
			}

			if (targetUser._id.equals(currentUser._id)) {
				res.status(400).json({ success: false, message: "You cannot like your own post" });
				return;
			}

			const blockedByMe = currentUser.blockedUsers.some((blockedId) =>
				blockedId.equals(targetUser._id)
			);
			const blockedMe = targetUser.blockedUsers.some((blockedId) =>
				blockedId.equals(currentUser._id)
			);
			if (blockedByMe || blockedMe) {
				res.status(404).json({ success: false, message: "Target user not found" });
				return;
			}

			const targetImage = targetUser.images.find((image) => {
				const candidates = [image._id?.toString(), image.public_id, image.url].filter(
					(value): value is string => Boolean(value)
				);
				return candidates.includes(rawImageId);
			});

			if (!targetImage) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

			const likes = Array.isArray(targetImage.likes) ? targetImage.likes : [];
			const alreadyLiked = likes.some((id) => id.equals(currentUser._id));

			if (alreadyLiked) {
				targetImage.likes = likes.filter((id) => !id.equals(currentUser._id));
			} else {
				targetImage.likes = [...likes, currentUser._id];
			}

			await targetUser.save();

			res.status(200).json({
				success: true,
				message: alreadyLiked ? "Post unliked" : "Post liked",
				data: {
					liked: !alreadyLiked,
					likesCount: targetImage.likes.length,
					imageId: targetImage._id?.toString() || targetImage.public_id || rawImageId,
					userId: targetUser._id.toString(),
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update post like",
				error: (error as Error).message,
			});
		}
	};

	getMySettings = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query).select(
				"onlineVisibility notificationPreferences privacy blockedUsers"
			);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				data: {
					onlineVisibility: user.onlineVisibility !== false,
					notificationPreferences: {
						likes: user.notificationPreferences?.likes ?? true,
						postLikes: user.notificationPreferences?.postLikes ?? true,
						matches: user.notificationPreferences?.matches ?? true,
						messages: user.notificationPreferences?.messages ?? true,
					},
					privacy: {
						showAge: user.privacy?.showAge ?? true,
						showLocation: user.privacy?.showLocation ?? true,
						showOnlineStatus: user.privacy?.showOnlineStatus ?? true,
					},
					blockedUsers: Array.isArray(user.blockedUsers)
						? user.blockedUsers.map((id) => id.toString())
						: [],
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load settings",
				error: (error as Error).message,
			});
		}
	};

	updateOnlineVisibility = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const { onlineVisibility } = req.body;
			if (typeof onlineVisibility !== "boolean") {
				res.status(400).json({
					success: false,
					message: "onlineVisibility must be a boolean",
				});
				return;
			}

			const updatedUser = await UserModel.findOneAndUpdate(
				query,
				{ $set: { onlineVisibility } },
				{ new: true }
			).select("onlineVisibility");

			if (!updatedUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				message: "Visibility updated successfully",
				data: { onlineVisibility: updatedUser.onlineVisibility !== false },
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update visibility settings",
				error: (error as Error).message,
			});
		}
	};

	updateNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const allowedFields = ["likes", "postLikes", "matches", "messages"] as const;
			const updates: Record<string, boolean> = {};

			for (const field of allowedFields) {
				const value = req.body[field];
				if (typeof value === "undefined") continue;
				if (typeof value !== "boolean") {
					res.status(400).json({
						success: false,
						message: `${field} must be a boolean`,
					});
					return;
				}
				updates[`notificationPreferences.${field}`] = value;
			}

			if (Object.keys(updates).length === 0) {
				res.status(400).json({
					success: false,
					message: "At least one notification preference field is required",
				});
				return;
			}

			const updatedUser = await UserModel.findOneAndUpdate(
				query,
				{ $set: updates },
				{ new: true }
			).select("notificationPreferences");

			if (!updatedUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				message: "Notification settings updated successfully",
				data: {
					likes: updatedUser.notificationPreferences?.likes ?? true,
					postLikes: updatedUser.notificationPreferences?.postLikes ?? true,
					matches: updatedUser.notificationPreferences?.matches ?? true,
					messages: updatedUser.notificationPreferences?.messages ?? true,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update notification settings",
				error: (error as Error).message,
			});
		}
	};

	updatePrivacySettings = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const allowedFields = ["showAge", "showLocation", "showOnlineStatus"] as const;
			const updates: Record<string, boolean> = {};

			for (const field of allowedFields) {
				const value = req.body[field];
				if (typeof value === "undefined") continue;
				if (typeof value !== "boolean") {
					res.status(400).json({
						success: false,
						message: `${field} must be a boolean`,
					});
					return;
				}
				updates[`privacy.${field}`] = value;
			}

			if (Object.keys(updates).length === 0) {
				res.status(400).json({
					success: false,
					message: "At least one privacy field is required",
				});
				return;
			}

			const updatedUser = await UserModel.findOneAndUpdate(
				query,
				{ $set: updates },
				{ new: true }
			).select("privacy");

			if (!updatedUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				message: "Privacy settings updated successfully",
				data: {
					showAge: updatedUser.privacy?.showAge ?? true,
					showLocation: updatedUser.privacy?.showLocation ?? true,
					showOnlineStatus: updatedUser.privacy?.showOnlineStatus ?? true,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update privacy settings",
				error: (error as Error).message,
			});
		}
	};

	changePassword = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentPassword =
				typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
			const newPassword =
				typeof req.body.newPassword === "string" ? req.body.newPassword : "";

			if (!currentPassword || !newPassword) {
				res.status(400).json({
					success: false,
					message: "Current password and new password are required",
				});
				return;
			}

			if (newPassword.length < 6) {
				res.status(400).json({
					success: false,
					message: "New password must be at least 6 characters long",
				});
				return;
			}

			if (currentPassword === newPassword) {
				res.status(400).json({
					success: false,
					message: "New password must be different from current password",
				});
				return;
			}

			const user = await UserModel.findOne(query).select("password");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
			if (!isCurrentPasswordValid) {
				res.status(400).json({
					success: false,
					message: "Current password is incorrect",
				});
				return;
			}

			user.password = await bcrypt.hash(newPassword, 10);
			await user.save();

			res.status(200).json({
				success: true,
				message: "Password updated successfully",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update password",
				error: (error as Error).message,
			});
		}
	};

	getBlockedUsers = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const blockedIds = Array.isArray(currentUser.blockedUsers)
				? currentUser.blockedUsers.map((id) => id.toString())
				: [];

			if (blockedIds.length === 0) {
				res.status(200).json({ success: true, data: [] });
				return;
			}

			const blockedUsers = await UserModel.find({ _id: { $in: blockedIds } })
				.select("_id uid firstname lastname profileImage image images")
				.lean();

			const data = blockedUsers.map((blockedUser) => {
				const avatar =
					blockedUser.profileImage ||
					blockedUser.image ||
					blockedUser.images?.find((img) => img?.isThumbnail)?.url ||
					blockedUser.images?.[0]?.url ||
					"";

				return {
					id: blockedUser._id.toString(),
					uid: blockedUser.uid,
					name: [blockedUser.firstname, blockedUser.lastname].filter(Boolean).join(" ").trim(),
					avatar,
				};
			});

			res.status(200).json({ success: true, data });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load blocked users",
				error: (error as Error).message,
			});
		}
	};

	blockUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const rawUserId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
			if (!rawUserId) {
				res.status(400).json({ success: false, message: "userId is required" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const targetQuery = mongoose.Types.ObjectId.isValid(rawUserId)
				? { $or: [{ _id: rawUserId }, { uid: rawUserId }] }
				: { uid: rawUserId };
			const targetUser = await UserModel.findOne(targetQuery).select("_id uid");

			if (!targetUser) {
				res.status(404).json({ success: false, message: "Target user not found" });
				return;
			}

			if (currentUser._id.equals(targetUser._id)) {
				res.status(400).json({ success: false, message: "You cannot block yourself" });
				return;
			}

			const alreadyBlocked = currentUser.blockedUsers.some((id) => id.equals(targetUser._id));
			if (alreadyBlocked) {
				res.status(200).json({ success: true, message: "User is already blocked" });
				return;
			}

			currentUser.blockedUsers.push(targetUser._id);
			await currentUser.save();

			res.status(200).json({ success: true, message: "User blocked successfully" });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to block user",
				error: (error as Error).message,
			});
		}
	};

	unblockUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const rawUserId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
			if (!rawUserId) {
				res.status(400).json({ success: false, message: "userId is required" });
				return;
			}

			const currentUser = await UserModel.findOne(query).select("_id blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const targetQuery = mongoose.Types.ObjectId.isValid(rawUserId)
				? { $or: [{ _id: rawUserId }, { uid: rawUserId }] }
				: { uid: rawUserId };
			const targetUser = await UserModel.findOne(targetQuery).select("_id");

			if (!targetUser) {
				res.status(404).json({ success: false, message: "Target user not found" });
				return;
			}

			currentUser.blockedUsers = currentUser.blockedUsers.filter(
				(id) => !id.equals(targetUser._id)
			);
			await currentUser.save();

			res.status(200).json({ success: true, message: "User unblocked successfully" });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to unblock user",
				error: (error as Error).message,
			});
		}
	};

	deleteMyAccount = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query).select("_id profileImagePublicId");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			await Promise.all([
				SwipeModel.deleteMany({
					$or: [{ swiper: user._id }, { swipedUser: user._id }],
				}),
				UserModel.updateMany(
					{ blockedUsers: user._id },
					{ $pull: { blockedUsers: user._id } }
				),
				UserModel.deleteOne({ _id: user._id }),
			]);

			if (user.profileImagePublicId) {
				await CloudinaryService.deleteImage(user.profileImagePublicId).catch(() => {
					return;
				});
			}

			res.status(200).json({ success: true, message: "Account deleted successfully" });
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to delete account",
				error: (error as Error).message,
			});
		}
	};

	updateProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const query = this.resolveCurrentUserQuery(req);

			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const { gender, interestedIn, preference, age, location, interests, bio } = req.body;

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

			const interestedInValue =
				typeof interestedIn === "string"
					? interestedIn
					: typeof preference === "string"
					? preference
					: undefined;

			if (typeof interestedInValue === "string" && interestedInValue.trim()) {
				const normalizedInterestedIn = interestedInValue.trim().toLowerCase();
				const allowedInterestedIn = ["male", "female"];
				if (!allowedInterestedIn.includes(normalizedInterestedIn)) {
					res.status(400).json({
						success: false,
						message: "Invalid interestedIn value",
					});
					return;
				}
				user.interestedIn = normalizedInterestedIn as typeof user.interestedIn;
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
						likes: [],
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

			user.isProfileComplete = Boolean(user.gender && user.interestedIn && user.age && user.location);

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
				likes: [],
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
				"_id uid interestedIn"
			);
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const excludeSelf = String(req.query.excludeSelf || "false").toLowerCase() === "true";
			const interestedIn =
				typeof currentUser.interestedIn === "string" &&
				["male", "female"].includes(currentUser.interestedIn.trim().toLowerCase())
					? (currentUser.interestedIn.trim().toLowerCase() as "male" | "female")
					: undefined;
			const genderPreferenceFilter = interestedIn ? { gender: interestedIn } : {};
			const usersQuery = {
				role: { $ne: "admin" },
				...genderPreferenceFilter,
				...(excludeSelf ? { _id: { $ne: currentUser._id } } : {}),
			};

			const users = await UserModel.find(usersQuery)
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

			const currentUser = await UserModel.findOne(query).select("_id interestedIn");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const includePreviousParam = String(req.query.includePrevious || "true").toLowerCase();
			const includePrevious = includePreviousParam !== "false";
			const interestedIn =
				typeof currentUser.interestedIn === "string" &&
				["male", "female"].includes(currentUser.interestedIn.trim().toLowerCase())
					? (currentUser.interestedIn.trim().toLowerCase() as "male" | "female")
					: undefined;
			const genderPreferenceFilter = interestedIn ? { gender: interestedIn } : {};

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
							          likes: [],
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
				...genderPreferenceFilter,
			})
				.select("_id firstname lastname age bio images profileImage profileImagePublicId")
				.lean();

			const previousUsers = includePrevious
				? await UserModel.find({
					_id: { $in: swipedIds },
					role: { $ne: "admin" },
					...genderPreferenceFilter,
				})
						.select("_id firstname lastname age bio images profileImage profileImagePublicId")
						.lean()
				: [];

			const recycledUsers: typeof freshUsers = await UserModel.find({
				_id: { $nin: [currentUser._id] },
				role: { $ne: "admin" },
				...genderPreferenceFilter,
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
