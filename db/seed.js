const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const bootstrapEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_BOOTSTRAP_EMAIL;
const bootstrapPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_BOOTSTRAP_PASSWORD;
if (!bootstrapEmail || !bootstrapPassword) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin user.");
}
if (process.env.NODE_ENV === "production" && (bootstrapEmail.trim().toLowerCase() === "admin@example.com" || bootstrapPassword === "replace-with-a-unique-strong-password")) {
  throw new Error("Production bootstrap credentials must be changed before seeding.");
}
if (bootstrapPassword.length < 6 || !/[a-z]/.test(bootstrapPassword) || !/[A-Z]/.test(bootstrapPassword) || !/\d/.test(bootstrapPassword)) throw new Error("Bootstrap password must be 6+ characters with upper/lowercase letters and a number.");
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "portfolio.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
if (!db.prepare("PRAGMA table_info(experience_responsibilities)").all().some((column) => column.name === "is_active")) {
  db.exec("ALTER TABLE experience_responsibilities ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))");
}
const seed = db.transaction(() => {
  db.prepare("INSERT INTO admin_users (full_name, email, password_hash, role, status, password_changed_at) VALUES (?, ?, ?, 'super_admin', 'active', CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING").run(
    "Bootstrap administrator", bootstrapEmail.trim().toLowerCase(), bcrypt.hashSync(bootstrapPassword, 12)
  );
  // Never overwrite existing portfolio content when running a deployment migration.
  if (db.prepare("SELECT COUNT(*) AS count FROM profile").get().count) return;
  db.prepare("INSERT INTO profile (id, name, greeting, bio, background_url, photo_url, resume_url) VALUES (1, ?, ?, ?, ?, ?, ?)").run(
    "Mehadee Hassan", "আসসালামুআলাইকুম, আমার নাম মেহেদী হাসান",
    "আমার জীবনের সবচেয়ে সুন্দর সময়টা এখন শুরু হইছে। নতুন স্বপ্ন নতুন দায়িত্ব আর আসার আলো নিয়ে আমার পথ চলা শুরু করেছি। আমি বিশ্বাস করি-পরিশ্রম, ভালোবাসা আর সততা থাকলে প্রতিটি দিন হতে পারে নতুন সাফল্যের গল্প।",
    "/images/experience.png", "/images/logo_ai.webp", "/files/Mehadee-Hassan.pdf"
  );
  const skill = db.prepare("INSERT INTO skills (category, details, sort_order) VALUES (?, ?, ?)");
  [
    ["FRONTEND DEVELOPMENT", "React.js, Next.js, TypeScript, Redux / Redux Toolkit, Tailwind CSS, Bootstrap, HTML5, CSS, Responsive Web Design."],
    ["BACKEND DEVELOPMENT", "Node.js, Express.js, RESTful API Design & Development, Modular Architecture Pattern, JWT Authentication & Authorization, BetterAuth, Role Based Access Control (RBAC)."],
    ["UI LIBRARIES", "ShadCN, Hero UI."], ["PAYMENT INTEGRATION", "Stripe, SSLCommerz."],
    ["TESTING", "Unit & Integration Testing Fundamentals."], ["DATABASE & ORM", "MySQL (Sequelize ORM), MongoDB (Mongoose ODM)."],
    ["LANGUAGE", "JavaScript (ES6+)."], ["AI-ASSISTED DEVELOPMENT", "AI Integration, AI-Assisted Coding, AI-Driven Debugging & Code Review."],
    ["LIBRARIES & TOOLS", "Axios, React Router DOM, Multer & Cloudinary, JS-Cookie, React Hot Toast, SweetAlert2."],
    ["VERSION CONTROL", "Git, GitHub."], ["TOOLS & PLATFORMS", "VS Code, Vercel, Live Server, Postman, DBeaver."],
    ["PROJECT MANAGEMENT TOOLS", "Jira."], ["COLLABORATION", "Slack."]
  ].forEach((row, i) => skill.run(row[0], row[1], i + 1));
  const experience = db.prepare("INSERT INTO experiences (company, duration, role, project, logo_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)"), responsibility = db.prepare("INSERT INTO experience_responsibilities (experience_id, responsibility, sort_order) VALUES (?, ?, ?)");
  [
    ["Mission Hospital Feni", "4.2 years", "Marketing And Advertising Manager", "Healthcare brand consultant", "/images/Mission_hp%20.png", ["Stratgegic Marketing Planning.", "Digital Marketing & Advertising.", "Patient Acquisition & Retention."]],
    ["Pravva Health", "2 Month", "Sales Executive", "Sales & Business Development", "/images/praava.svg", ["Promoted Praava Health healthcare packages and services.", "Identified new sales opportunities through networking.", "Maintained strong relationships with existing clients."]],
    ["Al Aksa Hospital Feni Ltd", "8 Month", "Lead Marketing And Advertising Manager", "Healthcare brand consultant", "/images/alaksa.png", ["Develop and execute comprehensive marketing and advertising strategies.", "Oversee offline promotional activities including health camps and outreach programs.", "Analyze campaign performance and patient engagement data."]]
  ].forEach((row, i) => { const result = experience.run(row[0], row[1], row[2], row[3], row[4], i + 1); row[5].forEach((text, j) => responsibility.run(result.lastInsertRowid, text, j + 1)); });
  const project = db.prepare("INSERT INTO projects (name, description, logo_url, project_url, sort_order) VALUES (?, ?, ?, ?, ?)");
  [
    ["Shops", "এটি একটি আধুনিক ফুল-স্ট্যাক ই-কমার্স প্ল্যাটফর্ম, যেখানে গ্রাহকরা সহজে প্রোডাক্ট ব্রাউজ, সার্চ ও অর্ডার করতে পারেন, আর অ্যাডমিনরা একটি সুরক্ষিত ড্যাশবোর্ড থেকে পুরো ইনভেন্টরি নিয়ন্ত্রণ করতে পারেন।", "https://shops-mehadee-hassan.vercel.app/assets/Logo-BPTDrPQZ.png", "https://shops-mehadee-hassan.vercel.app"],
    ["Metua Grocery", "বর্তমান সময়ে অনলাইন শপিং আমাদের দৈনন্দিন জীবনের একটি অপরিহার্য অংশে পরিণত হয়েছে। Metua Grocery একটি আধুনিক এবং ব্যবহারবান্ধব অনলাইন মুদি প্ল্যাটফর্ম।", "https://bootstrap-ecommerce-silk.vercel.app/images/grocery%20logo%20Background%20Removed.png", "https://bootstrap-ecommerce-silk.vercel.app/"],
    ["Code Fight", "এটি একটি আধুনিক ব্লগিং প্ল্যাটফর্ম যেখানে ব্যবহারকারীরা বিভিন্ন বিষয়ে ব্লগ পড়তে পারেন। এটি একটি ফুল-স্ট্যাক ওয়েব অ্যাপ্লিকেশন।", "/images/favicon-Bx60cIKr.png", "https://blog-project-eight-pi.vercel.app/"],
    ["Learn with Mehedi", "এটি একটি ইন্টারঅ্যাক্টিভ ই-লার্নিং বা এডুকেশনাল প্ল্যাটফর্ম, যেখানে শিক্ষার্থীরা বিভিন্ন কোর্স এবং টিউটোরিয়াল অ্যাক্সেস করতে পারে।", "https://learn-with-mehedi.vercel.app/favicon.ico", "https://learn-with-mehedi.vercel.app/"],
    ["Coding Mind", "এটি একটি আধুনিক এবং ফ্রি মক এপিআই (Mock API) ম্যানেজমেন্ট প্ল্যাটফর্ম, যা ডেভেলপারদের কাজের গতি বাড়াতে তৈরি করা হয়েছে।", "/images/download.svg", "https://coding-mind-mehadee-hassan.vercel.app/"],
    ["ReactMart", "React.js দিয়ে তৈরি একটি আধুনিক এবং রেসপনসিভ ই-কমার্স ওয়েব অ্যাপ্লিকেশন, যাতে প্রোডাক্ট ফিল্টারিং ও কার্ট ম্যানেজমেন্ট রয়েছে।", "/images/online-shop%20Background%20Removed%20copy.png", "https://ecommace-react-js.vercel.app/"]
  ].forEach((row, i) => project.run(...row, i + 1));
  const link = db.prepare("INSERT INTO social_links (label, url, icon, placement, sort_order) VALUES (?, ?, ?, ?, ?)");
  link.run("Email", "https://mail.google.com/mail/?view=cm&fs=1&to=mehedi19999@gmail.com", "fa-envelope", "contact", 1);
  [["Facebook", "https://www.facebook.com/mehediahnaf1", "fa-facebook"], ["GitHub", "https://github.com/mehadeehassan", "fa-github"], ["LinkedIn", "https://www.linkedin.com/in/mehadee-hassan/", "fa-linkedin"]].forEach((row, i) => link.run(...row, "follow", i + 1));
  const setting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  [["navbar_home_label", "🏠 প্রথম পাতা"], ["navbar_about_label", "আমার সম্পর্কে"], ["contact_label", "যোগাযোগ"], ["follow_label", "আমাকে ফলো করতে পারেন"], ["copyright_year", "2026"], ["copyright_name", "Mehadee Hassan"]].forEach((row) => setting.run(...row));
});
seed();
db.close();
console.log("Portfolio database seeded.");
