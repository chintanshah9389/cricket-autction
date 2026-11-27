const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let client = null;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing in .env`);
  return value;
}

function workerBase() {
  const url = String(process.env.R2_WORKER_URL || "").replace(/\/$/, "");
  return url || null;
}

function workerSecret() {
  return process.env.R2_WORKER_SECRET || "";
}

function usesWorker() {
  return Boolean(workerBase() && workerSecret());
}

function getEndpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.replace(/\/$/, "");
  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  throw new Error("Set R2_ENDPOINT (Railway/S3) or R2_ACCOUNT_ID (Cloudflare R2) in .env");
}

function getR2Client() {
  if (client) return client;
  client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: getEndpoint(),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY")
    }
  });
  return client;
}

function bucket() {
  return required("R2_BUCKET");
}

function publicUrlForKey(objectKey) {
  if (!objectKey) return null;
  const base = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${String(objectKey).replace(/^\//, "")}`;
}

function keyFromPublicUrl(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  const base = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (base && value.startsWith(`${base}/`)) {
    return decodeURIComponent(value.slice(base.length + 1));
  }
  if (value.startsWith("org/")) return value;
  return null;
}

function resolveMediaKey(entity, keyField, urlField) {
  if (!entity || typeof entity !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(entity, keyField)) {
    const direct = entity[keyField];
    if (direct != null && direct !== "") return String(direct);
    // Empty/null key: still try URL recovery so Excel merges don't orphan R2 photos.
  }
  const snake = keyField.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  if (Object.prototype.hasOwnProperty.call(entity, snake)) {
    const direct = entity[snake];
    if (direct != null && direct !== "") return String(direct);
  }
  return keyFromPublicUrl(entity[urlField]);
}

async function deleteObjectQuiet(objectKey) {
  if (!objectKey) return;
  try {
    await deleteObject(objectKey);
  } catch (_) {
    // best-effort cleanup
  }
}

function objectWorkerUrl(objectKey) {
  return `${workerBase()}/object/${encodeURIComponent(String(objectKey).replace(/^\//, ""))}`;
}

async function pingR2() {
  if (usesWorker()) {
    const response = await fetch(`${workerBase()}/bucket`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${workerSecret()}` }
    });
    if (!response.ok) {
      throw new Error(`R2 worker ping failed: HTTP ${response.status}`);
    }
    return true;
  }
  await getR2Client().send(new HeadBucketCommand({ Bucket: bucket() }));
  return true;
}

async function createUploadUrl({ objectKey, contentType, expiresIn = 900 }) {
  if (usesWorker()) {
    return {
      uploadUrl: objectWorkerUrl(objectKey),
      uploadHeaders: {
        Authorization: `Bearer ${workerSecret()}`,
        "Content-Type": contentType || "application/octet-stream"
      },
      objectKey,
      publicUrl: publicUrlForKey(objectKey),
      expiresIn,
      mode: "worker"
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ContentType: contentType || "application/octet-stream"
  });
  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn });
  return {
    uploadUrl,
    objectKey,
    publicUrl: publicUrlForKey(objectKey),
    expiresIn,
    mode: "s3"
  };
}

async function deleteObject(objectKey) {
  if (usesWorker()) {
    const response = await fetch(objectWorkerUrl(objectKey), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${workerSecret()}` }
    });
    if (!response.ok) {
      throw new Error(`R2 worker delete failed: HTTP ${response.status}`);
    }
    return;
  }
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: objectKey
    })
  );
}

async function getObjectStream(objectKey, { range } = {}) {
  if (!objectKey) throw new Error("objectKey required");
  if (usesWorker()) {
    const headers = { Authorization: `Bearer ${workerSecret()}` };
    if (range) headers.Range = range;
    const response = await fetch(objectWorkerUrl(objectKey), { headers });
    if (!(response.ok || response.status === 206)) {
      const error = new Error(`R2 worker get failed: HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return {
      body: response.body,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      contentLength: response.headers.get("content-length"),
      contentRange: response.headers.get("content-range"),
      acceptRanges: response.headers.get("accept-ranges") || "bytes",
      statusCode: response.status
    };
  }
  const result = await getR2Client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: objectKey,
      ...(range ? { Range: range } : {})
    })
  );
  return {
    body: result.Body,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength != null ? String(result.ContentLength) : null,
    contentRange: result.ContentRange || null,
    acceptRanges: "bytes",
    statusCode: result.ContentRange ? 206 : 200
  };
}

function mediaKey({ orgId, tournamentId, purpose, fileName }) {
  const safePurpose = String(purpose || "file").replace(/[^a-z0-9_-]/gi, "");
  const safeName = String(fileName || "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const parts = ["org", orgId];
  if (tournamentId) parts.push("tournaments", tournamentId);
  parts.push(safePurpose, `${Date.now()}-${safeName}`);
  return parts.join("/");
}

module.exports = {
  getR2Client,
  pingR2,
  createUploadUrl,
  deleteObject,
  deleteObjectQuiet,
  getObjectStream,
  publicUrlForKey,
  keyFromPublicUrl,
  resolveMediaKey,
  mediaKey,
  usesWorker
};
