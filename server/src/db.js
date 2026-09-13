import pg from 'pg';
import { config } from './config.js';
pg.types.setTypeParser(1082, value => value);
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
export const query = (sql,values) => pool.query(sql,values);
export async function transaction(fn) {
 const client = await pool.connect();
 try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
 catch(error) { await client.query('ROLLBACK'); throw error; }
 finally { client.release(); }
}
export async function audit(db, actor, action, entity, details = {}) {
 await db.query('INSERT INTO audit_events(actor_id,action,entity_id,details) VALUES ($1,$2,$3,$4)',[actor,action,String(entity),JSON.stringify(details)]);
}
