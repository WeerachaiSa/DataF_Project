import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../',import.meta.url));
dotenv.config({ path: fileURLToPath(new URL('../../.env',import.meta.url)) });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run npm run db:init or configure .env.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
export const config = {
 databaseUrl: process.env.DATABASE_URL, secret: process.env.JWT_SECRET, port: Number(process.env.PORT || 4000),
 host: process.env.HOST || '127.0.0.1', production: process.env.NODE_ENV === 'production',
 origins: (process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173').split(',').map(s=>s.trim()),
 cookieName: 'dataf_session', sessionSeconds: 8 * 60 * 60
};
