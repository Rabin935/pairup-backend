import jwt from "jsonwebtoken";
import { authorizedMiddleware } from "../../../middleware/authorized.middleware";
import { UserModel } from "../../../models/user.model";

jest.mock("jsonwebtoken");

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("authorized.middleware unit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no token is provided", async () => {
    const req: any = { headers: {}, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();

    await authorizedMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("extracts bearer token and sets req.user", async () => {
    const req: any = {
      headers: { authorization: "Bearer token-1" },
      query: {},
      body: {},
    };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-1" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-1",
      uid: "uid-1",
      role: "user",
      email: "u1@example.com",
      firstname: "U",
      lastname: "One",
    } as any);

    await authorizedMiddleware(req, res as any, next);

    expect(jwt.verify).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe("uid-1");
    expect(req.user?.mongoId).toBe("mongo-id-1");
  });

  it("extracts token from x-access-token header", async () => {
    const req: any = {
      headers: { "x-access-token": "token-2" },
      query: {},
      body: {},
    };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-2" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-2",
      uid: "uid-2",
      role: "admin",
      email: "u2@example.com",
      firstname: "U",
      lastname: "Two",
    } as any);

    await authorizedMiddleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.role).toBe("admin");
  });

  it("extracts token from query.token", async () => {
    const req: any = {
      headers: {},
      query: { token: "token-3" },
      body: {},
    };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-3" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-3",
      uid: "uid-3",
      role: "user",
      email: "u3@example.com",
      firstname: "U",
      lastname: "Three",
    } as any);

    await authorizedMiddleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("extracts token from body.token", async () => {
    const req: any = {
      headers: {},
      query: {},
      body: { token: "token-4" },
    };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-4" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-4",
      uid: "uid-4",
      role: "user",
      email: "u4@example.com",
      firstname: "U",
      lastname: "Four",
    } as any);

    await authorizedMiddleware(req, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when user is not found after token decode", async () => {
    const req: any = { headers: { authorization: "Bearer token-5" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "missing-user" });
    jest.spyOn(UserModel, "findById").mockResolvedValue(null);

    await authorizedMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "User not found",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when jwt verify throws", async () => {
    const req: any = { headers: { authorization: "Bearer bad" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error("bad token");
    });

    await authorizedMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or expired token",
    });
  });

  it("returns 401 when findById throws", async () => {
    const req: any = { headers: { authorization: "Bearer token-6" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-6" });
    jest.spyOn(UserModel, "findById").mockRejectedValue(new Error("db error"));

    await authorizedMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("treats malformed bearer header as missing token", async () => {
    const req: any = { headers: { authorization: "Bearer" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();

    await authorizedMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("prefers authorization bearer when multiple token sources exist", async () => {
    const req: any = {
      headers: { authorization: "Bearer preferred", "x-access-token": "secondary" },
      query: { token: "third" },
      body: { token: "fourth" },
    };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-7" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-7",
      uid: "uid-7",
      role: "user",
      email: "u7@example.com",
      firstname: "U",
      lastname: "Seven",
    } as any);

    await authorizedMiddleware(req, res as any, next);

    expect(jwt.verify).toHaveBeenCalledWith("preferred", expect.any(String));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("serializes _id to string fields on req.user", async () => {
    const req: any = { headers: { authorization: "Bearer token-8" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-8" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: { toString: () => "mongo-string-8" },
      uid: "uid-8",
      role: "admin",
      email: "u8@example.com",
      firstname: "U",
      lastname: "Eight",
    } as any);

    await authorizedMiddleware(req, res as any, next);

    expect(req.user?._id).toBe("mongo-string-8");
    expect(req.user?.mongoId).toBe("mongo-string-8");
  });

  it("sets basic profile fields on req.user", async () => {
    const req: any = { headers: { authorization: "Bearer token-9" }, query: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-id-9" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-id-9",
      uid: "uid-9",
      role: "user",
      email: "u9@example.com",
      firstname: "Nine",
      lastname: "User",
    } as any);

    await authorizedMiddleware(req, res as any, next);

    expect(req.user?.email).toBe("u9@example.com");
    expect(req.user?.firstname).toBe("Nine");
    expect(req.user?.lastname).toBe("User");
  });
});
