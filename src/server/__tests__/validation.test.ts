import { describe, expect, it } from 'vitest';
import { isValidIpv4, normalizeMacAddress, parsePort } from '../validation.js';

describe('validation', () => {
  it('normalizes colon, dash, and compact mac addresses', () => {
    expect(normalizeMacAddress('AA-BB-CC-00-11-22')).toBe('aa:bb:cc:00:11:22');
    expect(normalizeMacAddress('aabbcc001122')).toBe('aa:bb:cc:00:11:22');
    expect(normalizeMacAddress('aa:bb:cc:00:11:22')).toBe('aa:bb:cc:00:11:22');
  });

  it('rejects invalid mac addresses', () => {
    expect(() => normalizeMacAddress('aa:bb:cc')).toThrow('Invalid MAC address');
    expect(() => normalizeMacAddress('zz:bb:cc:00:11:22')).toThrow('Invalid MAC address');
  });

  it('validates ipv4 addresses without accepting invalid octets', () => {
    expect(isValidIpv4('192.168.1.255')).toBe(true);
    expect(isValidIpv4('10.0.0.5')).toBe(true);
    expect(isValidIpv4('300.168.1.1')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
  });

  it('parses tcp ports in the user range', () => {
    expect(parsePort('22')).toBe(22);
    expect(parsePort(8080)).toBe(8080);
    expect(() => parsePort(0)).toThrow('Invalid port');
    expect(() => parsePort(70000)).toThrow('Invalid port');
  });
});
