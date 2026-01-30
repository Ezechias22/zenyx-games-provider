import net from 'net';

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

export function isIpAllowed(ip: string, whitelist: string[]): boolean {
  // Supports exact IPv4 or CIDR for IPv4.
  // For production across proxies, configure trusted proxy and use X-Forwarded-For parsing at gateway.
  const cleanIp = ip.includes(':') ? ip.split(':').pop() || ip : ip;
  for (const entry of whitelist) {
    const e = entry.trim();
    if (!e) continue;
    if (e.includes('/')) {
      const [cidrIp, bitsStr] = e.split('/');
      const bits = Number(bitsStr);
      const ipLong = ipToLong(cleanIp);
      const cidrLong = ipToLong(cidrIp);
      if (ipLong === null || cidrLong === null) continue;
      const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
      if ((ipLong & mask) === (cidrLong & mask)) return true;
    } else {
      if (cleanIp === e) return true;
    }
  }
  return whitelist.length === 0; // if no whitelist configured, allow (operators should configure)
}
