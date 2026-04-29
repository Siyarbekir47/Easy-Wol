import { describe, expect, it } from 'vitest';
import { createMagicPacket } from '../wol.js';

describe('wol', () => {
  it('creates a 102 byte magic packet with six 0xff bytes and sixteen mac repetitions', () => {
    const packet = createMagicPacket('01:23:45:67:89:ab');

    expect(packet).toHaveLength(102);
    expect([...packet.subarray(0, 6)]).toEqual([255, 255, 255, 255, 255, 255]);

    const mac = [0x01, 0x23, 0x45, 0x67, 0x89, 0xab];
    for (let i = 0; i < 16; i += 1) {
      expect([...packet.subarray(6 + i * 6, 12 + i * 6)]).toEqual(mac);
    }
  });
});
