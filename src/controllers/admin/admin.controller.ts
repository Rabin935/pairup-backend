import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import z from "zod";
import { sendBanNotificationEmail } from "../../config/email";
import { LoginUserDto } from "../../dtos/user.dto";
import { HttpError } from "../../error/http-error";
import { ConnectionModel } from "../../models/connection.model";
import { ConversationModel } from "../../models/conversation.model";
import { LikeModel } from "../../models/like.model";
import { MatchModel } from "../../models/match.model";
import { MessageModel } from "../../models/message.model";
import { ReportModel, ReportStatus } from "../../models/report.model";
import { SwipeModel } from "../../models/swipe.model";
import { UserModel } from "../../models/user.model";
import { AdminService } from "../../services/admin.service";
import { CloudinaryService } from "../../services/cloudinary.service";

const adminService = new AdminService();
const USER_SAFE_SELECT = "-password -resetPasswordToken -resetPasswordExpire";
const MAX_PAGE_SIZE = 100;
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);
const REPORT_STATUS_VALUES: ReportStatus[] = ["pending", "reviewed", "resolved"];
const GROWTH_WINDOW_DAYS = 30;
const AUTO_BAN_REPORT_THRESHOLD = 5;
const AUTO_BAN_REASON = "Auto-banned due to excessive reports";
const MANUAL_BAN_REASON =
  "Your account has been banned by an administrator due to policy violations.";

type AggregatedCount = {
  _id: string;
  count: number;
};

type GenderDistributionItem = {
  gender: string;
  count: number;
};

type TopLocationItem = {
  location: string;
  count: number;
};

type ReportCountItem = {
  _id: Types.ObjectId;
  count: number;
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDailyCounts = (
  aggregatedCounts: AggregatedCount[],
  startDateUtc: Date,
  days: number
) => {
  const countMap = new Map<string, number>(
    aggregatedCounts.map((item) => [item._id, item.count])
  );

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(startDateUtc);
    day.setUTCDate(startDateUtc.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);

    return {
      date,
      count: countMap.get(date) ?? 0,
    };
  });
};

const parseDateQuery = (
  value: string,
  label: string,
  endOfDay: boolean = false
): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Invalid ${label}`);
  }

  if (DATE_ONLY_REGEX.test(value)) {
    if (endOfDay) {
      parsed.setUTCHours(23, 59, 59, 999);
    } else {
      parsed.setUTCHours(0, 0, 0, 0);
    }
  }

  return parsed;
};

const toPositiveInt = (
  value: unknown,
  fallback: number,
  max: number = Number.MAX_SAFE_INTEGER
): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertValidObjectId = (value: string, label: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }

  return new Types.ObjectId(value);
};

const handleAdminError = (res: Response, error: unknown) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};

const notifyUserBanned = async (email: string | undefined, reason: string) => {
  if (!email) {
    return;
  }

  try {
    await sendBanNotificationEmail({
      to: email,
      reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.warn(`Failed to send ban email to ${email}: ${message}`);
  }
};

const buildUserFilter = (req: Request): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const gender = typeof req.query.gender === "string" ? req.query.gender.trim().toLowerCase() : "";
  const location = typeof req.query.location === "string" ? req.query.location.trim() : "";

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ firstname: searchRegex }, { lastname: searchRegex }, { email: searchRegex }];
  }

  if (gender) {
    if (!ALLOWED_GENDERS.has(gender)) {
      throw new HttpError(400, "Invalid gender filter");
    }
    filter.gender = gender;
  }

  if (location) {
    filter.location = new RegExp(escapeRegex(location), "i");
  }

  return filter;
};

const setUserBanStatus = async (req: Request, res: Response, isBanned: boolean) => {
  try {
    const userId = assertValidObjectId(req.params.id, "user id");
    const requestedReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const banReason = requestedReason || MANUAL_BAN_REASON;

    const updates = isBanned
      ? { isBanned: true, banReason }
      : { isBanned: false, banReason: "" };

    const user = await UserModel.findByIdAndUpdate(userId, updates, { new: true })
      .select(USER_SAFE_SELECT)
      .lean();

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (isBanned) {
      await notifyUserBanned(user.email, banReason);
    }

    res.status(200).json({
      success: true,
      data: user,
      message: isBanned ? "User banned successfully" : "User unbanned successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

const updateReportStatus = async (
  req: Request,
  res: Response,
  status: ReportStatus,
  message: string
) => {
  try {
    const reportId = assertValidObjectId(req.params.id, "report id");

    const report = await ReportModel.findByIdAndUpdate(reportId, { status }, { new: true })
      .populate("reporter", "uid firstname lastname email")
      .populate("reportedUser", "uid firstname lastname email")
      .lean();

    if (!report) {
      throw new HttpError(404, "Report not found");
    }

    res.status(200).json({
      success: true,
      data: report,
      message,
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const parsedData = LoginUserDto.safeParse(req.body);
    if (!parsedData.success) {
      return res.status(400).json({
        success: false,
        message: z.prettifyError(parsedData.error),
      });
    }

    const { token, user } = await adminService.adminLogin(parsedData.data);
    return res.status(200).json({
      success: true,
      data: user,
      token,
      message: "Admin login successful",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getAdminStats = async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalMatches, totalLikes, totalMessages, activeUsers, newUsersLast7Days] =
      await Promise.all([
        UserModel.countDocuments(),
        MatchModel.countDocuments(),
        LikeModel.countDocuments(),
        MessageModel.countDocuments(),
        UserModel.countDocuments({ updatedAt: { $gte: last24Hours } }),
        UserModel.countDocuments({ createdAt: { $gte: last7Days } }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalMatches,
        totalLikes,
        totalMessages,
        activeUsers,
        newUsersLast7Days,
      },
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getPlatformMetrics = async (_req: Request, res: Response) => {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalLikes,
      totalMatches,
      totalMessages,
      genderDistribution,
      topLocations,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ updatedAt: { $gte: last24Hours } }),
      LikeModel.countDocuments(),
      MatchModel.countDocuments(),
      MessageModel.countDocuments(),
      UserModel.aggregate<GenderDistributionItem>([
        {
          $project: {
            gender: {
              $ifNull: ["$gender", "unspecified"],
            },
          },
        },
        {
          $group: {
            _id: "$gender",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            gender: "$_id",
            count: 1,
          },
        },
        { $sort: { count: -1, gender: 1 } },
      ]),
      UserModel.aggregate<TopLocationItem>([
        {
          $project: {
            normalizedLocation: {
              $cond: [
                { $isString: "$location" },
                { $trim: { input: "$location" } },
                "",
              ],
            },
          },
        },
        { $match: { normalizedLocation: { $ne: "" } } },
        {
          $group: {
            _id: { $toLower: "$normalizedLocation" },
            count: { $sum: 1 },
            location: { $first: "$normalizedLocation" },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 0,
            location: 1,
            count: 1,
          },
        },
      ]),
    ]);

    const matchRate =
      totalLikes === 0 ? 0 : Number(((totalMatches / totalLikes) * 100).toFixed(2));

    const averageMessagesPerMatch =
      totalMatches === 0 ? 0 : Number((totalMessages / totalMatches).toFixed(2));

    res.status(200).json({
      totalUsers,
      activeUsers,
      matchRate,
      averageMessagesPerMatch,
      genderDistribution,
      topLocations,
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getGrowthAnalytics = async (_req: Request, res: Response) => {
  try {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const startDateUtc = new Date(todayUtc);
    startDateUtc.setUTCDate(startDateUtc.getUTCDate() - (GROWTH_WINDOW_DAYS - 1));

    const [userCounts, matchCounts, messageCounts] = await Promise.all([
      UserModel.aggregate<AggregatedCount>([
        { $match: { createdAt: { $gte: startDateUtc } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "UTC",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      MatchModel.aggregate<AggregatedCount>([
        { $match: { createdAt: { $gte: startDateUtc } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "UTC",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      MessageModel.aggregate<AggregatedCount>([
        { $match: { createdAt: { $gte: startDateUtc } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "UTC",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.status(200).json({
      dailyUsers: normalizeDailyCounts(userCounts, startDateUtc, GROWTH_WINDOW_DAYS),
      dailyMatches: normalizeDailyCounts(matchCounts, startDateUtc, GROWTH_WINDOW_DAYS),
      dailyMessages: normalizeDailyCounts(messageCounts, startDateUtc, GROWTH_WINDOW_DAYS),
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getAdminMessages = async (req: Request, res: Response) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const userId =
      typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const startDateQuery =
      typeof req.query.startDate === "string"
        ? req.query.startDate
        : typeof req.query.dateFrom === "string"
        ? req.query.dateFrom
        : "";
    const endDateQuery =
      typeof req.query.endDate === "string"
        ? req.query.endDate
        : typeof req.query.dateTo === "string"
        ? req.query.dateTo
        : "";
    const flaggedQuery =
      typeof req.query.flagged === "string" ? req.query.flagged.trim().toLowerCase() : "";

    const filter: {
      $or?: Array<{ sender?: Types.ObjectId; receiver?: Types.ObjectId }>;
      createdAt?: { $gte?: Date; $lte?: Date };
      flagged?: boolean;
    } = {};

    if (userId) {
      const parsedUserId = assertValidObjectId(userId, "userId");
      filter.$or = [{ sender: parsedUserId }, { receiver: parsedUserId }];
    }

    if (startDateQuery || endDateQuery) {
      filter.createdAt = {};

      if (startDateQuery) {
        filter.createdAt.$gte = parseDateQuery(startDateQuery, "startDate");
      }

      if (endDateQuery) {
        filter.createdAt.$lte = parseDateQuery(endDateQuery, "endDate", true);
      }
    }

    if (flaggedQuery) {
      if (flaggedQuery !== "true" && flaggedQuery !== "false") {
        throw new HttpError(400, "Invalid flagged filter");
      }

      filter.flagged = flaggedQuery === "true";
    }

    const [messages, total] = await Promise.all([
      MessageModel.find(filter)
        .select("_id conversationId sender receiver text flagged read createdAt updatedAt")
        .populate(
          "sender",
          "_id uid firstname lastname email gender location profileImage image"
        )
        .populate(
          "receiver",
          "_id uid firstname lastname email gender location profileImage image"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MessageModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const dismissMessageFlag = async (req: Request, res: Response) => {
  try {
    const messageId = assertValidObjectId(req.params.id, "message id");
    const message = await MessageModel.findByIdAndUpdate(
      messageId,
      { $set: { flagged: false } },
      { new: true }
    )
      .select("_id flagged")
      .lean();

    if (!message) {
      throw new HttpError(404, "Message not found");
    }

    res.status(200).json({
      success: true,
      data: message,
      message: "Message flag dismissed successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const deleteAdminMessage = async (req: Request, res: Response) => {
  try {
    const messageId = assertValidObjectId(req.params.id, "message id");
    const deletedMessage = await MessageModel.findByIdAndDelete(messageId).select("_id");

    if (!deletedMessage) {
      throw new HttpError(404, "Message not found");
    }

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 10, MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;
    const filter = buildUserFilter(req);

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select(USER_SAFE_SELECT)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    const userIds = users
      .map((user) => user._id)
      .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId);

    const reportCounts = userIds.length
      ? await ReportModel.aggregate<ReportCountItem>([
          { $match: { reportedUser: { $in: userIds } } },
          {
            $group: {
              _id: "$reportedUser",
              count: { $sum: 1 },
            },
          },
        ])
      : [];

    const reportCountMap = new Map(
      reportCounts.map((item) => [item._id.toString(), item.count])
    );

    const usersWithReportCount = users.map((user) => ({
      ...user,
      reportCount: reportCountMap.get(String(user._id)) ?? 0,
    }));

    res.status(200).json({
      success: true,
      data: usersWithReportCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const userId = assertValidObjectId(req.params.id, "user id");
    const user = await UserModel.findById(userId).select(USER_SAFE_SELECT).lean();

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const payload: Record<string, unknown> = { ...req.body };

    if (typeof payload.email === "string") {
      payload.email = payload.email.trim().toLowerCase();
    }

    if (typeof payload.uid !== "string" || payload.uid.trim().length === 0) {
      payload.uid = uuidv4();
    }

    if (typeof payload.password !== "string" || payload.password.trim().length === 0) {
      throw new HttpError(400, "Password is required");
    }

    payload.password = await bcrypt.hash(payload.password, 10);

    if (req.file) {
      const uploadedImage = await CloudinaryService.uploadImage(req.file);
      payload.image = uploadedImage.url;
      payload.profileImage = uploadedImage.url;
      payload.profileImagePublicId = uploadedImage.publicId;
    }

    const user = await UserModel.create(payload);
    const safeUser = await UserModel.findById(user._id).select(USER_SAFE_SELECT).lean();

    res.status(201).json({
      success: true,
      data: safeUser,
      message: "User created successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const userId = assertValidObjectId(req.params.id, "user id");
    const updates: Record<string, unknown> = { ...req.body };
    let oldImagePublicId: string | undefined;

    const existingUser = await UserModel.findById(userId).select("profileImagePublicId");
    if (!existingUser) {
      throw new HttpError(404, "User not found");
    }
    oldImagePublicId = existingUser.profileImagePublicId || undefined;

    if (typeof updates.email === "string") {
      updates.email = updates.email.trim().toLowerCase();
    }

    if (typeof updates.password === "string" && updates.password.trim().length > 0) {
      updates.password = await bcrypt.hash(updates.password, 10);
    } else if (typeof updates.password !== "undefined") {
      delete updates.password;
    }

    if (req.file) {
      const uploaded = await CloudinaryService.uploadImage(req.file);
      updates.image = uploaded.url;
      updates.profileImage = uploaded.url;
      updates.profileImagePublicId = uploaded.publicId;
    }

    const user = await UserModel.findByIdAndUpdate(userId, updates, { new: true })
      .select(USER_SAFE_SELECT)
      .lean();

    if (
      req.file &&
      oldImagePublicId &&
      typeof updates.profileImagePublicId === "string" &&
      oldImagePublicId !== updates.profileImagePublicId
    ) {
      try {
        await CloudinaryService.deleteImage(oldImagePublicId);
      } catch {
        // Best effort cleanup; failed cleanup should not block profile update.
      }
    }

    res.status(200).json({
      success: true,
      data: user,
      message: "User updated successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const banUser = async (req: Request, res: Response) => setUserBanStatus(req, res, true);

export const unbanUser = async (req: Request, res: Response) => setUserBanStatus(req, res, false);

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = assertValidObjectId(req.params.id, "user id");
    const user = await UserModel.findById(userId).select("profileImagePublicId").lean();

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const conversationDocs = await ConversationModel.find({ members: userId }).select("_id").lean();
    const conversationIds = conversationDocs.map(
      (conversation) => conversation._id as Types.ObjectId
    );

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
    ]);

    const deleteResult = await UserModel.deleteOne({ _id: userId });
    if (deleteResult.deletedCount !== 1) {
      throw new HttpError(404, "User not found");
    }

    if (typeof user.profileImagePublicId === "string" && user.profileImagePublicId.length > 0) {
      try {
        await CloudinaryService.deleteImage(user.profileImagePublicId);
      } catch {
        // Best effort cleanup; user deletion should not fail on media cleanup errors.
      }
    }

    res.status(200).json({
      success: true,
      message: "User and related records deleted successfully",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const getReports = async (req: Request, res: Response) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 10, MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const statusParam =
      typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

    const filter: Record<string, unknown> = {};
    if (statusParam) {
      if (!REPORT_STATUS_VALUES.includes(statusParam as ReportStatus)) {
        throw new HttpError(400, "Invalid report status filter");
      }
      filter.status = statusParam;
    }

    const [reports, total] = await Promise.all([
      ReportModel.find(filter)
        .populate("reporter", "uid firstname lastname email")
        .populate("reportedUser", "uid firstname lastname email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReportModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};

export const reviewReport = async (req: Request, res: Response) =>
  updateReportStatus(req, res, "reviewed", "Report marked as reviewed");

export const resolveReport = async (req: Request, res: Response) => {
  try {
    const reportId = assertValidObjectId(req.params.id, "report id");

    let report = await ReportModel.findOneAndUpdate(
      { _id: reportId, status: { $ne: "resolved" } },
      { status: "resolved" },
      { new: true }
    )
      .populate("reporter", "uid firstname lastname email")
      .populate("reportedUser", "_id uid firstname lastname email")
      .lean();

    if (!report) {
      report = await ReportModel.findById(reportId)
        .populate("reporter", "uid firstname lastname email")
        .populate("reportedUser", "_id uid firstname lastname email")
        .lean();
    }

    if (!report) {
      throw new HttpError(404, "Report not found");
    }

    const reportedUserIdRaw =
      typeof report.reportedUser === "object" &&
      report.reportedUser !== null &&
      "_id" in report.reportedUser
        ? (report.reportedUser as { _id?: Types.ObjectId })._id
        : report.reportedUser;

    if (!reportedUserIdRaw) {
      throw new HttpError(400, "Reported user is missing on report");
    }

    const reportedUserId = new Types.ObjectId(reportedUserIdRaw);

    const resolvedReportCount = await ReportModel.countDocuments({
      reportedUser: reportedUserId,
      status: "resolved",
    });

    let autoBanned = false;
    if (resolvedReportCount >= AUTO_BAN_REPORT_THRESHOLD) {
      const updatedUser = await UserModel.findOneAndUpdate(
        { _id: reportedUserId, isBanned: { $ne: true } },
        {
          $set: {
            isBanned: true,
            banReason: AUTO_BAN_REASON,
          },
        },
        { new: true }
      )
        .select("_id email")
        .lean();

      autoBanned = Boolean(updatedUser);

      if (updatedUser) {
        await notifyUserBanned(updatedUser.email, AUTO_BAN_REASON);
      }
    }

    res.status(200).json({
      success: true,
      data: report,
      meta: {
        resolvedReportCount,
        autoBanned,
      },
      message: autoBanned
        ? "Report resolved and user auto-banned"
        : "Report marked as resolved",
    });
  } catch (error) {
    handleAdminError(res, error);
  }
};
