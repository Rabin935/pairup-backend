import { Request, Response } from "express";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";

import { UserModel } from "../models/user.model";
import { SwipeModel } from "../models/swipe.model";
import { LikeModel } from "../models/like.model";
import { MatchModel } from "../models/match.model";
import { MessageModel } from "../models/message.model";
import { ConversationModel } from "../models/conversation.model";
import { ConnectionModel } from "../models/connection.model";
import { InvitationModel } from "../models/invitation.model";
import { ReportModel } from "../models/report.model";
import { PostLikeModel } from "../models/post-like.model";
import { UserService } from "../services/user.service";
import { CloudinaryService } from "../services/cloudinary.service";
import { isOnline } from "../services/presence.service";

export class UserController {
	private userService: UserService;

	constructor(userService: UserService = new UserService()) {
		this.userService = userService;
	}

	private resolveActorQuery(req: Request): { uid: string } | { email: string } | null {
		if (req.user?.id) {
			return { uid: req.user.id };
		}
		if (req.user?.email) {
			return { email: req.user.email };
		}
		return null;
	}

	private resolveActorMongoId(req: Request): string | null {
		const actorMongoId = req.user?.mongoId || req.user?._id;
		if (!actorMongoId || !Types.ObjectId.isValid(actorMongoId)) {
			return null;
		}
		return actorMongoId;
	}

	private normalizeLocation(value: string | undefined): string {
		return (value || "").trim().toLowerCase();
	}

	private toInterestSet(value: unknown): Set<string> {
		if (Array.isArray(value)) {
			return new Set(
				value
					.map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
					.filter(Boolean)
			);
		}
		if (typeof value === "string") {
			return new Set(
				value
					.split(",")
					.map((entry) => entry.trim().toLowerCase())
					.filter(Boolean)
			);
		}
		return new Set<string>();
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

	getCurrentUserStats = async (req: Request, res: Response): Promise<void> => {
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

			const user = await UserModel.findOne(query).select("_id");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const [viewerIds, likesReceived, matchesCount] = await Promise.all([
				SwipeModel.distinct("swiper", { swipedUser: user._id }),
				LikeModel.countDocuments({
					receiver: user._id,
					status: { $ne: "declined" },
				}),
				MatchModel.countDocuments({ users: { $in: [user._id] } }),
			]);

			res.status(200).json({
				success: true,
				data: {
					views: viewerIds.length,
					likes: likesReceived,
					matches: matchesCount,
					updatedAt: new Date().toISOString(),
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to retrieve profile stats",
				error: (error as Error).message,
			});
		}
		};

	getPublicUserProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId } = req.params;
			if (!userId) {
				res.status(400).json({ success: false, message: "userId is required" });
				return;
			}

			const actorMongoId = this.resolveActorMongoId(req);
			const query = Types.ObjectId.isValid(userId)
				? { $or: [{ _id: userId }, { uid: userId }] }
				: { uid: userId };

				const user = await UserModel.findOne(query).select(
					"_id uid firstname lastname age location bio interests gender profileImage image images role isBanned lastSeen updatedAt privacy blockedUsers"
				);

				if (!user || user.role === "admin") {
					res.status(404).json({ success: false, message: "User not found" });
					return;
				}

				const isOwnProfile = actorMongoId ? actorMongoId === user._id.toString() : false;
				if (actorMongoId && !isOwnProfile) {
					const actor = await UserModel.findById(actorMongoId).select("_id blockedUsers");
					if (!actor) {
						res.status(401).json({ success: false, message: "Unauthorized" });
						return;
					}
					const actorBlocked = Array.isArray(actor.blockedUsers)
						? actor.blockedUsers.some((entry) => entry.toString() === user._id.toString())
						: false;
					const targetBlocked = Array.isArray(user.blockedUsers)
						? user.blockedUsers.some((entry) => entry.toString() === actorMongoId)
						: false;
					if (actorBlocked || targetBlocked) {
						res.status(404).json({ success: false, message: "User not found" });
						return;
					}
				}

			const [viewerIds, likesReceived, matchesCount] = await Promise.all([
				SwipeModel.distinct("swiper", { swipedUser: user._id }),
				LikeModel.countDocuments({
					receiver: user._id,
					status: { $ne: "declined" },
				}),
				MatchModel.countDocuments({ users: { $in: [user._id] } }),
			]);

			const images = (Array.isArray(user.images) ? user.images : []).map((image) => {
				const likes = Array.isArray(image.likes)
					? image.likes.map((entry) => entry.toString())
					: [];

				return {
					id: image._id?.toString() || image.public_id,
					url: image.url,
					public_id: image.public_id,
					isThumbnail: Boolean(image.isThumbnail),
					likesCount: likes.length,
					likedByMe: actorMongoId ? likes.includes(actorMongoId) : false,
				};
			});

				res.status(200).json({
					success: true,
					data: {
						id: user._id.toString(),
						uid: user.uid,
						firstname: user.firstname,
						lastname: user.lastname,
						age: user.privacy?.showAge === false && !isOwnProfile ? undefined : user.age,
						location:
							user.privacy?.showLocation === false && !isOwnProfile ? undefined : user.location,
						bio: user.bio,
						interests: Array.isArray(user.interests) ? user.interests : [],
						gender: user.gender,
					profileImage:
						user.profileImage ||
						user.image ||
						images.find((img) => img.isThumbnail)?.url ||
						images[0]?.url ||
						"",
						images,
						isBanned: Boolean(user.isBanned),
						lastSeen:
							user.privacy?.showOnlineStatus === false && !isOwnProfile
								? null
								: user.lastSeen || user.updatedAt || null,
						isOwnProfile,
						stats: {
						views: viewerIds.length,
						likes: likesReceived,
						matches: matchesCount,
					},
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to retrieve user profile",
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

			const { gender, interestedIn, age, location, interests, bio } = req.body;

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

			if (typeof interestedIn === "string" && interestedIn.trim()) {
				const normalizedInterestedIn = interestedIn.trim().toLowerCase();
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
			const actorMongoId = this.resolveActorMongoId(req);
			const actorUid = req.user?.id;
			const actorEmail = req.user?.email;
			if (!actorMongoId && !actorUid && !actorEmail) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const actorConditions: Record<string, unknown>[] = [];
			if (actorUid) actorConditions.push({ uid: actorUid });
			if (actorEmail) actorConditions.push({ email: actorEmail });
			if (actorMongoId) actorConditions.push({ _id: actorMongoId });

			const currentUser = await UserModel.findOne(
				actorConditions.length === 1 ? actorConditions[0] : { $or: actorConditions }
			).select("_id uid gender interestedIn location interests updatedAt blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const blockedByCurrent = Array.isArray(currentUser.blockedUsers)
				? currentUser.blockedUsers.map((id) => id.toString())
				: [];

			const usersBlockingCurrent = await UserModel.find({ blockedUsers: currentUser._id })
				.select("_id")
				.lean();
			const blockedByOthers = usersBlockingCurrent.map((user) => user._id.toString());
			const blockedSet = new Set<string>([...blockedByCurrent, ...blockedByOthers]);

			const excludeSelf = String(req.query.excludeSelf || "false").toLowerCase() === "true";
			const excludeLiked = String(req.query.excludeLiked || "false").toLowerCase() === "true";
			const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
			const searchRegex = search ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

			const baseFilter: Record<string, unknown> = {
				role: { $ne: "admin" },
				isBanned: { $ne: true },
			};

			if (excludeSelf) {
				baseFilter._id = { $ne: currentUser._id };
			}

			const users = await UserModel.find(baseFilter)
					.select(
						"_id uid firstname lastname email profileImage image images age location bio interests gender interestedIn isProfileComplete updatedAt onlineVisibility privacy"
					)
					.lean();

			const interestedGender =
				typeof currentUser.interestedIn === "string"
					? currentUser.interestedIn.trim().toLowerCase()
					: "";

			const visibleUsers = users.filter((user) => {
				const userId = user._id.toString();
				if (excludeSelf && userId === currentUser._id.toString()) return false;
				if (blockedSet.has(userId)) return false;
				if (interestedGender) {
					const candidateGender =
						typeof user.gender === "string" ? user.gender.trim().toLowerCase() : "";
					if (!candidateGender || candidateGender !== interestedGender) return false;
				}
				if (!searchRegex) return true;
				const name = `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim();
				return searchRegex.test(name) || searchRegex.test(user.email || "");
			});

			const candidateIds = visibleUsers.map((user) => user._id);
			const currentUserInterests = this.toInterestSet(currentUser.interests);
			const currentLocation = this.normalizeLocation(currentUser.location);

			const [likesFromCurrent, likesToCurrent, currentUserMatches] = await Promise.all([
				LikeModel.find({
					sender: currentUser._id,
					receiver: { $in: candidateIds },
				})
					.select("receiver status")
					.lean(),
				LikeModel.find({
					receiver: currentUser._id,
					sender: { $in: candidateIds },
					status: { $in: ["pending", "accepted"] },
				})
					.select("sender")
					.lean(),
				MatchModel.find({ users: currentUser._id }).select("users").lean(),
			]);

			const likedByCurrentSet = new Set(likesFromCurrent.map((entry) => entry.receiver.toString()));
			const likesFromCurrentSet = new Set(
				likesFromCurrent
					.filter((entry) => entry.status === "pending" || entry.status === "accepted")
					.map((entry) => entry.receiver.toString())
			);
			const likesToCurrentSet = new Set(likesToCurrent.map((entry) => entry.sender.toString()));
			const matchSet = new Set<string>();
			currentUserMatches.forEach((match) => {
				match.users.forEach((userId) => {
					const id = userId.toString();
					if (id !== currentUser._id.toString()) {
						matchSet.add(id);
					}
				});
			});

			const discoverableUsers = excludeLiked
				? visibleUsers.filter((user) => !likedByCurrentSet.has(user._id.toString()))
				: visibleUsers;

			const scored = discoverableUsers.map((user) => {
				const avatar =
					user.profileImage ||
					user.image ||
					user.images?.find((img) => img?.isThumbnail)?.url ||
					user.images?.[0]?.url ||
					"";
				const userId = user._id.toString();
				const sharedInterestsCount = Array.from(this.toInterestSet(user.interests)).filter((interest) =>
					currentUserInterests.has(interest)
				).length;
				const sameLocation =
					this.normalizeLocation(user.location) !== "" &&
					this.normalizeLocation(user.location) === currentLocation;
				const mutualLike = likesFromCurrentSet.has(userId) && likesToCurrentSet.has(userId);
				const isMatched = matchSet.has(userId);
				const recentlyActiveAt = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
				const now = Date.now();
				const activityScore =
					recentlyActiveAt > now - 24 * 60 * 60 * 1000
						? 20
						: recentlyActiveAt > now - 7 * 24 * 60 * 60 * 1000
						? 10
						: recentlyActiveAt > now - 30 * 24 * 60 * 60 * 1000
						? 5
						: 0;

				const recommendationScore =
					(sharedInterestsCount * 10) +
					(sameLocation ? 30 : 0) +
					(mutualLike ? 25 : 0) +
					(isMatched ? 20 : 0) +
					activityScore +
					(user.isProfileComplete ? 5 : 0);

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
					status:
						user.onlineVisibility !== false && user.privacy?.showOnlineStatus !== false && isOnline(user._id.toString())
							? "online"
							: "offline",
					recommendationScore,
				};
			});

			scored.sort((a, b) => {
				if (b.recommendationScore !== a.recommendationScore) {
					return b.recommendationScore - a.recommendationScore;
				}
				return (b.firstname || "").localeCompare(a.firstname || "");
			});

			const formatted = scored.map(({ recommendationScore, ...user }) => user);

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

				const currentUser = await UserModel.findOne(query).select("_id gender interestedIn isProfileComplete blockedUsers");
			if (!currentUser) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			if (!currentUser.isProfileComplete || !currentUser.interestedIn) {
				res.status(403).json({
					success: false,
					code: "PROFILE_INCOMPLETE",
					message: "Complete your profile and choose who you are interested in to access Discover.",
				});
				return;
			}

			const includePreviousParam = String(req.query.includePrevious || "false").toLowerCase();
			const includePrevious = includePreviousParam === "true";

				const swipeDocs = await SwipeModel.find({ swiper: currentUser._id })
					.select("swipedUser")
					.lean();
				const swipedIds = swipeDocs
					.map((doc) => doc.swipedUser)
					.filter((id): id is typeof currentUser._id => Boolean(id));
				const blockedByCurrent = Array.isArray(currentUser.blockedUsers)
					? currentUser.blockedUsers
					: [];
				const blockedByOthers = await UserModel.find({ blockedUsers: currentUser._id })
					.select("_id")
					.lean();
				const blockedIds = blockedByOthers.map((user) => user._id);
				const exclusionIds = [currentUser._id, ...swipedIds, ...blockedByCurrent, ...blockedIds];

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
							location: user.location ?? "",
							interests: Array.isArray(user.interests) ? user.interests : [],
							gender: user.gender ?? "",
							images: normalizedImages,
						},
					];
				});

			const freshUsers = await UserModel.find({
				_id: { $nin: exclusionIds },
				isProfileComplete: true,
				gender: currentUser.interestedIn,
				role: { $ne: "admin" },
			})
				.select("_id firstname lastname age bio location interests gender images profileImage profileImagePublicId")
				.lean();

			const previousUsers = includePrevious
				? await UserModel.find({
					_id: { $in: swipedIds },
					gender: currentUser.interestedIn,
					role: { $ne: "admin" },
				})
						.select("_id firstname lastname age bio location interests gender images profileImage profileImagePublicId")
						.lean()
				: [];

			const recycledUsers: typeof freshUsers = await UserModel.find({
				_id: { $nin: exclusionIds },
				isProfileComplete: true,
				gender: currentUser.interestedIn,
				role: { $ne: "admin" },
			})
				.select("_id firstname lastname age bio location interests gender images profileImage profileImagePublicId")
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

	deleteOwnImage = async (req: Request, res: Response): Promise<void> => {
		try {
			const { imageId } = req.params;
			if (!imageId) {
				res.status(400).json({ success: false, message: "Image ID is required" });
				return;
			}

			const query = this.resolveActorQuery(req);
			if (!query) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findOne(query);
			if (!user || !Array.isArray(user.images) || user.images.length === 0) {
				res.status(404).json({ success: false, message: "No images available for this user" });
				return;
			}

			const targetIndex = user.images.findIndex(
				(img) => img._id?.toString() === imageId || img.public_id === imageId
			);
			if (targetIndex === -1) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

				const [removedImage] = user.images.splice(targetIndex, 1);
				const removedImageId = removedImage?._id?.toString() || removedImage?.public_id;

				if (removedImage?.public_id) {
					await CloudinaryService.deleteImage(removedImage.public_id);
				}
				if (removedImageId) {
					await PostLikeModel.deleteMany({
						owner: user._id,
						imageId: removedImageId,
					});
				}

			if (user.images.length > 0) {
				const nextThumbnail =
					user.images.find((img) => img.isThumbnail) ?? user.images[0];
				user.images.forEach((img) => {
					img.isThumbnail = img === nextThumbnail;
				});
				user.profileImage = nextThumbnail.url;
				user.profileImagePublicId = nextThumbnail.public_id;
			} else {
				user.profileImage = "";
				user.profileImagePublicId = "";
			}

			await user.save();

			res.status(200).json({
				success: true,
				message: "Image deleted successfully",
				data: {
					images: user.images,
					profileImage: user.profileImage,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to delete image",
				error: (error as Error).message,
			});
		}
	};

		likeUserImage = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId, imageId } = req.params;
			const actorMongoId = this.resolveActorMongoId(req);

			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			if (!userId || !imageId) {
				res.status(400).json({ success: false, message: "userId and imageId are required" });
				return;
			}

			const targetQuery = Types.ObjectId.isValid(userId)
				? { $or: [{ _id: userId }, { uid: userId }] }
				: { uid: userId };

			const targetUser = await UserModel.findOne(targetQuery);
			if (!targetUser || targetUser.role === "admin") {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

				if (targetUser._id.toString() === actorMongoId) {
					res.status(400).json({ success: false, message: "You cannot like your own image" });
					return;
				}

				const actor = await UserModel.findById(actorMongoId).select("blockedUsers");
				if (!actor) {
					res.status(401).json({ success: false, message: "Unauthorized" });
					return;
				}
				const actorBlockedTarget = Array.isArray(actor.blockedUsers)
					? actor.blockedUsers.some((entry) => entry.toString() === targetUser._id.toString())
					: false;
				const targetBlockedActor = Array.isArray(targetUser.blockedUsers)
					? targetUser.blockedUsers.some((entry) => entry.toString() === actorMongoId)
					: false;
				if (actorBlockedTarget || targetBlockedActor) {
					res.status(403).json({ success: false, message: "Action not allowed for blocked users" });
					return;
				}

			const targetImage = targetUser.images.find(
				(img) => img._id?.toString() === imageId || img.public_id === imageId
			);

			if (!targetImage) {
				res.status(404).json({ success: false, message: "Image not found" });
				return;
			}

			if (!Array.isArray(targetImage.likes)) {
				targetImage.likes = [];
			}

			const existingIndex = targetImage.likes.findIndex(
				(likeUserId) => likeUserId.toString() === actorMongoId
			);

				let liked = false;
				if (existingIndex >= 0) {
					targetImage.likes.splice(existingIndex, 1);
					await PostLikeModel.deleteOne({
						owner: targetUser._id,
						likedBy: new Types.ObjectId(actorMongoId),
						imageId: targetImage._id?.toString() || targetImage.public_id,
					});
					liked = false;
				} else {
					targetImage.likes.push(new Types.ObjectId(actorMongoId));
					await PostLikeModel.updateOne(
						{
							owner: targetUser._id,
							likedBy: new Types.ObjectId(actorMongoId),
							imageId: targetImage._id?.toString() || targetImage.public_id,
						},
						{ $setOnInsert: { owner: targetUser._id, likedBy: new Types.ObjectId(actorMongoId), imageId: targetImage._id?.toString() || targetImage.public_id } },
						{ upsert: true }
					);
					liked = true;
				}

			await targetUser.save();

			res.status(200).json({
				success: true,
				message: liked ? "Image liked" : "Image unliked",
				data: {
					liked,
					likesCount: targetImage.likes.length,
					imageId: targetImage._id?.toString() || targetImage.public_id,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to like image",
				error: (error as Error).message,
			});
			}
		};

		getPostLikeNotifications = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const actor = await UserModel.findById(actorMongoId).select("notificationPreferences");
			if (!actor) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			if (actor.notificationPreferences?.postLikes === false) {
				res.status(200).json({ success: true, notifications: [] });
				return;
			}

			const notifications = await PostLikeModel.find({ owner: actorMongoId })
				.populate("likedBy", "_id firstname lastname profileImage image images")
				.sort({ createdAt: -1 })
				.limit(100)
				.lean();

			const formatted = notifications
				.map((entry) => {
					const likedBy = entry.likedBy as unknown as {
						_id?: Types.ObjectId;
						firstname?: string;
						lastname?: string;
						profileImage?: string;
						image?: string;
						images?: Array<{ url?: string; isThumbnail?: boolean }>;
					};
					if (!likedBy?._id) return null;

					return {
						id: entry._id.toString(),
						type: "postLike",
						fromUserId: likedBy._id.toString(),
						imageId: entry.imageId,
						name: `${likedBy.firstname ?? ""} ${likedBy.lastname ?? ""}`.trim() || "PairUp user",
						image:
							likedBy.profileImage ||
							likedBy.image ||
							likedBy.images?.find((img) => img.isThumbnail)?.url ||
							likedBy.images?.[0]?.url ||
							"",
						createdAt: entry.createdAt,
						message: "liked your post",
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

			res.status(200).json({
				success: true,
				notifications: formatted,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load post like notifications",
				error: (error as Error).message,
			});
			}
		};

	getNotifications = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const actor = await UserModel.findById(actorMongoId).select("notificationPreferences");
			if (!actor) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const ownerId = new Types.ObjectId(actorMongoId);

			const [likes, invites, postLikes] = await Promise.all([
				actor.notificationPreferences?.likes === false
					? Promise.resolve([])
					: LikeModel.find({ receiver: ownerId })
							.populate("sender", "_id firstname lastname profileImage image images")
							.sort({ createdAt: -1 })
							.limit(100)
							.lean(),
				actor.notificationPreferences?.matches === false
					? Promise.resolve([])
					: InvitationModel.find({ toUser: ownerId })
							.populate("fromUser", "_id firstname lastname profileImage image images")
							.sort({ createdAt: -1 })
							.limit(100)
							.lean(),
				actor.notificationPreferences?.postLikes === false
					? Promise.resolve([])
					: PostLikeModel.find({ owner: ownerId })
							.populate("likedBy", "_id firstname lastname profileImage image images")
							.sort({ createdAt: -1 })
							.limit(100)
							.lean(),
			]);

			const likeNotifications = likes
				.map((entry) => {
					const sender = entry.sender as unknown as {
						_id?: Types.ObjectId;
						firstname?: string;
						lastname?: string;
						profileImage?: string;
						image?: string;
						images?: Array<{ url?: string; isThumbnail?: boolean }>;
					};
					if (!sender?._id) return null;

					return {
						id: entry._id.toString(),
						type: "like",
						fromUserId: sender._id.toString(),
						name: `${sender.firstname ?? ""} ${sender.lastname ?? ""}`.trim() || "PairUp user",
						image:
							sender.profileImage ||
							sender.image ||
							sender.images?.find((img) => img.isThumbnail)?.url ||
							sender.images?.[0]?.url ||
							"",
						createdAt: entry.createdAt,
						isRead: Boolean(entry.seenAt),
						readAt: entry.seenAt ?? null,
						status: entry.status,
						message: "liked your profile",
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

			const inviteNotifications = invites
				.map((entry) => {
					const fromUser = entry.fromUser as unknown as {
						_id?: Types.ObjectId;
						firstname?: string;
						lastname?: string;
						profileImage?: string;
						image?: string;
						images?: Array<{ url?: string; isThumbnail?: boolean }>;
					};
					if (!fromUser?._id) return null;

					return {
						id: entry._id.toString(),
						type: "invite",
						fromUserId: fromUser._id.toString(),
						name: `${fromUser.firstname ?? ""} ${fromUser.lastname ?? ""}`.trim() || "PairUp user",
						image:
							fromUser.profileImage ||
							fromUser.image ||
							fromUser.images?.find((img) => img.isThumbnail)?.url ||
							fromUser.images?.[0]?.url ||
							"",
						createdAt: entry.createdAt,
						isRead: Boolean(entry.seenAt),
						readAt: entry.seenAt ?? null,
						status: entry.status,
						message: "sent you a match request",
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

			const postLikeNotifications = postLikes
				.map((entry) => {
					const likedBy = entry.likedBy as unknown as {
						_id?: Types.ObjectId;
						firstname?: string;
						lastname?: string;
						profileImage?: string;
						image?: string;
						images?: Array<{ url?: string; isThumbnail?: boolean }>;
					};
					if (!likedBy?._id) return null;

					return {
						id: entry._id.toString(),
						type: "postLike",
						fromUserId: likedBy._id.toString(),
						imageId: entry.imageId,
						name: `${likedBy.firstname ?? ""} ${likedBy.lastname ?? ""}`.trim() || "PairUp user",
						image:
							likedBy.profileImage ||
							likedBy.image ||
							likedBy.images?.find((img) => img.isThumbnail)?.url ||
							likedBy.images?.[0]?.url ||
							"",
						createdAt: entry.createdAt,
						isRead: Boolean(entry.seenAt),
						readAt: entry.seenAt ?? null,
						status: "received",
						message: "liked your post",
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

			const notifications = [...likeNotifications, ...inviteNotifications, ...postLikeNotifications].sort(
				(a, b) => {
					const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
					const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
					return right - left;
				}
			);

			const unreadCount = notifications.reduce(
				(total, notification) => total + (notification.isRead ? 0 : 1),
				0
			);

			res.status(200).json({
				success: true,
				data: {
					notifications,
					unreadCount,
					total: notifications.length,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load notifications",
				error: (error as Error).message,
			});
		}
	};

	markNotificationsRead = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const ownerId = new Types.ObjectId(actorMongoId);
			const now = new Date();
			const readFilter = { $or: [{ seenAt: null }, { seenAt: { $exists: false } }] };

			const items: Array<{ type?: unknown; id?: unknown }> = Array.isArray(req.body?.items)
				? req.body.items
				: [];
			const likeIds: Types.ObjectId[] = [];
			const inviteIds: Types.ObjectId[] = [];
			const postLikeIds: Types.ObjectId[] = [];

			items.forEach((item) => {
				if (!item || typeof item !== "object") return;
				const rawType = item.type;
				const rawId = item.id;
				if (typeof rawType !== "string" || typeof rawId !== "string") return;
				if (!Types.ObjectId.isValid(rawId)) return;
				const parsedId = new Types.ObjectId(rawId);

				if (rawType === "like") likeIds.push(parsedId);
				if (rawType === "invite") inviteIds.push(parsedId);
				if (rawType === "postLike") postLikeIds.push(parsedId);
			});

			let markedCount = 0;
			if (!likeIds.length && !inviteIds.length && !postLikeIds.length) {
				const [likesResult, invitesResult, postLikesResult] = await Promise.all([
					LikeModel.updateMany({ receiver: ownerId, ...readFilter }, { $set: { seenAt: now } }),
					InvitationModel.updateMany({ toUser: ownerId, ...readFilter }, { $set: { seenAt: now } }),
					PostLikeModel.updateMany({ owner: ownerId, ...readFilter }, { $set: { seenAt: now } }),
				]);
				markedCount =
					(likesResult.modifiedCount || 0) +
					(invitesResult.modifiedCount || 0) +
					(postLikesResult.modifiedCount || 0);
			} else {
				const updates: Promise<{ modifiedCount?: number }>[] = [];
				if (likeIds.length) {
					updates.push(
						LikeModel.updateMany(
							{ _id: { $in: likeIds }, receiver: ownerId, ...readFilter },
							{ $set: { seenAt: now } }
						)
					);
				}
				if (inviteIds.length) {
					updates.push(
						InvitationModel.updateMany(
							{ _id: { $in: inviteIds }, toUser: ownerId, ...readFilter },
							{ $set: { seenAt: now } }
						)
					);
				}
				if (postLikeIds.length) {
					updates.push(
						PostLikeModel.updateMany(
							{ _id: { $in: postLikeIds }, owner: ownerId, ...readFilter },
							{ $set: { seenAt: now } }
						)
					);
				}

				const results = await Promise.all(updates);
				markedCount = results.reduce((total, result) => total + (result.modifiedCount || 0), 0);
			}

			const [likesUnread, invitesUnread, postLikesUnread] = await Promise.all([
				LikeModel.countDocuments({ receiver: ownerId, ...readFilter }),
				InvitationModel.countDocuments({ toUser: ownerId, ...readFilter }),
				PostLikeModel.countDocuments({ owner: ownerId, ...readFilter }),
			]);

			res.status(200).json({
				success: true,
				message: "Notifications marked as read",
				data: {
					markedCount,
					unreadCount: likesUnread + invitesUnread + postLikesUnread,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to mark notifications as read",
				error: (error as Error).message,
			});
		}
	};

	getSettings = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findById(actorMongoId).select(
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
						likes: user.notificationPreferences?.likes !== false,
						postLikes: user.notificationPreferences?.postLikes !== false,
						matches: user.notificationPreferences?.matches !== false,
						messages: user.notificationPreferences?.messages !== false,
					},
					privacy: {
						showAge: user.privacy?.showAge !== false,
						showLocation: user.privacy?.showLocation !== false,
						showOnlineStatus: user.privacy?.showOnlineStatus !== false,
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

	updatePassword = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const { currentPassword, newPassword } = req.body as {
				currentPassword?: string;
				newPassword?: string;
			};

			if (!currentPassword || !newPassword || newPassword.trim().length < 6) {
				res.status(400).json({
					success: false,
					message: "currentPassword and newPassword (min 6 chars) are required",
				});
				return;
			}

			const user = await UserModel.findById(actorMongoId).select("password");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const matches = await bcrypt.compare(currentPassword, user.password);
			if (!matches) {
				res.status(400).json({ success: false, message: "Current password is incorrect" });
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

	updateOnlineVisibility = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const { onlineVisibility } = req.body as { onlineVisibility?: boolean };
			if (typeof onlineVisibility !== "boolean") {
				res.status(400).json({ success: false, message: "onlineVisibility must be boolean" });
				return;
			}

			const user = await UserModel.findByIdAndUpdate(
				actorMongoId,
				{ onlineVisibility },
				{ new: true }
			).select("onlineVisibility");

			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				data: { onlineVisibility: user.onlineVisibility },
				message: "Online visibility updated",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update online visibility",
				error: (error as Error).message,
			});
		}
	};

	updateNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const payload = req.body as Record<string, unknown>;
			const updates: Record<string, boolean> = {};
			(["likes", "postLikes", "matches", "messages"] as const).forEach((field) => {
				if (typeof payload[field] === "boolean") {
					updates[`notificationPreferences.${field}`] = payload[field] as boolean;
				}
			});

			if (!Object.keys(updates).length) {
				res.status(400).json({ success: false, message: "No valid notification preference provided" });
				return;
			}

			const user = await UserModel.findByIdAndUpdate(actorMongoId, { $set: updates }, { new: true }).select(
				"notificationPreferences"
			);

			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				data: user.notificationPreferences,
				message: "Notification preferences updated",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update notification preferences",
				error: (error as Error).message,
			});
		}
	};

	updatePrivacySettings = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const payload = req.body as Record<string, unknown>;
			const updates: Record<string, boolean> = {};
			(["showAge", "showLocation", "showOnlineStatus"] as const).forEach((field) => {
				if (typeof payload[field] === "boolean") {
					updates[`privacy.${field}`] = payload[field] as boolean;
				}
			});

			if (!Object.keys(updates).length) {
				res.status(400).json({ success: false, message: "No valid privacy setting provided" });
				return;
			}

			const user = await UserModel.findByIdAndUpdate(actorMongoId, { $set: updates }, { new: true }).select(
				"privacy"
			);
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			res.status(200).json({
				success: true,
				data: user.privacy,
				message: "Privacy settings updated",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to update privacy settings",
				error: (error as Error).message,
			});
		}
	};

	blockUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			const { userId } = req.params;
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}
			if (!userId || !Types.ObjectId.isValid(userId)) {
				res.status(400).json({ success: false, message: "Valid userId is required" });
				return;
			}
			if (actorMongoId === userId) {
				res.status(400).json({ success: false, message: "You cannot block yourself" });
				return;
			}

			const target = await UserModel.findById(userId).select("_id role");
			if (!target || target.role === "admin") {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			await UserModel.findByIdAndUpdate(actorMongoId, {
				$addToSet: { blockedUsers: new Types.ObjectId(userId) },
			});

			res.status(200).json({
				success: true,
				message: "User blocked successfully",
			});
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
			const actorMongoId = this.resolveActorMongoId(req);
			const { userId } = req.params;
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}
			if (!userId || !Types.ObjectId.isValid(userId)) {
				res.status(400).json({ success: false, message: "Valid userId is required" });
				return;
			}

			await UserModel.findByIdAndUpdate(actorMongoId, {
				$pull: { blockedUsers: new Types.ObjectId(userId) },
			});

			res.status(200).json({
				success: true,
				message: "User unblocked successfully",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to unblock user",
				error: (error as Error).message,
			});
		}
	};

	getBlockedUsers = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const user = await UserModel.findById(actorMongoId)
				.select("blockedUsers")
				.populate("blockedUsers", "_id uid firstname lastname profileImage image images")
				.lean();

			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const blockedUsers = (Array.isArray(user.blockedUsers) ? user.blockedUsers : []).map((entry) => {
				const item = entry as unknown as {
					_id: Types.ObjectId;
					uid?: string;
					firstname?: string;
					lastname?: string;
					profileImage?: string;
					image?: string;
					images?: Array<{ url?: string; isThumbnail?: boolean }>;
				};
				return {
					id: item._id.toString(),
					uid: item.uid,
					name: `${item.firstname ?? ""} ${item.lastname ?? ""}`.trim() || "PairUp user",
					avatar:
						item.profileImage ||
						item.image ||
						item.images?.find((img) => img.isThumbnail)?.url ||
						item.images?.[0]?.url ||
						"",
				};
			});

			res.status(200).json({
				success: true,
				data: blockedUsers,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to load blocked users",
				error: (error as Error).message,
			});
		}
	};

	reportUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			const { userId } = req.params;
			const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}
			if (!userId || !Types.ObjectId.isValid(userId)) {
				res.status(400).json({ success: false, message: "Valid userId is required" });
				return;
			}
			if (actorMongoId === userId) {
				res.status(400).json({ success: false, message: "You cannot report yourself" });
				return;
			}
			if (!reason) {
				res.status(400).json({ success: false, message: "Report reason is required" });
				return;
			}

			const target = await UserModel.findById(userId).select("_id role");
			if (!target || target.role === "admin") {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const report = await ReportModel.create({
				reporter: new Types.ObjectId(actorMongoId),
				reportedUser: new Types.ObjectId(userId),
				reason,
				status: "pending",
			});

			res.status(201).json({
				success: true,
				message: "User reported successfully",
				data: {
					id: report._id.toString(),
					status: report.status,
					reason: report.reason,
					createdAt: report.createdAt,
				},
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to report user",
				error: (error as Error).message,
			});
		}
	};

	deleteOwnAccount = async (req: Request, res: Response): Promise<void> => {
		try {
			const actorMongoId = this.resolveActorMongoId(req);
			if (!actorMongoId) {
				res.status(401).json({ success: false, message: "Unauthorized" });
				return;
			}

			const userId = new Types.ObjectId(actorMongoId);
			const user = await UserModel.findById(userId).select("profileImagePublicId images");
			if (!user) {
				res.status(404).json({ success: false, message: "User not found" });
				return;
			}

			const conversationDocs = await ConversationModel.find({ members: userId }).select("_id").lean();
			const conversationIds = conversationDocs.map((conversation) => conversation._id);

			const messageFilter =
				conversationIds.length > 0
					? {
							$or: [
								{ sender: userId },
								{ receiver: userId },
								{ conversationId: { $in: conversationIds } },
							],
					  }
					: { $or: [{ sender: userId }, { receiver: userId }] };

			await Promise.all([
				LikeModel.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
				MatchModel.deleteMany({ users: userId }),
				MessageModel.deleteMany(messageFilter),
				ConversationModel.deleteMany({ members: userId }),
				SwipeModel.deleteMany({ $or: [{ swiper: userId }, { swipedUser: userId }] }),
				ConnectionModel.deleteMany({ $or: [{ userA: userId }, { userB: userId }] }),
				ReportModel.deleteMany({ $or: [{ reporter: userId }, { reportedUser: userId }] }),
				PostLikeModel.deleteMany({ $or: [{ owner: userId }, { likedBy: userId }] }),
				UserModel.updateMany({ "images.likes": userId }, { $pull: { "images.$[].likes": userId } }),
			]);

			const publicIds = [
				user.profileImagePublicId,
				...(Array.isArray(user.images) ? user.images.map((image) => image.public_id) : []),
			].filter((entry): entry is string => Boolean(entry));

			await UserModel.deleteOne({ _id: userId });

			await Promise.all(publicIds.map((publicId) => CloudinaryService.deleteImage(publicId)));

			res.status(200).json({
				success: true,
				message: "Account deleted successfully",
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				message: "Unable to delete account",
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
