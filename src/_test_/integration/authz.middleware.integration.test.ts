import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { adminOnly } from "../../middleware/admin/admin.middleware";
import { authorizedMiddleware } from "../../middleware/authorized.middleware";
import { UserModel } from "../../models/user.model";

jest.mock("jsonwebtoken");

const buildApp = () => {
  const app = express();
  app.use(express.json());

  app.get("/protected", authorizedMiddleware, (req, res) => {
    res.status(200).json({
      success: true,
      userId: req.user?.id,
      role: req.user?.role,
      email: req.user?.email,
    });
  });

  app.get("/admin-only", authorizedMiddleware, adminOnly, (req, res) => {
    res.status(200).json({ success: true, admin: req.user?.email });
  });

  return app;
};

describe("authz middleware integration (supertest)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("denies /protected without token", async () => {
    const app = buildApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("allows /protected with bearer token for valid user", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-1" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-1",
      uid: "uid-1",
      role: "user",
      email: "user1@example.com",
      firstname: "U1",
      lastname: "Test",
    } as any);

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token-1");

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("uid-1");
    expect(res.body.role).toBe("user");
  });

  it("accepts token from x-access-token", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-2" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-2",
      uid: "uid-2",
      role: "user",
      email: "user2@example.com",
      firstname: "U2",
      lastname: "Test",
    } as any);

    const res = await request(app).get("/protected").set("x-access-token", "token-2");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("user2@example.com");
  });

  it("accepts token from query param", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-3" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-3",
      uid: "uid-3",
      role: "user",
      email: "user3@example.com",
      firstname: "U3",
      lastname: "Test",
    } as any);

    const res = await request(app).get("/protected?token=token-3");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("uid-3");
  });

  it("accepts token from request body", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-4" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-4",
      uid: "uid-4",
      role: "user",
      email: "user4@example.com",
      firstname: "U4",
      lastname: "Test",
    } as any);

    const res = await request(app).get("/protected").send({ token: "token-4" });
    expect(res.status).toBe(200);
  });

  it("denies when JWT is invalid", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error("invalid");
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("denies when user no longer exists", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "missing" });
    jest.spyOn(UserModel, "findById").mockResolvedValue(null);

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token-5");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("User not found");
  });

  it("allows /admin-only for admin user", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-admin" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-admin",
      uid: "uid-admin",
      role: "admin",
      email: "admin@example.com",
      firstname: "Admin",
      lastname: "User",
    } as any);

    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", "Bearer admin-token");

    expect(res.status).toBe(200);
    expect(res.body.admin).toBe("admin@example.com");
  });

  it("forbids /admin-only for normal user", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockReturnValue({ id: "mongo-user" });
    jest.spyOn(UserModel, "findById").mockResolvedValue({
      _id: "mongo-user",
      uid: "uid-user",
      role: "user",
      email: "user@example.com",
      firstname: "User",
      lastname: "Only",
    } as any);

    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", "Bearer user-token");

    expect(res.status).toBe(403);
  });

  it("forbids /admin-only when token invalid", async () => {
    const app = buildApp();
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error("token error");
    });

    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
  });

  it("returns 401 with malformed bearer header", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer");

    expect(res.status).toBe(401);
  });
});
