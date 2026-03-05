import { HttpError } from "../../../error/http-error";
import { adminOnly, isAdmin } from "../../../middleware/admin/admin.middleware";

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("admin.middleware unit", () => {
  it("calls next when req.user role is admin", () => {
    const req: any = { user: { role: "admin" } };
    const res = mockRes();
    const next = jest.fn();

    adminOnly(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when req.user is missing", () => {
    const req: any = {};
    const res = mockRes();
    const next = jest.fn();

    adminOnly(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized",
    });
  });

  it("returns 403 when req.user role is not admin", () => {
    const req: any = { user: { role: "user" } };
    const res = mockRes();
    const next = jest.fn();

    adminOnly(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for undefined role", () => {
    const req: any = { user: {} };
    const res = mockRes();
    const next = jest.fn();

    adminOnly(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("isAdmin alias behaves same as adminOnly", () => {
    const req: any = { user: { role: "admin" } };
    const res = mockRes();
    const next = jest.fn();

    isAdmin(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("HttpError stores message and statusCode", () => {
    const err = new HttpError(418, "I am a teapot");
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I am a teapot");
  });

  it("HttpError is instance of Error", () => {
    const err = new HttpError(400, "Bad request");
    expect(err instanceof Error).toBe(true);
  });
});
