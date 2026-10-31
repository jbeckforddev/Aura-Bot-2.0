type CooldownEntry = {
  lastReported: number;
  count: number;
};

const cooldownMap = new Map<string, CooldownEntry>();

export function check(
  jid: string,
  cooldownMin: number,
): { blocked: boolean; count: number; remainingMin: number } {
  const entry = cooldownMap.get(jid);
  if (!entry) {
    return { blocked: false, count: 0, remainingMin: 0 };
  }

  const now = Date.now();
  const diffMs = now - entry.lastReported;
  const cooldownMs = cooldownMin * 60 * 1000;

  if (diffMs < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - diffMs) / (60 * 1000));
    return { blocked: true, count: entry.count, remainingMin };
  }

  return { blocked: false, count: entry.count, remainingMin: 0 };
}

export function mark(jid: string): number {
  const entry = cooldownMap.get(jid);
  const now = Date.now();
  const count = (entry?.count ?? 0) + 1;
  cooldownMap.set(jid, { lastReported: now, count });
  return count;
}
