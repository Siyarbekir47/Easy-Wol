export function normalizeMacAddress(input: string): string {
  const compact = input.trim().toLowerCase().replace(/[:-]/g, '');
  if (!/^[0-9a-f]{12}$/.test(compact)) {
    throw new Error('Invalid MAC address');
  }

  return compact.match(/.{1,2}/g)!.join(':');
}

export function isValidIpv4(input: string): boolean {
  const parts = input.trim().split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

export function assertIpv4(input: string, label = 'IPv4 address'): string {
  const value = input.trim();
  if (!isValidIpv4(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function parsePort(input: string | number): number {
  const value = typeof input === 'number' ? input : Number(input.trim());
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('Invalid port');
  }
  return value;
}
