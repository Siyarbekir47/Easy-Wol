import net from 'node:net';

export async function probeTcp(host: string, ports = [22, 80, 3389], timeoutMs = 900): Promise<boolean> {
  for (const port of ports) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port, timeout: timeoutMs });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
    if (open) return true;
  }
  return false;
}
