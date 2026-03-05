import express from "express";
import request from "supertest";
import { buildModerationReportReason, moderateMessageText } from "../../utils/message-moderation";
import { checkRateLimit } from "../../utils/rate-limit";

const buildApp = () => {
  const app = express();
  app.use(express.json());

  app.post("/moderate", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const result = moderateMessageText(text);
    return res.status(200).json({
      success: true,
      ...result,
      reason: buildModerationReportReason(result.matchedWords),
    });
  });

  app.post("/limited/:key", (req, res) => {
    const key = req.params.key;
    const limit = Number(req.body?.limit ?? 3);
    const windowMs = Number(req.body?.windowMs ?? 1000);
    const decision = checkRateLimit(key, limit, windowMs);
    return res.status(decision.allowed ? 200 : 429).json(decision);
  });

  return app;
};

describe("policy integration (supertest)", () => {
  it("moderate endpoint returns not flagged for clean text", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "Hello friend" });
    expect(res.status).toBe(200);
    expect(res.body.flagged).toBe(false);
  });

  it("moderate endpoint flags banned word", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "This is hate speech" });
    expect(res.status).toBe(200);
    expect(res.body.flagged).toBe(true);
    expect(res.body.matchedWords).toContain("hate");
  });

  it("moderate endpoint is case insensitive", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "THREAT detected" });
    expect(res.status).toBe(200);
    expect(res.body.matchedWords).toEqual(["threat"]);
  });

  it("moderate endpoint reports multiple banned words", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "abuse and violence" });
    expect(res.status).toBe(200);
    expect(res.body.matchedWords).toEqual(["abuse", "violence"]);
  });

  it("moderate endpoint handles missing text", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({});
    expect(res.status).toBe(200);
    expect(res.body.flagged).toBe(false);
  });

  it("moderate endpoint returns reason for empty match list", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "normal text" });
    expect(res.status).toBe(200);
    expect(res.body.reason).toBe("Auto-flagged message due to policy violation");
  });

  it("rate limit allows first request", async () => {
    const app = buildApp();
    const res = await request(app).post("/limited/chat-a").send({ limit: 2, windowMs: 10000 });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
  });

  it("rate limit allows second request before limit", async () => {
    const app = buildApp();
    await request(app).post("/limited/chat-b").send({ limit: 3, windowMs: 10000 });
    const res = await request(app).post("/limited/chat-b").send({ limit: 3, windowMs: 10000 });
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(1);
  });

  it("rate limit blocks when limit reached", async () => {
    const app = buildApp();
    await request(app).post("/limited/chat-c").send({ limit: 1, windowMs: 10000 });
    const blocked = await request(app).post("/limited/chat-c").send({ limit: 1, windowMs: 10000 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.allowed).toBe(false);
  });

  it("rate limits are isolated per key", async () => {
    const app = buildApp();
    await request(app).post("/limited/chat-d1").send({ limit: 1, windowMs: 10000 });
    await request(app).post("/limited/chat-d2").send({ limit: 1, windowMs: 10000 });
    const blockedD1 = await request(app).post("/limited/chat-d1").send({ limit: 1, windowMs: 10000 });
    const okD2 = await request(app).post("/limited/chat-d2").send({ limit: 2, windowMs: 10000 });
    expect(blockedD1.status).toBe(429);
    expect(okD2.status).toBe(200);
  });

  it("rate limit endpoint applies default limit/window when omitted", async () => {
    const app = buildApp();
    await request(app).post("/limited/chat-e").send({});
    await request(app).post("/limited/chat-e").send({});
    const third = await request(app).post("/limited/chat-e").send({});
    expect(third.status).toBe(200);
    expect(third.body.remaining).toBe(0);
  });

  it("rate limit endpoint blocks 4th request with defaults", async () => {
    const app = buildApp();
    await request(app).post("/limited/chat-f").send({});
    await request(app).post("/limited/chat-f").send({});
    await request(app).post("/limited/chat-f").send({});
    const fourth = await request(app).post("/limited/chat-f").send({});
    expect(fourth.status).toBe(429);
  });

  it("moderation reason includes matched words when flagged", async () => {
    const app = buildApp();
    const res = await request(app).post("/moderate").send({ text: "hate and threat" });
    expect(res.status).toBe(200);
    expect(res.body.reason).toContain("hate, threat");
  });
});
