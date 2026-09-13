import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
await pool.query('SELECT 1');
const server=app.listen(config.port,config.host,()=>console.log(`DataF API: http://${config.host}:${config.port}`));
async function shutdown() {server.close(async()=>{await pool.end();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
