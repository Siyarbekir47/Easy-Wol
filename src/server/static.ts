import path from 'node:path';
import express from 'express';

export function configureStaticServing(app: express.Express, publicDir: string): void {
  app.use(express.static(publicDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}
