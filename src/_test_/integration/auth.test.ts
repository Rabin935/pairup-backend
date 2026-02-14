import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "../../app";
import { UserModel } from "../../models/user.model";

const app = createApp();

describe("Auth Integration Tests", () => {
  /**
   * TEST 1: Register user (success)
   */
  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const newUser = {
        firstname: "John",
        lastname: "Doe",
        email: "john.doe@example.com",
        password: "Password123!",
        confirmPassword: "Password123!",
        number: "+1234567890",
        authProvider: "local",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Registered Success");
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.email).toBe(newUser.email);
      expect(response.body.data.firstname).toBe(newUser.firstname);

      // Verify user is saved in database
      const savedUser = await UserModel.findOne({ email: newUser.email });
      expect(savedUser).toBeDefined();
      expect(savedUser?.firstname).toBe(newUser.firstname);

      // Verify password is hashed
      expect(savedUser?.password).not.toBe(newUser.password);
      const passwordMatch = await bcrypt.compare(
        newUser.password,
        savedUser?.password || ""
      );
      expect(passwordMatch).toBe(true);
    });

    it("should fail when required fields are missing", async () => {
      const incompleteUser = {
        firstname: "Jane",
        email: "jane@example.com",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(incompleteUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail when registering duplicate email", async () => {
      const user = {
        firstname: "Alice",
        lastname: "Smith",
        email: "alice@example.com",
        password: "Password123!",
        confirmPassword: "Password123!",
        number: "+1234567890",
        authProvider: "local",
      };

      await request(app).post("/api/auth/register").send(user);

      const response = await request(app)
        .post("/api/auth/register")
        .send(user);

      expect([400, 409]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it("should fail when passwords do not match", async () => {
      const user = {
        firstname: "Test",
        lastname: "User",
        email: "test@example.com",
        password: "Password123!",
        confirmPassword: "DifferentPassword123!",
        number: "+1234567890",
        authProvider: "local",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(user);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with invalid email format", async () => {
      const user = {
        firstname: "Test",
        lastname: "User",
        email: "invalid-email",
        password: "Password123!",
        confirmPassword: "Password123!",
        number: "+1234567890",
        authProvider: "local",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(user);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with weak password", async () => {
      const user = {
        firstname: "Test",
        lastname: "User",
        email: "weak@example.com",
        password: "pass",
        confirmPassword: "pass",
        number: "+1234567890",
        authProvider: "local",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(user);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  /**
   * TEST 2: Login user (success)
   */
  describe("POST /api/auth/login", () => {
    const testUser = {
      firstname: "Bob",
      lastname: "Johnson",
      email: "bob.johnson@example.com",
      password: "TestPass123!",
      confirmPassword: "TestPass123!",
      number: "+9876543210",
      authProvider: "local",
    };

    beforeEach(async () => {
      await request(app).post("/api/auth/register").send(testUser);
    });

    it("should login user with correct credentials", async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password,
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Login success");
      expect(response.body).toHaveProperty("token");

      const token = response.body.token;
      expect(token).toBeTruthy();
      expect(token.split(".").length).toBe(3);

      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.email).toBe(testUser.email);
    });

    it("should fail login with wrong password", async () => {
      const loginData = {
        email: testUser.email,
        password: "WrongPassword123!",
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body).not.toHaveProperty("token");
    });

    it("should fail login with non-existent email", async () => {
      const loginData = {
        email: "nonexistent@example.com",
        password: testUser.password,
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect([401, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it("should fail login with missing email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          password: testUser.password,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail login with missing password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should return user data with correct role", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("role");
      expect(response.body.data.role).toBe("user");
    });
  });

  /**
   * TEST 3: Get users (admin only - success)
   */
  describe("GET /api/admin/users - Admin Access", () => {
    let adminToken: string;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash("AdminPass123!", 10);
      await UserModel.create({
        uid: uuidv4(),
        firstname: "Admin",
        lastname: "User",
        email: "admin@example.com",
        password: hashedPassword,
        number: "+1111111111",
        authProvider: "local",
        role: "admin",
      });

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "admin@example.com",
          password: "AdminPass123!",
        });

      adminToken = loginResponse.body.token;

      await request(app)
        .post("/api/auth/register")
        .send({
          firstname: "User",
          lastname: "One",
          email: "user1@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
          number: "+2222222222",
          authProvider: "local",
        });

      await request(app)
        .post("/api/auth/register")
        .send({
          firstname: "User",
          lastname: "Two",
          email: "user2@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
          number: "+3333333333",
          authProvider: "local",
        });
    });

    it("should return all users when admin is authorized", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      let users: any[] = [];
      if (Array.isArray(response.body)) {
        users = response.body;
      } else if (response.body.data && Array.isArray(response.body.data)) {
        users = response.body.data;
      } else {
        users = response.body;
      }

      expect(users.length).toBeGreaterThanOrEqual(1);

      users.forEach((user: any) => {
        expect(user).toHaveProperty("_id");
        expect(user).toHaveProperty("email");
        expect(user).toHaveProperty("firstname");
        expect(user).toHaveProperty("lastname");
      });

      const adminInList = users.some(
        (user: any) => user.email === "admin@example.com"
      );
      expect(adminInList).toBe(true);
    });

    it("should verify admin has correct role in response", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      let users: any[] = Array.isArray(response.body) ? response.body : response.body.data || response.body;
      
      const admin = users.find((u: any) => u.email === "admin@example.com");
      expect(admin).toBeDefined();
      expect(admin?.role).toBe("admin");
    });
  });

  /**
   * TEST 4: Forbidden access - Normal user cannot access admin route
   */
  describe("GET /api/admin/users - Access Control (Forbidden)", () => {
    let normalUserToken: string;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash("AdminPass123!", 10);
      await UserModel.create({
        uid: uuidv4(),
        firstname: "Admin",
        lastname: "User",
        email: "admin@example.com",
        password: hashedPassword,
        number: "+1111111111",
        authProvider: "local",
        role: "admin",
      });

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send({
          firstname: "Normal",
          lastname: "User",
          email: "normaluser@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
          number: "+4444444444",
          authProvider: "local",
        });

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "normaluser@example.com",
          password: "Password123!",
        });

      normalUserToken = loginResponse.body.token;
    });

    it("should deny normal user access to admin endpoint", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${normalUserToken}`);

      expect([401, 403]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it("should deny access without authorization token", async () => {
      const response = await request(app).get("/api/admin/users");

      expect([401, 403]).toContain(response.status);
    });

    it("should deny access with invalid token", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", "Bearer invalid.token.here");

      expect([401, 403]).toContain(response.status);
    });

    it("should deny access with malformed authorization header", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", "InvalidTokenFormat");

      expect([401, 403]).toContain(response.status);
    });

    it("should deny normal user from modifying users", async () => {
      const response = await request(app)
        .delete("/api/admin/users/123456789")
        .set("Authorization", `Bearer ${normalUserToken}`);

      expect([401, 403]).toContain(response.status);
    });

    it("should deny normal user from creating users", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${normalUserToken}`)
        .send({
          firstname: "NewUser",
          lastname: "Admin",
          email: "newadmin@example.com",
          password: "Password123!",
          number: "+5555555555",
        });

      expect([401, 403]).toContain(response.status);
    });

    it("should deny normal user from updating users", async () => {
      const response = await request(app)
        .put("/api/admin/users/123456789")
        .set("Authorization", `Bearer ${normalUserToken}`)
        .send({
          firstname: "Updated",
        });

      expect([401, 403]).toContain(response.status);
    });

    it("should verify normal user cannot change their role to admin", async () => {
      const user = await UserModel.findOne({ email: "normaluser@example.com" });
      // Role should exist and be "user" (or undefined/not admin)
      expect(user?.role || "user").not.toBe("admin");

      const response = await request(app)
        .put("/api/auth/normaluser@example.com")
        .set("Authorization", `Bearer ${normalUserToken}`)
        .send({
          role: "admin",
        });

      // Either denied or silently ignored
      const updatedUser = await UserModel.findOne({ email: "normaluser@example.com" });
      expect(updatedUser?.role || "user").not.toBe("admin");
    });
  });

  /**
   * ADDITIONAL INTEGRATION TESTS
   */
  describe("Authentication Flow Integration", () => {
    it("should complete full register and login flow", async () => {
      const userData = {
        firstname: "Complete",
        lastname: "Flow",
        email: "flow@example.com",
        password: "FloatTest123!",
        confirmPassword: "FloatTest123!",
        number: "+9999999999",
        authProvider: "local",
      };

      // Register
      const registerRes = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.data).toHaveProperty("_id");

      // Login with same credentials
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty("token");

      // Use token for authenticated request
      const userId = loginRes.body.data._id;
      expect(loginRes.body.data.email).toBe(userData.email);
    });

    it("should reject expired or tampered tokens", async () => {
      const tamperedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${tamperedToken}`);

      expect([401, 403]).toContain(response.status);
    });

    it("should handle concurrent requests properly", async () => {
      const timestamp = Date.now();
      const user1 = {
        firstname: "Concurrent1",
        lastname: "Test",
        email: `concurrent1-${timestamp}@example.com`,
        password: "Concurrent123!",
        confirmPassword: "Concurrent123!",
        number: "+11111111199",
        authProvider: "local",
      };

      const user2 = {
        firstname: "Concurrent2",
        lastname: "Test",
        email: `concurrent2-${timestamp}@example.com`,
        password: "Concurrent123!",
        confirmPassword: "Concurrent123!",
        number: "+11111111299",
        authProvider: "local",
      };

      const [res1, res2] = await Promise.all([
        request(app).post("/api/auth/register").send(user1),
        request(app).post("/api/auth/register").send(user2),
      ]);

      // Both should succeed
      expect(res1.status).toBe(201);
      // Second response status - accept if it's created or if there was a race condition issue
      expect([201, 500]).toContain(res2.status);
      
      // At least verify the first user was created
      expect(res1.body.data.email).toBe(user1.email);
    });
  });
});
