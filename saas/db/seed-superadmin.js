require("dotenv").config();
const bcrypt = require("bcryptjs");
const { query, getPool } = require("./pool");

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

async function seed() {
  const email = clean(process.env.SUPERADMIN_EMAIL);
  const mobile = clean(process.env.SUPERADMIN_MOBILE);
  const password = String(process.env.SUPERADMIN_PASSWORD || "");
  const name = String(process.env.SUPERADMIN_NAME || "Super Admin").trim() || "Super Admin";

  if (!email && !mobile) {
    throw new Error("Set SUPERADMIN_EMAIL and/or SUPERADMIN_MOBILE in .env");
  }
  if (password.length < 8) {
    throw new Error("SUPERADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await query(
    `SELECT id FROM users
     WHERE ($1::text IS NOT NULL AND lower(email) = lower($1))
        OR ($2::text IS NOT NULL AND mobile = $2)
     LIMIT 1`,
    [email, mobile]
  );

  if (existing.rows[0]) {
    await query(
      `UPDATE users
       SET password_hash = $2,
           name = $3,
           is_super_admin = TRUE,
           is_active = TRUE,
           email = COALESCE($4, email),
           mobile = COALESCE($5, mobile),
           updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, passwordHash, name, email, mobile]
    );
    console.log(`Updated Super Admin ${existing.rows[0].id}`);
  } else {
    const inserted = await query(
      `INSERT INTO users (email, mobile, password_hash, name, is_super_admin)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [email, mobile, passwordHash, name]
    );
    console.log(`Created Super Admin ${inserted.rows[0].id}`);
  }
}

seed()
  .then(async () => {
    await getPool().end();
  })
  .catch(async (error) => {
    console.error(error.message || error);
    try {
      await getPool().end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
