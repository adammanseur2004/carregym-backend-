require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { sendReservationEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SECRET MANAGEMENT — FAIL FAST IF MISSING
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET manquant ou trop court (min 32 caractères).');
  process.exit(1);
}

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('❌ FATAL: ADMIN_PASSWORD manquant ou trop court (min 8 caractères).');
  process.exit(1);
}

// Hash once at startup for timing-safe comparison
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 12);

// ============================================
// SÉCURITÉ — HEADERS COMPREHENSIFS (CSP, HSTS, etc.)
// ============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "https://www.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
}));

// ============================================
// CORS — CONFIGURATION RESTREINTE
// ============================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS non autorisé'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================
// MIDDLEWARE — PARSING SÉCURISÉ + CONTENT-TYPE
// ============================================
app.use(express.json({
  limit: '10kb',
  verify: (req, res, buf) => {
    if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') return;
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Corps de requête JSON invalide' });
      throw new Error('JSON invalide');
    }
  }
}));

// Force Content-Type: application/json sur toutes les routes API mutantes
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') return next();
  const ct = req.headers['content-type'];
  if (!ct || !ct.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type application/json requis' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RATE LIMITING — TOUS LES ENDPOINTS COUVERTS
// ============================================
const reservationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de réservations. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

const apiReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Trop de modifications. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false
});

const deleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Trop de suppressions. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// LOGGING IPs POUR DÉTECTION D'ABUS
// ============================================
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${ip}`);
  next();
});

// ============================================
// BASE DE DONNÉES SQLITE3 — PARAMÉTRÉE
// ============================================
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erreur DB:', err);
    process.exit(1);
  }
  console.log('✅ Base de données connectée');
});

db.run(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    telephone TEXT NOT NULL,
    date TEXT NOT NULL,
    heure TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'musculation',
    notes TEXT,
    statut TEXT DEFAULT 'en_attente',
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('❌ Erreur création table:', err);
    process.exit(1);
  }
  console.log('✅ Table reservations prête');
});

// ============================================
// SANITIZATION — DÉFENSE XSS COMPLÈTE
// ============================================
function sanitizeInput(str, maxLength = 500) {
  if (str === undefined || str === null) return '';
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, maxLength);
}

function sanitizeForLike(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim()
    .substring(0, 100);
}

// ============================================
// VALIDATION — DÉFENSE INPUT COMPLÈTE
// ============================================
const VALID_TYPES = ['musculation', 'crossfit', 'kickboxing', 'judo', 'rpm', 'karate', 'crosskids', 'libre'];
const VALID_STATUSES = ['en_attente', 'confirmee', 'annulee'];

function validateReservation(data) {
  const { nom, telephone, date, heure, type, notes, website } = data;
  const errors = [];

  // HONEYPOT — détection bot
  if (website !== undefined && website !== null && String(website).trim() !== '') {
    return { valid: false, errors: ['Bot détecté'] };
  }

  // Nom
  if (!nom || typeof nom !== 'string') {
    errors.push('Nom requis');
  } else {
    const nomTrim = nom.trim();
    if (nomTrim.length < 2 || nomTrim.length > 100) {
      errors.push('Nom invalide (2-100 caractères)');
    }
    if (!/[\p{L}\s\-'' ]+/u.test(nomTrim)) {
      errors.push('Nom contient des caractères non autorisés');
    }
  }

  // Téléphone algérien
  if (!telephone || typeof telephone !== 'string') {
    errors.push('Téléphone requis');
  } else {
    const phoneClean = telephone.replace(/\s/g, '').replace(/\D/g, '');
    if (!/^(0[567])[0-9]{8}$/.test(phoneClean)) {
      errors.push('Téléphone invalide (format algérien: 05/06/07 XX XX XX XX)');
    }
  }

  // Date
  if (!date || typeof date !== 'string') {
    errors.push('Date requise');
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push('Format de date invalide (YYYY-MM-DD)');
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inputDate = new Date(date + 'T00:00:00');
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + 3);
      maxDate.setHours(0, 0, 0, 0);

      if (isNaN(inputDate.getTime())) {
        errors.push('Date invalide');
      } else if (inputDate < today) {
        errors.push('La date ne peut pas être dans le passé');
      } else if (inputDate > maxDate) {
        errors.push('La réservation max est à 3 mois à l\'avance');
      }
    }
  }

  // Heure
  if (!heure || typeof heure !== 'string') {
    errors.push('Heure requise');
  } else {
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heure)) {
      errors.push('Format d\'heure invalide (HH:MM)');
    } else {
      const [h] = heure.split(':').map(Number);
      if (h < 6 || h >= 23) {
        errors.push('Horaires: 06:00 - 23:00 uniquement');
      }
    }
  }

  // Type
  if (!type || typeof type !== 'string' || !VALID_TYPES.includes(type)) {
    errors.push('Type de séance invalide');
  }

  // Notes
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('Notes invalides');
    } else if (notes.length > 500) {
      errors.push('Notes trop longues (max 500 caractères)');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================
// MIDDLEWARE AUTH — JWT SÉCURISÉ
// ============================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.length > 2048) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '24h',
      clockTolerance: 30
    });

    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// ============================================
// ROUTES API — TOUTES PROTÉGÉES
// ============================================

// Créer une réservation (public)
app.post('/api/reservations', reservationLimiter, (req, res) => {
  const validation = validateReservation(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.errors.join(', ') });
  }

  const { nom, telephone, date, heure, type, notes } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';

  const sql = `INSERT INTO reservations (nom, telephone, date, heure, type, notes, ip_address, user_agent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    sanitizeInput(nom, 100),
    sanitizeInput(telephone, 20),
    date,
    heure,
    type,
    sanitizeInput(notes, 500),
    sanitizeInput(ip, 45),
    sanitizeInput(ua, 500)
  ], function(err) {
    if (err) {
      console.error('❌ Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    sendReservationEmail({
      id: this.lastID,
      nom: sanitizeInput(nom, 100),
      telephone: sanitizeInput(telephone, 20),
      date, heure, type,
      notes: sanitizeInput(notes, 500)
    }).catch(err => console.error('❌ Email error:', err));

    res.status(201).json({
      success: true,
      message: 'Réservation créée avec succès',
      id: this.lastID
    });
  });
});

// Liste des réservations (protégé)
app.get('/api/reservations', apiReadLimiter, authMiddleware, (req, res) => {
  const { statut, date, search } = req.query;

  if (statut && !VALID_STATUSES.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Format de date invalide' });
  }
  if (search && (typeof search !== 'string' || search.length > 100)) {
    return res.status(400).json({ error: 'Recherche invalide' });
  }

  let sql = 'SELECT id, nom, telephone, date, heure, type, notes, statut, created_at FROM reservations WHERE 1=1';
  const params = [];

  if (statut) {
    sql += ' AND statut = ?';
    params.push(statut);
  }
  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  }
  if (search) {
    const safeSearch = sanitizeForLike(search);
    sql += ' AND (nom LIKE ? ESCAPE "\\" OR telephone LIKE ? ESCAPE "\\")';
    params.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }

  sql += ' ORDER BY date DESC, heure DESC LIMIT 1000';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json({ success: true, data: rows });
  });
});

// Supprimer une réservation (protégé)
app.delete('/api/reservations/:id', deleteLimiter, authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  db.run('DELETE FROM reservations WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    res.json({ success: true, message: 'Réservation supprimée' });
  });
});

// Mettre à jour le statut (protégé)
app.patch('/api/reservations/:id', apiWriteLimiter, authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  const { statut } = req.body;
  if (!statut || typeof statut !== 'string' || !VALID_STATUSES.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  db.run('UPDATE reservations SET statut = ? WHERE id = ?', [statut, id], function(err) {
    if (err) {
      console.error('❌ Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    res.json({ success: true, message: 'Statut mis à jour' });
  });
});

// Stats (protégé)
app.get('/api/admin/stats', apiReadLimiter, authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  db.get('SELECT COUNT(*) as count FROM reservations', [], (err, totalRow) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });

    db.get('SELECT COUNT(*) as count FROM reservations WHERE date = ?', [today], (err, todayRow) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });

      db.get("SELECT COUNT(*) as count FROM reservations WHERE statut = 'en_attente'", [], (err, pendingRow) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });

        db.get("SELECT COUNT(*) as count FROM reservations WHERE statut = 'confirmee'", [], (err, confirmedRow) => {
          if (err) return res.status(500).json({ error: 'Erreur serveur' });

          res.json({
            success: true,
            data: {
              total: totalRow.count,
              today: todayRow.count,
              pending: pendingRow.count,
              confirmed: confirmedRow.count
            }
          });
        });
      });
    });
  });
});

// Login admin — comparaison timing-safe via bcrypt
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Mot de passe requis' });
  }
  if (password.length > 200) {
    return res.status(400).json({ error: 'Mot de passe invalide' });
  }

  if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = jwt.sign(
    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );

  res.json({ success: true, token });
});

// ============================================
// REDIRECTIONS FRONTEND
// ============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check
app.get('/health', apiReadLimiter, (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ressource non trouvée' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Erreur non gérée:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ============================================
// DÉMARRAGE
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Carré Gym Backend v2.0 running on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
});
