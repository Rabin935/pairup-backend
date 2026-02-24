const onlineUsers = new Map<string, number>();

export function markOnline(userId: string): boolean {
  const current = onlineUsers.get(userId) ?? 0;
  onlineUsers.set(userId, current + 1);
  return current === 0;
}

export function markOffline(userId: string): boolean {
  const current = onlineUsers.get(userId) ?? 0;
  if (current <= 1) {
    onlineUsers.delete(userId);
    return current > 0;
  }
  onlineUsers.set(userId, current - 1);
  return false;
}

export function isOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

export function getPresenceSnapshot(userIds: string[]): Record<string, "online" | "offline"> {
  const snapshot: Record<string, "online" | "offline"> = {};
  userIds.forEach((id) => {
    snapshot[id] = isOnline(id) ? "online" : "offline";
  });
  return snapshot;
}
