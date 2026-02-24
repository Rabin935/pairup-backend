type RateState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateState>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const state = buckets.get(key);

  if (!state || state.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (state.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: state.resetAt };
  }

  state.count += 1;
  buckets.set(key, state);
  return { allowed: true, remaining: limit - state.count, resetAt: state.resetAt };
}
