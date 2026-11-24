const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

mongoose
  .connect("mongodb://127.0.0.1:27017/crossdrop")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err.message));

// Each shared file
const File = mongoose.model(
  "File",
  new mongoose.Schema({
    name: String,
    stored: String,
    size: Number,
    type: String,
    device: String,
    to: String,
    time: { type: Date, default: Date.now },
  })
);

// Receiver codes, auto-deleted by MongoDB after 10 minutes
const EXPIRY_MS = 10 * 60 * 1000;
const Session = mongoose.model(
  "Session",
  new mongoose.Schema({
    code: String,
    createdAt: { type: Date, default: Date.now, expires: 600 },
  })
);

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

async function isValid(code) {
  if (!code) return false;
  const s = await Session.findOne({ code: code.toUpperCase() });
  return !!s && Date.now() - s.createdAt.getTime() < EXPIRY_MS;
}

// Multer saves uploaded files into the uploads folder
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + Math.floor(Math.random() * 1000) + "_" + file.originalname.replace(/[^\w.\-]/g, "_")),
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 50 },
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/view", express.static(UPLOAD_DIR));

// Generate a fresh unique code
app.get("/new-code", async (req, res) => {
  let code;
  do {
    code = randomCode();
  } while (await Session.findOne({ code }));
  const s = await Session.create({ code });
  console.log("New code created:", code);
  res.json({ code, expiresAt: s.createdAt.getTime() + EXPIRY_MS });
});

// Receive files (many at once)
app.post("/upload", upload.array("files", 50), async (req, res) => {
  const to = (req.body.to || "").toUpperCase().trim();
  const valid = await isValid(to);
  if (!valid) {
    for (const f of req.files) fs.unlink(f.path, () => {});
    console.log("Rejected upload, bad or expired code:", to);
    return res.status(400).json({ ok: false, error: "Code is invalid or expired" });
  }
  for (const f of req.files) {
    await File.create({
      name: f.originalname,
      stored: f.filename,
      size: f.size,
      type: f.mimetype,
      device: req.body.device || "Unknown",
      to: to,
    });
  }
  console.log("Saved " + req.files.length + " file(s) for code " + to);
  res.json({ ok: true, count: req.files.length });
});

// Files for one code
app.get("/files", async (req, res) => {
  const code = (req.query.code || "").toUpperCase();
  if (!(await isValid(code))) return res.json([]);
  const list = await File.find({ to: code }).sort({ time: -1 }).limit(100);
  res.json(list);
});

// Download with original name
app.get("/download/:stored", async (req, res) => {
  const doc = await File.findOne({ stored: req.params.stored });
  if (!doc) return res.status(404).send("Not found");
  res.download(path.join(UPLOAD_DIR, doc.stored), doc.name);
});

// Every minute: delete files whose code has expired
setInterval(async () => {
  try {
    const active = await Session.find().distinct("code");
    const old = await File.find({ to: { $nin: active } });
    for (const f of old) {
      fs.unlink(path.join(UPLOAD_DIR, f.stored), () => {});
      await f.deleteOne();
    }
  } catch (e) {
    console.log("Cleanup error:", e.message);
  }
}, 60 * 1000);

app.listen(3000, "0.0.0.0", () => {
  console.log("CrossDrop running!");
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list) {
      if (i.family === "IPv4" && !i.internal) {
        console.log("Open on any device: http://" + i.address + ":3000");
      }
    }
  }
});