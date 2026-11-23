const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env and set Railway Postgres.");
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false }
  });
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function pingDb() {
  const result = await query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

module.exports = { getPool, query, withClient, pingDb };
