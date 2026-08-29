const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3222;
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "..", "db", "portfolio.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));

// Migrate databases created by earlier versions without touching portfolio content.
function addColumn(table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn("admin_users", "full_name", "TEXT NOT NULL DEFAULT ''");
addColumn("admin_users", "role", "TEXT NOT NULL DEFAULT 'super_admin'");
addColumn("admin_users", "status", "TEXT NOT NULL DEFAULT 'active'");
addColumn("admin_users", "last_login_at", "TEXT");
addColumn("admin_users", "password_changed_at", "TEXT");
addColumn("admin_users", "session_version", "INTEGER NOT NULL DEFAULT 0");
addColumn("profile", "background_url", "TEXT");
addColumn("media", "width", "INTEGER");
addColumn("media", "height", "INTEGER");
addColumn("admin_sessions", "session_version", "INTEGER NOT NULL DEFAULT 0");
db.prepare("UPDATE profile SET background_url = ? WHERE background_url IS NULL").run("/images/experience.png");
const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? null : crypto.randomBytes(32).toString("hex"));
if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
const cookieName = "admin_session";
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads"));
fs.mkdirSync(uploadsDir, { recursive: true });

const rolePermissions = {
  super_admin: ["dashboard.read", "profile.read", "profile.update", "homepage.read", "homepage.update", "skills.read", "skills.create", "skills.update", "skills.delete", "skills.reorder", "experience.read", "experience.create", "experience.update", "experience.delete", "experience.reorder", "responsibilities.read", "responsibilities.create", "responsibilities.update", "responsibilities.delete", "projects.read", "projects.create", "projects.update", "projects.delete", "projects.reorder", "resume.read", "resume.upload", "resume.delete", "media.read", "media.upload", "media.delete", "media.replace", "social.read", "social.create", "social.update", "social.delete", "social.reorder", "footer.read", "footer.update", "settings.read", "settings.update", "users.read", "users.create", "users.update", "users.delete", "audit.read", "backup.read", "security.password"],
  editor: ["dashboard.read", "profile.read", "profile.update", "homepage.read", "homepage.update", "skills.read", "skills.create", "skills.update", "skills.delete", "skills.reorder", "experience.read", "experience.create", "experience.update", "experience.delete", "experience.reorder", "responsibilities.read", "responsibilities.create", "responsibilities.update", "responsibilities.delete", "projects.read", "projects.create", "projects.update", "projects.delete", "projects.reorder", "resume.read", "resume.upload", "resume.delete", "media.read", "media.upload", "media.delete", "media.replace", "social.read", "social.create", "social.update", "social.delete", "social.reorder", "footer.read", "footer.update", "security.password"],
  viewer: ["dashboard.read", "profile.read", "homepage.read", "skills.read", "experience.read", "responsibilities.read", "projects.read", "resume.read", "media.read", "social.read", "footer.read", "settings.read"]
};
for (const [name, permissions] of Object.entries(rolePermissions)) {
  db.prepare("INSERT INTO roles (name, description) VALUES (?, ?) ON CONFLICT(name) DO NOTHING").run(name, name === "super_admin" ? "Full system access" : name === "editor" ? "Portfolio content management" : "Read-only access");
  const insert = db.prepare("INSERT OR IGNORE INTO role_permissions (role_name, permission) VALUES (?, ?)");
  permissions.forEach((permission) => insert.run(name, permission));
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
const configuredOrigins = String(process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
const productionOrigins = ["https://mehadee-hassan-portfolio.vercel.app", "https://mehadee-hassan-portfolio.netlify.app"];
const allowedOrigins = [...new Set([...configuredOrigins, ...(process.env.NODE_ENV === "production" ? productionOrigins : [])])];
if (allowedOrigins.length) app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use("/api/admin", (req, res, next) => { if (["GET", "HEAD", "OPTIONS"].includes(req.method) || !req.get("origin")) return next(); const configured = process.env.APP_URL && process.env.APP_URL.replace(/\/$/, ""); const requestOrigin = `${req.protocol}://${req.get("host")}`; const origins = allowedOrigins.length ? allowedOrigins : [configured || requestOrigin]; if (!origins.includes(req.get("origin"))) return res.status(403).json({ error: "Cross-origin request rejected" }); next(); });

const now = () => new Date().toISOString();
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const safeAdmin = (user) => ({ id: user.id, full_name: user.full_name || "", email: user.email, role: user.role, status: user.status, last_login_at: user.last_login_at || null, password_changed_at: user.password_changed_at || null, created_at: user.created_at, permissions: rolePermissions[user.role] || [] });
function audit(req, action, resourceType = null, resourceId = null, metadata = null) {
  if (!req.admin) return;
  db.prepare("INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)").run(req.admin.id, action, resourceType, resourceId == null ? null : String(resourceId), metadata ? JSON.stringify(metadata) : null, req.ip, String(req.get("user-agent") || "").slice(0, 500));
}
function createSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO admin_sessions (admin_user_id, session_version, token_hash, expires_at) VALUES (?, ?, ?, ?)").run(user.id, user.session_version || 0, hashToken(token), new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString());
  return token;
}
function readSession(req) {
  const raw = (req.headers.cookie || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(`${cookieName}=`));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice(cookieName.length + 1));
  const session = db.prepare("SELECT s.*, u.session_version AS user_session_version, u.status FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id WHERE s.token_hash=? AND s.expires_at > ?").get(hashToken(token), now());
  if (!session || session.status !== "active" || session.session_version !== session.user_session_version) return null;
  db.prepare("UPDATE admin_sessions SET last_seen_at=? WHERE id=?").run(now(), session.id);
  return session;
}
function requireAdmin(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Authentication required" });
  req.admin = db.prepare("SELECT id, full_name, email, role, status, last_login_at, password_changed_at, created_at, session_version FROM admin_users WHERE id=? AND status='active'").get(session.admin_user_id);
  if (!req.admin) return res.status(401).json({ error: "Invalid session" });
  next();
}
const hasPermission = (user, permission) => (rolePermissions[user.role] || []).includes(permission);
function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.admin, permission)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
function requireSuperAdmin(req, res, next) { return req.admin.role === "super_admin" ? next() : res.status(403).json({ error: "Super Admin permission required" }); }
function cookieHeader(token, maxAge = 8 * 60 * 60) { const crossSite = process.env.NODE_ENV === "production" && allowedOrigins.length > 0; return `${cookieName}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${crossSite ? "None" : "Lax"}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
function clearSession(req, res) {
  const raw = (req.headers.cookie || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(`${cookieName}=`));
  if (raw) db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(hashToken(decodeURIComponent(raw.slice(cookieName.length + 1))));
  res.setHeader("Set-Cookie", cookieHeader("", 0));
}
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts" } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many password reset requests" } });
const passwordValid = (password) => typeof password === "string" && password.length >= 6 && password.length <= 200 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
async function sendPasswordResetEmail(email, token) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return false;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_PORT) === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined
    });
    const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Portfolio admin password reset",
      text: `Use this link within 20 minutes to reset your password: ${appUrl}/admin/?reset=${encodeURIComponent(token)}`
    });
    return true;
  } catch {
    return false;
  }
}

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM admin_users WHERE email=?").get(email);
  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password" });
  db.prepare("DELETE FROM admin_sessions WHERE admin_user_id=? AND expires_at <= ?").run(user.id, now());
  const token = createSession(user);
  db.prepare("UPDATE admin_users SET last_login_at=? WHERE id=?").run(now(), user.id);
  res.setHeader("Set-Cookie", cookieHeader(token));
  req.admin = { ...user, last_login_at: now() }; audit(req, "user.logged_in", "admin_user", user.id);
  res.json({ admin: safeAdmin(req.admin) });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => { audit(req, "user.logged_out", "admin_user", req.admin.id); clearSession(req, res); res.status(204).end(); });
app.get("/api/admin/session", requireAdmin, (req, res) => res.json({ admin: safeAdmin(req.admin) }));

app.post("/api/admin/forgot-password", resetLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const user = db.prepare("SELECT id, email FROM admin_users WHERE email=? AND status='active'").get(email);
  if (user) {
    db.prepare("DELETE FROM password_reset_tokens WHERE admin_user_id=? OR expires_at <= ?").run(user.id, now());
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO password_reset_tokens (admin_user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(user.id, hashToken(token), new Date(Date.now() + 20 * 60 * 1000).toISOString());
    await sendPasswordResetEmail(user.email, token);
  }
  res.json({ message: "If an account exists for that email, recovery instructions will be sent." });
});
app.post("/api/admin/reset-password", resetLimiter, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = req.body?.password;
  if (!token || !passwordValid(password)) return res.status(400).json({ error: "A valid reset token and strong password are required" });
  const reset = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > ?").get(hashToken(token), now());
  if (!reset) return res.status(400).json({ error: "Invalid or expired reset token" });
  const passwordHash = await bcrypt.hash(password, 12);
  const transaction = db.transaction(() => { db.prepare("UPDATE admin_users SET password_hash=?, password_changed_at=?, session_version=session_version+1 WHERE id=?").run(passwordHash, now(), reset.admin_user_id); db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").run(now(), reset.id); db.prepare("DELETE FROM admin_sessions WHERE admin_user_id=?").run(reset.admin_user_id); });
  transaction();
  res.json({ message: "Password reset successfully. You can now sign in." });
});
app.post("/api/admin/change-password", requireAdmin, requirePermission("security.password"), async (req, res) => {
  const { current_password: current, new_password: next, confirm_password: confirm } = req.body || {};
  const user = db.prepare("SELECT password_hash FROM admin_users WHERE id=?").get(req.admin.id);
  if (!(await bcrypt.compare(current || "", user.password_hash))) return res.status(400).json({ error: "Current password is incorrect" });
  if (next !== confirm || !passwordValid(next)) return res.status(400).json({ error: "New password must be confirmed and include upper/lowercase letters and a number (12+ characters)" });
  db.prepare("UPDATE admin_users SET password_hash=?, password_changed_at=?, session_version=session_version+1 WHERE id=?").run(await bcrypt.hash(next, 12), now(), req.admin.id);
  const keep = (req.headers.cookie || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(`${cookieName}=`)); const keepHash = keep ? hashToken(decodeURIComponent(keep.slice(cookieName.length + 1))) : "";
  db.prepare("DELETE FROM admin_sessions WHERE admin_user_id=? AND token_hash != ?").run(req.admin.id, keepHash);
  if (keepHash) db.prepare("UPDATE admin_sessions SET session_version=session_version+1 WHERE admin_user_id=? AND token_hash=?").run(req.admin.id, keepHash);
  audit(req, "password.changed", "admin_user", req.admin.id); res.json({ message: "Password changed successfully." });
});

const resources = {
  profiles: { table: "profile", singleton: true, permission: "profile", required: ["name", "greeting", "bio"], fields: ["name", "greeting", "bio", "background_url", "photo_url", "resume_url", "is_active"] },
  skills: { table: "skills", permission: "skills", required: ["category", "details"], fields: ["category", "details", "sort_order", "is_active"] },
  experiences: { table: "experiences", permission: "experience", required: ["company", "duration", "role", "project"], fields: ["company", "duration", "role", "project", "logo_url", "sort_order", "is_active"] },
  responsibilities: { table: "experience_responsibilities", permission: "responsibilities", required: ["experience_id", "responsibility"], fields: ["experience_id", "responsibility", "sort_order", "is_active"] },
  projects: { table: "projects", permission: "projects", required: ["name", "description", "project_url"], fields: ["name", "description", "logo_url", "project_url", "sort_order", "is_active"] },
  "social-links": { table: "social_links", permission: "social", required: ["label", "url", "placement"], fields: ["label", "url", "icon", "placement", "sort_order", "is_active"] },
  settings: { table: "settings", permission: "settings", key: "key", required: ["key", "value"], fields: ["key", "value", "is_active"] },
  media: { table: "media", permission: "media", fields: ["filename", "original_name", "mime_type", "size", "url"] }
};
function clean(input, fields) {
  const out = {};
  for (const field of fields) if (Object.prototype.hasOwnProperty.call(input || {}, field)) {
    const value = input[field];
    if (field === "is_active") { if (![0, 1, true, false].includes(value)) throw new Error("is_active must be boolean"); out[field] = value ? 1 : 0; }
    else if (["sort_order", "experience_id", "size"].includes(field)) { const number = Number(value); const minimum = field === "experience_id" ? 1 : 0; if (!Number.isInteger(number) || number < minimum) throw new Error(`${field} must be a ${minimum ? "positive" : "non-negative"} integer`); out[field] = number; }
    else { if (typeof value !== "string" || value.length > 10000) throw new Error(`${field} must be a string`); const text = value.trim(); if (field === "placement" && !["contact", "follow"].includes(text)) throw new Error("placement must be contact or follow"); if (field.endsWith("_url") || field === "url") { if (text && !text.startsWith("/") && !/^https?:\/\/[^\s]+$/i.test(text)) throw new Error(`${field} must be an HTTP(S) or relative URL`); } if (field === "key" && !/^[a-zA-Z0-9_.-]{1,100}$/.test(text)) throw new Error("key contains invalid characters"); out[field] = text; }
  }
  return out;
}
function validateRequired(data, config) {
  const missing = (config.required || []).filter((field) => data[field] === undefined || data[field] === "");
  if (missing.length) throw new Error(`${missing.join(", ")} must not be empty`);
}
function mutationPermission(config, action) { return `${config.permission}.${action}`; }
function resourcePermission(config, action, req) {
  if (config.table !== "settings") return `${config.permission}.${action}`;
  const key = String(req.query.group || (req.method === "POST" ? req.body?.key : req.params.id) || "");
  if (key === "home" || /^(navbar|homepage)_/.test(key)) return `homepage.${action}`;
  if (key === "footer" || /^(contact|follow|copyright)_/.test(key)) return `footer.${action}`;
  return `settings.${action}`;
}
function requireResourcePermission(config, action) {
  return (req, res, next) => hasPermission(req.admin, resourcePermission(config, action, req)) ? next() : res.status(403).json({ error: "Forbidden" });
}
function resourceRoutes(name, config) {
  const base = `/api/admin/${name}`;
  const orderBy = config.singleton ? "id" : config.table === "settings" ? "key" : config.table === "media" ? "created_at DESC, id DESC" : "sort_order, id";
  app.get(base, requireAdmin, requireResourcePermission(config, "read"), (req, res) => {
    let items;
    if (config.table === "settings" && req.query.group) {
      const prefixes = req.query.group === "home" ? ["navbar_%", "homepage_%"] : req.query.group === "footer" ? ["contact_%", "follow_%", "copyright_%"] : [];
      if (!prefixes.length) return res.status(400).json({ error: "Unknown settings group" });
      items = db.prepare(`SELECT * FROM settings WHERE ${prefixes.map(() => "key LIKE ?").join(" OR ")} ORDER BY ${orderBy}`).all(...prefixes);
    } else {
      items = db.prepare(`SELECT * FROM ${config.table} ORDER BY ${orderBy}`).all();
    }
    if (config.table === "media") items.forEach((item) => { item.usage = findMediaReferences(item.url); }); res.json(items);
  });
  app.post(base, requireAdmin, requireResourcePermission(config, config.singleton ? "update" : "create"), (req, res) => {
    try {
      const data = clean(req.body, config.fields); if (!Object.keys(data).length) return res.status(400).json({ error: "Request body is empty" }); validateRequired(data, config);
      if (config.table === "experience_responsibilities" && data.experience_id) data.sort_order = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM experience_responsibilities WHERE experience_id=?").get(data.experience_id).next;
      if (config.singleton) db.prepare(`INSERT INTO profile (id, ${Object.keys(data).join(",")}) VALUES (1, ${Object.keys(data).map((key) => `@${key}`).join(",")}) ON CONFLICT(id) DO UPDATE SET ${Object.keys(data).map((key) => `${key}=@${key}`).join(",")}`).run(data);
      else db.prepare(`INSERT INTO ${config.table} (${Object.keys(data).join(",")}) VALUES (${Object.keys(data).map((key) => `@${key}`).join(",")})`).run(data);
      const id = config.singleton ? 1 : config.key ? data[config.key] : db.prepare("SELECT last_insert_rowid() AS id").get().id;
      audit(req, `${name}.${config.singleton ? "updated" : "created"}`, name, id); res.status(201).json(db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key || "id"}=?`).get(id));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  if (!config.singleton && config.fields.includes("sort_order")) app.patch(`${base}/reorder`, requireAdmin, requireResourcePermission(config, "reorder"), (req, res) => { const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : []; if (!ids.length || ids.some((id) => !Number.isInteger(id) || id < 1)) return res.status(400).json({ error: "ids must be a non-empty array of positive integers" }); const update = db.prepare(`UPDATE ${config.table} SET sort_order=? WHERE id=?`); db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))(); audit(req, `${name}.reordered`, name); res.json({ message: "Order updated" }); });
  const update = (req, res) => {
    const id = config.singleton ? 1 : config.key ? decodeURIComponent(req.params.id) : Number(req.params.id);
    if ((!config.key && (!Number.isInteger(id) || id < 1)) || (config.key && !id)) return res.status(400).json({ error: "Invalid id" });
    try {
      if (req.method === "DELETE") {
        if (config.table === "media") {
          const media = db.prepare("SELECT * FROM media WHERE id=?").get(id); if (!media) return res.status(404).json({ error: "Not found" });
          const references = findMediaReferences(media.url); if (references.length) return res.status(409).json({ error: `Media is still in use by ${references.join(", ")}` });
          db.prepare("DELETE FROM media WHERE id=?").run(id); const file = path.join(uploadsDir, path.basename(media.filename)); if (file.startsWith(`${uploadsDir}${path.sep}`) && fs.existsSync(file)) fs.unlinkSync(file);
        } else { const result = db.prepare(`DELETE FROM ${config.table} WHERE ${config.key || "id"}=?`).run(id); if (!result.changes) return res.status(404).json({ error: "Not found" }); }
        audit(req, `${name}.deleted`, name, id); return res.status(204).end();
      }
      const data = clean(req.body, config.fields); if (!Object.keys(data).length) return res.status(400).json({ error: "Request body is empty" });
      const existing = db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key || "id"}=?`).get(id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (config.key && data.key !== undefined && data.key !== id) return res.status(400).json({ error: "Setting key cannot be changed" });
      validateRequired({ ...existing, ...data }, config);
      const result = db.prepare(`UPDATE ${config.table} SET ${Object.keys(data).map((key) => `${key}=@${key}`).join(",")} WHERE ${config.key || "id"}=@id`).run({ ...data, id });
      if (!result.changes) return res.status(404).json({ error: "Not found" }); audit(req, `${name}.updated`, name, id); res.json(db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key || "id"}=?`).get(id));
    } catch (error) { res.status(400).json({ error: error.message }); }
  };
  app.put(`${base}/:id`, requireAdmin, requireResourcePermission(config, "update"), update);
  app.patch(`${base}/:id`, requireAdmin, requireResourcePermission(config, "update"), update);
  app.delete(`${base}/:id`, requireAdmin, requireResourcePermission(config, "delete"), update);
}
function findMediaReferences(url) {
  const refs = [];
  const profile = db.prepare("SELECT id FROM profile WHERE photo_url=? OR background_url=? OR resume_url=?").get(url, url, url);
  if (profile) refs.push("Profile");
  db.prepare("SELECT company FROM experiences WHERE logo_url=?").all(url).forEach((item) => refs.push(item.company || "Experience"));
  db.prepare("SELECT name FROM projects WHERE logo_url=?").all(url).forEach((item) => refs.push(item.name || "Project"));
  return refs;
}
Object.entries(resources).forEach(([name, config]) => resourceRoutes(name, config));

const storage = multer.diskStorage({ destination: uploadsDir, filename: (req, file, cb) => { const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" }[file.mimetype] || ""; cb(null, `${crypto.randomBytes(16).toString("hex")}${extension}`); } });
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype)) });
function validSignature(file) { const bytes = fs.readFileSync(file.path); const type = file.mimetype; return type === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : type === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) : type === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" : false; }
function imageDimensions(file) { const bytes = fs.readFileSync(file.path); if (file.mimetype === "image/png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; if (file.mimetype === "image/webp" && bytes.length >= 30) { const chunk = bytes.subarray(12, 16).toString(); if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }; if (chunk === "VP8L" && bytes.length >= 25) { const bits = bytes.readUInt32LE(21); return { width: 1 + ((bits >>> 8) & 0x3fff), height: 1 + ((bits >>> 22) & 0x3fff) }; } } if (file.mimetype === "image/jpeg") { let offset = 2; while (offset + 9 < bytes.length) { if (bytes[offset] !== 0xff) { offset++; continue; } const marker = bytes[offset + 1]; const length = bytes.readUInt16BE(offset + 2); if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }; offset += 2 + length; } } return { width: null, height: null }; }
app.post("/api/admin/media/upload", requireAdmin, requirePermission("media.upload"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Only valid JPEG, PNG, WEBP, or PDF files up to 5 MB are accepted" });
  if (!validSignature(req.file)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "File contents do not match the declared type" }); }
  const filename = path.basename(req.file.filename); const url = `/uploads/${encodeURIComponent(filename)}`; const dimensions = req.file.mimetype.startsWith("image/") ? imageDimensions(req.file) : { width: null, height: null };
  const result = db.prepare("INSERT INTO media (filename, original_name, mime_type, size, width, height, url) VALUES (?, ?, ?, ?, ?, ?, ?)").run(filename, String(req.file.originalname).slice(0, 255), req.file.mimetype, req.file.size, dimensions.width, dimensions.height, url);
  audit(req, "media.uploaded", "media", result.lastInsertRowid, { mime_type: req.file.mimetype, size: req.file.size }); res.status(201).json(db.prepare("SELECT * FROM media WHERE id=?").get(result.lastInsertRowid));
});
app.post("/api/admin/media/:id/replace", requireAdmin, requirePermission("media.replace"), upload.single("file"), (req, res) => {
  const media = db.prepare("SELECT * FROM media WHERE id=?").get(Number(req.params.id));
  if (!media) return res.status(404).json({ error: "Media not found" });
  if (!req.file) return res.status(400).json({ error: "Only valid JPEG, PNG, WEBP, or PDF files up to 5 MB are accepted" });
  if (!validSignature(req.file)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "File contents do not match the declared type" }); }
  const oldPath = path.join(uploadsDir, path.basename(media.filename)); const filename = path.basename(req.file.filename); const url = `/uploads/${encodeURIComponent(filename)}`; const dimensions = req.file.mimetype.startsWith("image/") ? imageDimensions(req.file) : { width: null, height: null };
  const replace = db.transaction(() => {
    db.prepare("UPDATE profile SET photo_url=? WHERE photo_url=?").run(url, media.url);
    db.prepare("UPDATE profile SET background_url=? WHERE background_url=?").run(url, media.url);
    db.prepare("UPDATE profile SET resume_url=? WHERE resume_url=?").run(url, media.url);
    db.prepare("UPDATE experiences SET logo_url=? WHERE logo_url=?").run(url, media.url);
    db.prepare("UPDATE projects SET logo_url=? WHERE logo_url=?").run(url, media.url);
    db.prepare("UPDATE media SET filename=?, original_name=?, mime_type=?, size=?, width=?, height=?, url=? WHERE id=?").run(filename, String(req.file.originalname).slice(0, 255), req.file.mimetype, req.file.size, dimensions.width, dimensions.height, url, media.id);
  });
  try { replace(); } catch (error) { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); throw error; }
  if (oldPath.startsWith(`${uploadsDir}${path.sep}`) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  audit(req, "media.replaced", "media", media.id, { mime_type: req.file.mimetype, size: req.file.size }); res.json(db.prepare("SELECT * FROM media WHERE id=?").get(media.id));
});
app.use("/uploads", express.static(uploadsDir, { dotfiles: "deny" }));

app.get("/healthz", (req, res) => res.json({ status: "ok" }));
app.get("/api/admin/dashboard", requireAdmin, requirePermission("dashboard.read"), (req, res) => {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  res.json({ counts: { skills: count("skills"), experiences: count("experiences"), projects: count("projects"), media: count("media"), admin_users: count("admin_users"), social_links: count("social_links") }, lastLogin: req.admin.last_login_at, lastContentUpdate: db.prepare("SELECT created_at FROM audit_logs WHERE action LIKE '%.updated' OR action LIKE '%.created' ORDER BY id DESC LIMIT 1").get()?.created_at || null, lastMediaUpload: db.prepare("SELECT created_at FROM media ORDER BY id DESC LIMIT 1").get()?.created_at || null, recentActivity: db.prepare("SELECT id, action, resource_type, resource_id, created_at FROM audit_logs ORDER BY id DESC LIMIT 10").all(), health: { database: "Connected", api: "Healthy", mediaStorage: fs.existsSync(uploadsDir) ? "Configured" : "Unavailable", authentication: "Active" } });
});
app.get("/api/admin/health", requireAdmin, requirePermission("dashboard.read"), (req, res) => res.json({ database: { type: "SQLite", status: "Connected" }, mediaStorage: { provider: process.env.MEDIA_STORAGE_PROVIDER || "local", configured: fs.existsSync(uploadsDir) }, authentication: { enabled: true, sessionHours: 8 } }));
app.get("/api/admin/users", requireAdmin, requirePermission("users.read"), (req, res) => { const search = String(req.query.search || "").trim(); const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)); const where = search ? "WHERE email LIKE @search OR full_name LIKE @search" : ""; const params = search ? { search: `%${search}%` } : {}; const total = db.prepare(`SELECT COUNT(*) AS count FROM admin_users ${where}`).get(params).count; const users = db.prepare(`SELECT id, full_name, email, role, status, last_login_at, created_at FROM admin_users ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset: (page - 1) * limit }); res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); });
app.get("/api/admin/roles", requireAdmin, requirePermission("users.read"), (req, res) => res.json(Object.entries(rolePermissions).map(([name, permissions]) => ({ name, description: db.prepare("SELECT description FROM roles WHERE name=?").get(name)?.description || "", permissions })))); 
app.post("/api/admin/users", requireAdmin, requireSuperAdmin, (req, res) => { const { full_name = "", email, password, role = "editor", status = "active" } = req.body || {}; if (typeof full_name !== "string" || !full_name.trim() || full_name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")) || !passwordValid(password) || !Object.hasOwn(rolePermissions, role) || !["active", "inactive"].includes(status)) return res.status(400).json({ error: "Valid full name, email, strong password, role, and status are required" }); try { const result = db.prepare("INSERT INTO admin_users (full_name,email,password_hash,role,status,password_changed_at) VALUES (?,?,?,?,?,?)").run(full_name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 12), role, status, now()); audit(req, "admin_user.created", "admin_user", result.lastInsertRowid, { role }); res.status(201).json(safeAdmin(db.prepare("SELECT * FROM admin_users WHERE id=?").get(result.lastInsertRowid))); } catch (error) { res.status(409).json({ error: "Email is already in use" }); } });
app.post("/api/admin/users/:id/reset-password", requireAdmin, requireSuperAdmin, resetLimiter, async (req, res) => { const target = db.prepare("SELECT id, email, status FROM admin_users WHERE id=?").get(Number(req.params.id)); if (!target || target.status !== "active") return res.status(404).json({ error: "User not found" }); db.prepare("DELETE FROM password_reset_tokens WHERE admin_user_id=?").run(target.id); const token = crypto.randomBytes(32).toString("base64url"); db.prepare("INSERT INTO password_reset_tokens (admin_user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(target.id, hashToken(token), new Date(Date.now() + 20 * 60 * 1000).toISOString()); await sendPasswordResetEmail(target.email, token); audit(req, "admin_user.password_reset_requested", "admin_user", target.id); res.json({ message: "A password recovery email will be sent if email delivery is configured." }); });
app.patch("/api/admin/users/:id", requireAdmin, requireSuperAdmin, async (req, res) => { const id = Number(req.params.id); const target = db.prepare("SELECT * FROM admin_users WHERE id=?").get(id); if (!target) return res.status(404).json({ error: "User not found" }); const body = req.body || {}; const nextName = String(body.full_name ?? target.full_name).trim(); const nextEmail = String(body.email ?? target.email).trim().toLowerCase(); const nextRole = body.role || target.role; const nextStatus = body.status || target.status; const superCount = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role='super_admin' AND status='active'").get().count; if (!nextName || nextName.length > 120) return res.status(400).json({ error: "A valid full name is required" }); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return res.status(400).json({ error: "A valid email is required" }); if (db.prepare("SELECT id FROM admin_users WHERE email=? AND id != ?").get(nextEmail, id)) return res.status(409).json({ error: "Email is already in use" }); if (target.role === "super_admin" && target.status === "active" && (nextRole !== "super_admin" || nextStatus !== "active") && superCount <= 1) return res.status(400).json({ error: "The last active Super Admin cannot be disabled or demoted" }); if (!Object.hasOwn(rolePermissions, nextRole) || !["active", "inactive"].includes(nextStatus)) return res.status(400).json({ error: "Invalid role or status" }); let passwordHash = target.password_hash; if (body.password !== undefined) { if (!passwordValid(body.password)) return res.status(400).json({ error: "Password must be at least 12 characters with upper/lowercase letters and a number" }); passwordHash = await bcrypt.hash(body.password, 12); } db.prepare("UPDATE admin_users SET full_name=?, email=?, role=?, status=?, password_hash=?, password_changed_at=?, session_version=session_version+1 WHERE id=?").run(nextName, nextEmail, nextRole, nextStatus, passwordHash, body.password ? now() : target.password_changed_at, id); if (nextStatus === "inactive" || body.password) db.prepare("DELETE FROM admin_sessions WHERE admin_user_id=?").run(id); audit(req, body.password ? "admin_user.password_reset" : "admin_user.updated", "admin_user", id, { role: nextRole, status: nextStatus }); res.json(safeAdmin(db.prepare("SELECT * FROM admin_users WHERE id=?").get(id))); });
app.delete("/api/admin/users/:id", requireAdmin, requireSuperAdmin, (req, res) => { const id = Number(req.params.id); const target = db.prepare("SELECT role,status FROM admin_users WHERE id=?").get(id); if (!target) return res.status(404).json({ error: "User not found" }); const count = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role='super_admin' AND status='active'").get().count; if (target.role === "super_admin" && count <= 1) return res.status(400).json({ error: "The last active Super Admin cannot be deleted" }); db.prepare("DELETE FROM admin_users WHERE id=?").run(id); audit(req, "admin_user.deleted", "admin_user", id); res.status(204).end(); });
app.get("/api/admin/audit-logs", requireAdmin, requirePermission("audit.read"), (req, res) => { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10)); const total = db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get().count; const logs = db.prepare("SELECT id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at FROM audit_logs ORDER BY id DESC LIMIT @limit OFFSET @offset").all({ limit, offset: (page - 1) * limit }); res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); });
app.get("/api/admin/backup", requireAdmin, requirePermission("backup.read"), (req, res) => { const backup = `${dbPath}.${Date.now()}.bak`; db.backup(backup).then(() => { audit(req, "database.backup_created", "database"); res.download(backup, "portfolio-backup.sqlite", () => { if (fs.existsSync(backup)) fs.unlinkSync(backup); }); }).catch(() => res.status(500).json({ error: "Backup could not be created" })); });

app.get("/api/public/portfolio", (req, res, next) => { try { const active = "WHERE is_active=1"; const profile = db.prepare(`SELECT name,greeting,bio,background_url AS backgroundUrl,photo_url AS photoUrl,resume_url AS resumeUrl FROM profile ${active} LIMIT 1`).get() || null; const skills = db.prepare(`SELECT category,details,sort_order AS sortOrder FROM skills ${active} ORDER BY sort_order,id`).all(); const experiences = db.prepare(`SELECT id,company,duration,role,project,logo_url AS logoUrl,sort_order AS sortOrder FROM experiences ${active} ORDER BY sort_order,id`).all(); const responsibilities = db.prepare("SELECT experience_id AS experienceId,responsibility,sort_order AS sortOrder FROM experience_responsibilities WHERE is_active=1 ORDER BY experience_id,sort_order,id").all(); experiences.forEach((item) => { item.responsibilities = responsibilities.filter((entry) => entry.experienceId === item.id).map((entry) => entry.responsibility); delete item.id; delete item.sortOrder; }); const projects = db.prepare(`SELECT name,description,logo_url AS logoUrl,project_url AS projectUrl FROM projects ${active} ORDER BY sort_order,id`).all(); const socialLinks = db.prepare(`SELECT label,url,icon,placement FROM social_links ${active} ORDER BY placement,sort_order,id`).all(); const settings = Object.fromEntries(db.prepare(`SELECT key,value FROM settings ${active} ORDER BY key`).all().map(({ key, value }) => [key, value])); res.json({ profile, skills, experiences, projects, socialLinks, settings }); } catch (error) { next(error); } });
// Keep deployment files and the SQLite database outside the public asset tree.
app.use(["/db", "/server", "/node_modules"], (req, res) => res.status(404).json({ error: "Not found" }));
app.use(express.static(path.join(__dirname, ".."), { dotfiles: "deny" }));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((error, req, res, next) => { if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: "Invalid JSON body" }); if (error instanceof multer.MulterError || error.message === "Unexpected field") return res.status(400).json({ error: "Invalid upload (images and PDFs up to 5 MB are accepted)" }); console.error(error); res.status(500).json({ error: "Internal server error" }); });
if (require.main === module) app.listen(port, () => console.log(`Portfolio server listening on http://localhost:${port}`));
module.exports = { app, db, rolePermissions };
