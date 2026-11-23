/**
 * SaaS auction API — Postgres + Cloudflare R2 only (no data-project).
 * Local: copy .env.example → .env, then:
 *   npm install
 *   npm run saas:migrate
 *   npm run saas:seed-superadmin
 *   npm run saas
 */
require("dotenv").config();

const http = require("http");
const { pingDb } = require("./db/pool");
const { pingR2 } = require("./lib/r2");
const { sendJson, parseUrl, serveStatic } = require("./lib/http");
const { handleAuthRoutes } = require("./routes/auth");
const { handleOrgRoutes } = require("./routes/orgs");
const { handleMediaRoutes } = require("./routes/media");
const { handleSuperAdminRoutes } = require("./routes/superadmin");
const { handleTournamentRoutes } = require("./routes/tournaments");
const { tryPrettyHtml } = require("../server");

const PORT = Number(process.env.PORT) || 3000;

async function runMigrationsQuiet() {
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync(process.execPath, ["saas/db/migrate.js"], {
      cwd: require("path").join(__dirname, ".."),
      env: process.env,
      encoding: "utf8"
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      console.error("Migration warning: exit", result.status);
    }
  } catch (error) {
    console.error("Migration warning:", error.message || error);
  }
}

async function handleHealth(req, res) {
  const checks = { ok: true, db: false, r2: false, mode: "saas", desk: true };
  try {
    checks.db = await pingDb();
  } catch (error) {
    checks.ok = false;
    checks.dbError = error.message;
  }
  try {
    checks.r2 = await pingR2();
  } catch (error) {
    checks.ok = false;
    checks.r2Error = error.message;
  }
  sendJson(res, checks.ok ? 200 : 503, checks);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = parseUrl(req);

    if (url.pathname === "/api/v1/health") {
      await handleHealth(req, res);
      return;
    }

    if (await handleAuthRoutes(req, res, url)) return;
    if (await handleOrgRoutes(req, res, url)) return;
    if (await handleMediaRoutes(req, res, url)) return;
    if (await handleSuperAdminRoutes(req, res, url)) return;
    if (await handleTournamentRoutes(req, res, url)) return;

    // Default entry: login page (auction desk remains at /index.html)
    if (url.pathname === "/" || url.pathname === "/app" || url.pathname === "/app/") {
      res.writeHead(302, { Location: "/app/login.html", "Cache-Control": "no-store" });
      res.end();
      return;
    }

    if (await tryPrettyHtml(req, res, url.pathname)) return;
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: error.message || "Server error" });
    }
  }
});

runMigrationsQuiet().finally(() => {
  server.listen(PORT, () => {
    console.log(`SaaS auction API: http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/v1/health`);
    console.log("Login: POST /api/v1/auth/login  { login, password }");
    console.log("Stop with Ctrl+C");
  });
});
