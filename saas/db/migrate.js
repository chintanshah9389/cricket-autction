require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { query, getPool } = require("./pool");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedIds() {
  const result = await query("SELECT id FROM schema_migrations ORDER BY id");
  return new Set(result.rows.map((row) => row.id));
}

async function migrate() {
  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  await ensureMigrationsTable();
  const done = await appliedIds();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`apply ${file}`);
    await query("BEGIN");
    try {
      await query(sql);
      await query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await query("COMMIT");
      console.log(`ok    ${file}`);
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }
}

migrate()
  .then(async () => {
    console.log("Migrations complete.");
    await getPool().end();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error.message || error);
    try {
      await getPool().end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
