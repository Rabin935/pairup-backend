import mongoose from "mongoose";
import { UserModel } from "../../../models/user.model";
import { UserRepository } from "../../../repositories/user.repository";

describe("UserRepository unit", () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it("createUser saves and returns user document", async () => {
    const saveSpy = jest
      .spyOn(UserModel.prototype, "save")
      .mockResolvedValue(undefined as never);
    const payload = {
      uid: "uid-1",
      firstname: "Test",
      lastname: "User",
      email: "test@example.com",
      number: "1234567890",
      password: "Password123!",
      authProvider: "local",
    };

    const created = await repository.createUser(payload as any);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(created.email).toBe(payload.email);
    expect(created.firstname).toBe(payload.firstname);
  });

  it("getUserByEmail queries with email", async () => {
    const findOneSpy = jest
      .spyOn(UserModel, "findOne")
      .mockResolvedValue({ email: "a@b.com" } as any);

    const result = await repository.getUserByEmail("a@b.com");

    expect(findOneSpy).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(result?.email).toBe("a@b.com");
  });

  it("getUserById queries with uid", async () => {
    const findOneSpy = jest
      .spyOn(UserModel, "findOne")
      .mockResolvedValue({ uid: "abc-123" } as any);

    const result = await repository.getUserById("abc-123");

    expect(findOneSpy).toHaveBeenCalledWith({ uid: "abc-123" });
    expect((result as any)?.uid).toBe("abc-123");
  });

  it("getAllUsers returns model find result", async () => {
    const users = [{ email: "one@example.com" }, { email: "two@example.com" }];
    const findSpy = jest.spyOn(UserModel, "find").mockResolvedValue(users as any);

    const result = await repository.getAllUsers();

    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  it("deleteUser returns true when one doc is deleted", async () => {
    jest.spyOn(UserModel, "deleteOne").mockResolvedValue({ deletedCount: 1 } as any);

    const result = await repository.deleteUser("uid-delete");

    expect(result).toBe(true);
  });

  it("deleteUser returns false when no doc is deleted", async () => {
    jest.spyOn(UserModel, "deleteOne").mockResolvedValue({ deletedCount: 0 } as any);

    const result = await repository.deleteUser("uid-missing");

    expect(result).toBe(false);
  });
});
