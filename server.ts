import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("gemini_studio.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    thumbnail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    prompt TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: Add reference_image column if it doesn't exist
try {
  db.prepare("ALTER TABLE templates ADD COLUMN reference_image TEXT").run();
  console.log("Added reference_image column to templates table");
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) {
    console.error("Migration error:", e.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // API Routes - Templates
  app.get("/api/templates", (req, res) => {
    const templates = db.prepare("SELECT * FROM templates ORDER BY created_at DESC").all();
    res.json(templates);
  });

  app.post("/api/templates", (req, res) => {
    const { id, name, prompt, thumbnail, reference_image } = req.body;
    const stmt = db.prepare("INSERT INTO templates (id, name, prompt, thumbnail, reference_image) VALUES (?, ?, ?, ?, ?)");
    stmt.run(id, name, prompt, thumbnail, reference_image);
    res.json({ success: true });
  });

  app.put("/api/templates/:id", (req, res) => {
    const { id } = req.params;
    const { name, prompt, thumbnail, reference_image } = req.body;
    const stmt = db.prepare("UPDATE templates SET name = ?, prompt = ?, thumbnail = ?, reference_image = ? WHERE id = ?");
    stmt.run(name, prompt, thumbnail, reference_image, id);
    res.json({ success: true });
  });

  app.delete("/api/templates/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM templates WHERE id = ?");
    stmt.run(id);
    res.json({ success: true });
  });

  // API Routes - History
  app.get("/api/history", (req, res) => {
    const history = db.prepare("SELECT * FROM history ORDER BY timestamp DESC").all();
    res.json(history);
  });

  app.post("/api/history", (req, res) => {
    const { id, url, prompt, timestamp } = req.body;
    const stmt = db.prepare("INSERT INTO history (id, url, prompt, timestamp) VALUES (?, ?, ?, ?)");
    stmt.run(id, url, prompt, timestamp);
    
    // Auto-delete older records to keep only the latest 4
    db.prepare("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY timestamp DESC LIMIT 4)").run();
    
    res.json({ success: true });
  });

  app.delete("/api/history/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM history WHERE id = ?");
    stmt.run(id);
    res.json({ success: true });
  });

  app.delete("/api/history", (req, res) => {
    const stmt = db.prepare("DELETE FROM history");
    stmt.run();
    res.json({ success: true });
  });

  // API Routes - Global Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as any);
    res.json(settingsMap);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    stmt.run(key, JSON.stringify(value));
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
