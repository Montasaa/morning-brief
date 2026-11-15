// A sign-in link without email, for whoever can run commands on the server
// (for example while Resend is not connected). Run inside the app container:
//   docker exec morning-brief node scripts/sign-in-link.mjs [email] [minutes]
// email defaults to OWNER_EMAIL; minutes (default 15) is how long the link works.
// The link is single use, like the emailed one (src/server/readers/sign-in.ts:
// issueLink, readers.ts: newToken/hashToken), and only for someone who may
// sign in: an active Reader (the Owner included). It is printed, never logged.
import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";

const email = (process.argv[2] || process.env.OWNER_EMAIL || "").trim().toLowerCase();
const minutes = Number(process.argv[3] || 15);
const origin = (process.env.PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
const basePath = process.env.BASE_PATH ?? "/brief";

if (!email) fail("No email: pass one, or set OWNER_EMAIL.");
if (!origin) fail("PUBLIC_ORIGIN is not set, so there is no address to link to.");
if (!(minutes > 0 && minutes <= 24 * 60)) fail("minutes must be between 1 and 1440.");

const db = new Database(process.env.DATABASE_PATH || "data/brief.db", { fileMustExist: true });
const reader = db.prepare("SELECT id FROM readers WHERE email = ? AND revoked_at_ms IS NULL").get(email);
if (!reader) fail(`${email} is not an active Reader. Invite them from the Owner console first.`);

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const now = Date.now();
db.prepare("INSERT INTO magic_links (token_hash, email, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)").run(
  hash,
  email,
  now,
  now + minutes * 60 * 1000,
);
db.close();

console.log(`${origin}${basePath}/api/auth/callback?token=${token}`);
console.error(`Single use, for ${email}, works for ${minutes} minutes.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
