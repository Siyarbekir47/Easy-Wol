import dgram from 'node:dgram';
import { normalizeMacAddress } from './validation.js';

export function createMagicPacket(macAddress: string): Buffer {
  const normalized = normalizeMacAddress(macAddress);
  const macBytes = Buffer.from(normalized.split(':').map((part) => Number.parseInt(part, 16)));
  const packet = Buffer.alloc(6 + 16 * macBytes.length, 0xff);

  for (let offset = 6; offset < packet.length; offset += macBytes.length) {
    macBytes.copy(packet, offset);
  }

  return packet;
}

export async function sendMagicPacket(macAddress: string, broadcastAddress: string, port = 9): Promise<void> {
  const packet = createMagicPacket(macAddress);
  const socket = dgram.createSocket('udp4');

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, port, broadcastAddress, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve();
      });
    });
  });
}
