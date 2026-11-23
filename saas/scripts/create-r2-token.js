const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "efb8012adbc7afcbb03fdcfd5bade02c";
const BUCKET = process.env.R2_BUCKET || "cricket-auction-media";

function readWranglerOauthToken() {
  const tomlPath = path.join(
    process.env.USERPROFILE || "",
    "AppData/Roaming/xdg.config/.wrangler/config/default.toml"
  );
  const toml = fs.readFileSync(tomlPath, "utf8");
  const token = (toml.match(/oauth_token\s*=\s*"([^"]+)/) || [])[1];
  if (!token) throw new Error("No wrangler oauth_token. Run: npx wrangler login");
  return token;
}

async function cf(pathname, { method = "GET", body, token } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  return json;
}

async function main() {
  const token = readWranglerOauthToken();

  // Permission group IDs for R2 object read/write (bucket-scoped)
  const permissionGroups = [
    { id: "2efd5506f9c8494dacb1fa10a3e7d5b6" }, // Workers R2 Storage Bucket Item Write
    { id: "6a018a9f2fc74eb6b293b0c548f38b39" } // Workers R2 Storage Bucket Item Read
  ];

  const created = await cf("/user/tokens", {
    method: "POST",
    token,
    body: {
      name: `cricket-auction-r2-${Date.now()}`,
      policies: [
        {
          effect: "allow",
          resources: {
            [`com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET}`]: "*"
          },
          permission_groups: permissionGroups
        }
      ]
    }
  });

  if (!created.success) {
    console.error(JSON.stringify(created, null, 2));
    process.exit(1);
  }

  const accessKeyId = created.result.id;
  const apiTokenValue = created.result.value;
  const secretAccessKey = crypto
    .createHash("sha256")
    .update(apiTokenValue, "utf8")
    .digest("hex");

  console.log(
    JSON.stringify(
      {
        accountId: ACCOUNT_ID,
        bucket: BUCKET,
        accessKeyId,
        secretAccessKey,
        endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
