const { sendJson, readJson } = require("../lib/http");
const { authenticateRequest } = require("../lib/auth");
const {
  createUploadUrl,
  mediaKey,
  publicUrlForKey,
  deleteObjectQuiet
} = require("../lib/r2");
const { query } = require("../db/pool");
const { requireOrgRole } = require("./orgs");

async function handleMediaRoutes(req, res, url) {
  if (url.pathname === "/api/v1/media/sign-upload" && req.method === "POST") {
    const user = await authenticateRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }
    const body = await readJson(req);
    const orgId = body.orgId;
    const tournamentId = body.tournamentId || null;
    const purpose = body.purpose || "upload";
    const fileName = body.fileName || "file.bin";
    const contentType = body.contentType || "application/octet-stream";

    if (!orgId) {
      sendJson(res, 400, { error: "orgId required" });
      return true;
    }
    const access = await requireOrgRole(user, orgId, ["owner", "admin", "auctioneer"]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    const objectKey = mediaKey({ orgId, tournamentId, purpose, fileName });
    const signed = await createUploadUrl({ objectKey, contentType });
    await query(
      `INSERT INTO media_objects (org_id, object_key, content_type, purpose)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (object_key) DO NOTHING`,
      [orgId, objectKey, contentType, purpose]
    );
    sendJson(res, 200, {
      ...signed,
      publicUrl: signed.publicUrl || publicUrlForKey(objectKey)
    });
    return true;
  }

  if (url.pathname === "/api/v1/media" && req.method === "DELETE") {
    const user = await authenticateRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }
    const body = await readJson(req);
    const objectKey = String(body.objectKey || body.key || "").trim();
    const orgId = body.orgId;
    if (!objectKey || !orgId) {
      sendJson(res, 400, { error: "orgId and objectKey required" });
      return true;
    }
    const access = await requireOrgRole(user, orgId, ["owner", "admin", "auctioneer"]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const owned = await query(
      `SELECT object_key FROM media_objects WHERE org_id = $1 AND object_key = $2 LIMIT 1`,
      [orgId, objectKey]
    );
    if (!owned.rows[0] && !objectKey.startsWith(`org/${orgId}/`)) {
      sendJson(res, 404, { error: "Media not found for this org" });
      return true;
    }
    await deleteObjectQuiet(objectKey);
    await query(`DELETE FROM media_objects WHERE object_key = $1`, [objectKey]);
    sendJson(res, 200, { deleted: true, objectKey });
    return true;
  }

  return false;
}

module.exports = { handleMediaRoutes };
