import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import forge from "node-forge";
import cron from "node-cron";
import nodemailer from "nodemailer";
import cors from "cors";

// --- DATABASE SETUP ---
const db = new Database("database.sqlite");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    doc_number TEXT,
    expiry_date TEXT,
    issue_date TEXT,
    type TEXT,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Admin (password: admin123)
const adminExists = db.prepare("SELECT * FROM users WHERE email = ?").get("admin@admin.com");
if (!adminExists) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run("admin@admin.com", hash, 2);
}

// --- APP SETUP ---
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // --- WEBSOCKET BROADCAST ---
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // --- MIDDLEWARES ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || "secret");
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const checkRole = (role: number) => (req: any, res: any, next: any) => {
    if (req.user.role < role) return res.status(403).json({ error: "Forbidden" });
    next();
  };

  // --- AUTH ROUTES ---
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || "secret");
    res.json({ token, user: { email: user.email, role: user.role } });
  });

  // --- CERTIFICATE ROUTES ---
  app.get("/api/certificates", authenticate, (req, res) => {
    const certs = db.prepare("SELECT * FROM certificates ORDER BY expiry_date ASC").all();
    res.json(certs);
  });

  app.post("/api/certificates", authenticate, checkRole(1), (req: any, res) => {
    const { client_name, doc_number, expiry_date, issue_date, type, password } = req.body;
    
    // Check duplicate
    const exists = db.prepare("SELECT id FROM certificates WHERE client_name = ? AND doc_number = ?").get(client_name, doc_number);
    if (exists) return res.status(400).json({ error: "Certificate already exists" });

    const result = db.prepare(`
      INSERT INTO certificates (client_name, doc_number, expiry_date, issue_date, type, password)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(client_name, doc_number, expiry_date, issue_date, type, password);

    db.prepare("INSERT INTO logs (user_id, action, details) VALUES (?, ?, ?)").run(req.user.id, "ADD", `Added certificate for ${client_name}`);
    
    broadcast({ type: "REFRESH", message: `O usuário ${req.user.email} adicionou um certificado.` });
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/certificates/:id", authenticate, checkRole(2), (req: any, res) => {
    db.prepare("DELETE FROM certificates WHERE id = ?").run(req.params.id);
    db.prepare("INSERT INTO logs (user_id, action, details) VALUES (?, ?, ?)").run(req.user.id, "DELETE", `Deleted certificate ID ${req.params.id}`);
    broadcast({ type: "REFRESH", message: `O usuário ${req.user.email} removeu um certificado.` });
    res.json({ success: true });
  });

  // --- BATCH IMPORT ENGINE ---
  const upload = multer({ storage: multer.memoryStorage() });
  app.post("/api/import-batch", authenticate, checkRole(2), upload.array("files"), async (req: any, res) => {
    const files = req.files as any[];
    let importedCount = 0;

    // Group files by directory
    const folders: Record<string, any[]> = {};
    files.forEach(file => {
      const pathParts = (file as any).originalname.split('/');
      const folderName = pathParts.slice(0, -1).join('/');
      if (!folders[folderName]) folders[folderName] = [];
      folders[folderName].push(file);
    });

    for (const folderName in folders) {
      const folderFiles = folders[folderName];
      const pfxFile = folderFiles.find(f => f.originalname.endsWith(".pfx") || f.originalname.endsWith(".p12"));
      if (!pfxFile) continue;

      // b) Encontrar senha (txt ou nome da pasta)
      const txtFile = folderFiles.find(f => f.originalname.endsWith(".txt"));
      let rawPassword = txtFile ? txtFile.buffer.toString() : folderName.split('/').pop() || "";

      // c) Regex para limpar senha: ^(?i)(SENHA)?[\s=:\-]*
      const passwordRegex = /^(?:senha)?[\s=:\-]*(.*)$/i;
      const matchPass = rawPassword.trim().match(passwordRegex);
      const cleanPassword = matchPass ? matchPass[1].trim() : rawPassword.trim();

      try {
        // d) node-forge para destrancar PFX
        const p12Der = pfxFile.buffer.toString('binary');
        const p12Asn1 = forge.asn1.fromDer(p12Der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, cleanPassword);

        // e) Extrair info
        let expiryDate = "";
        let issueDate = "";
        let commonName = "";

        p12.safeContents.forEach(content => {
          content.safeBags.forEach(bag => {
            if (bag.cert) {
              const cert = bag.cert;
              expiryDate = cert.validity.notAfter.toISOString().split('T')[0];
              issueDate = cert.validity.notBefore.toISOString().split('T')[0];
              const cnField = cert.subject.getField('CN');
              commonName = cnField ? cnField.value : "";
            }
          });
        });

        // f) Regex para CPF/CNPJ: (?<!\d)(\d{11}|\d{14})(?!\d)
        const docRegex = /(?<!\d)(\d{11}|\d{14})(?!\d)/;
        const docMatch = pfxFile.originalname.match(docRegex) || folderName.match(docRegex);
        const docNumber = docMatch ? docMatch[1] : "00000000000";

        // g) Salvar (Ignorar duplicatas silenciosamente)
        const exists = db.prepare("SELECT id FROM certificates WHERE client_name = ?").get(commonName);
        if (!exists) {
          db.prepare(`
            INSERT INTO certificates (client_name, doc_number, expiry_date, issue_date, type, password)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(commonName, docNumber, expiryDate, issueDate, "A1", cleanPassword);
          importedCount++;
        }
      } catch (err) {
        console.error(`Erro ao processar ${pfxFile.originalname}:`, err);
      }
    }

    broadcast({ type: "REFRESH", message: `Importação em lote concluída por ${req.user.email}.` });
    res.json({ importedCount });
  });

  // --- GARBAGE COLLECTOR ---
  app.post("/api/garbage-collector", authenticate, checkRole(2), (req, res) => {
    const result = db.exec(`
      DELETE FROM certificates 
      WHERE id IN (
        SELECT id FROM certificates c1
        WHERE expiry_date < date('now')
        AND EXISTS (
          SELECT 1 FROM certificates c2
          WHERE c2.doc_number = c1.doc_number 
          AND c2.id != c1.id 
          AND c2.expiry_date >= date('now')
        )
      )
    `);
    res.json({ success: true });
  });

  // --- CNPJ PROXY ---
  app.get("/api/cnpj/:cnpj", async (req, res) => {
    try {
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${req.params.cnpj}`);
      const data = await response.json();
      res.json(data);
    } catch {
      res.status(500).json({ error: "Erro ao consultar CNPJ" });
    }
  });

  // --- CRON JOB (Daily at 00:00) ---
  cron.schedule("0 0 * * *", async () => {
    const expiring = db.prepare(`
      SELECT * FROM certificates 
      WHERE expiry_date <= date('now', '+7 days')
    `).all();

    if (expiring.length > 0) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      await transporter.sendMail({
        from: '"CertiManager" <noreply@certimanager.com>',
        to: process.env.ADMIN_EMAIL,
        subject: "ALERTA: Certificados Vencendo",
        text: `Existem ${expiring.length} certificados vencendo nos próximos 7 dias ou já vencidos.`
      });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
