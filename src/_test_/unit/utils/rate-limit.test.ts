import { checkRateLimit } from "../../../utils/rate-limit";

describe("rate limit utils", () => {
  const now = 1_700_000_000_000;

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("allows first request and decrements remaining", () => {
    const result = checkRateLimit("chat:user:1", 3, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks when limit is exceeded in same window", () => {
    checkRateLimit("chat:user:2", 2, 1000);
    checkRateLimit("chat:user:2", 2, 1000);
    const blocked = checkRateLimit("chat:user:2", 2, 1000);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets count after window passes", () => {
    checkRateLimit("chat:user:3", 1, 1000);
    (Date.now as jest.Mock).mockReturnValue(now + 1001);

    const result = checkRateLimit("chat:user:3", 1, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("uses independent counters for different keys", () => {
    const first = checkRateLimit("chat:user:A", 1, 1000);
    const second = checkRateLimit("chat:user:B", 1, 1000);
    const blockedA = checkRateLimit("chat:user:A", 1, 1000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(blockedA.allowed).toBe(false);
  });
});
