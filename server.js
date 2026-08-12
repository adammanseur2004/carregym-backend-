require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { sendReservationEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'carre-gym-secret-key-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'carrgym2026';

// ============================================
// SÉCURITÉ - HEADERS
// ============================================
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles/scripts for now
  crossOriginEmbedderPolicy: false
}));

// ============================================
// SÉCURITÉ - RATE LIMITING
// ============================================
const reservationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,
  message: { error: 'Trop de réservations. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limite taille requête
app.use(express.static(path.join(__dirname, 'public')));

// Logging des IPs pour détection d'abus
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${ip}`);
  next();
});

// ============================================
// BASE DE DONNÉES SQLITE3
// ============================================
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Erreur DB:', err);
  else console.log('✅ Base de données connectée');
});

// Création des tables
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
  if (err) console.error('Erreur création table:', err);
  else console.log('✅ Table reservations prête');
});

// ============================================
// VALIDATION
// ============================================
function validateReservation(data) {
  const { nom, telephone, date, heure, type, notes, website } = data;
  const errors = [];

  // HONEYPOT - champ caché
  if (website && website.trim() !== '') {
    return { valid: false, errors: ['Bot détecté'] };
  }

  // Nom
  if (!nom || nom.trim().length < 2 || nom.trim().length > 100) {
    errors.push('Nom invalide (2-100 caractères)');
  }
  if (nom && !/^[a-zA-ZÀ-ÿ\s\-'']+$/.test(nom.trim())) {
    errors.push('Nom contient des caractères non autorisés');
  }

  // Téléphone algérien
  const phoneClean = telephone ? telephone.replace(/\s/g, '').replace(/\D/g, '') : '';
  if (!phoneClean || !/^(0[567])[0-9]{8}$/.test(phoneClean)) {
    errors.push('Téléphone invalide (format algérien: 05XX XX XX XX, 06XX XX XX XX, 07XX XX XX XX)');
  }

  // Date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inputDate = new Date(date);
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);

  if (!date || isNaN(inputDate.getTime())) {
    errors.push('Date invalide');
  } else if (inputDate < today) {
    errors.push('La date ne peut pas être dans le passé');
  } else if (inputDate > maxDate) {
    errors.push('La réservation max est à 3 mois à l\'avance');
  }

  // Heure (06:00 - 23:00)
  if (!heure || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heure)) {
    errors.push('Heure invalide');
  } else {
    const [h] = heure.split(':').map(Number);
    if (h < 6 || h >= 23) {
      errors.push('Horaires: 06:00 - 23:00 uniquement');
    }
  }

  // Type
  const validTypes = ['musculation', 'crossfit', 'kickboxing', 'judo', 'rpm', 'karate', 'crosskids', 'libre'];
  if (!type || !validTypes.includes(type)) {
    errors.push('Type de séance invalide');
  }

  // Notes
  if (notes && notes.length > 500) {
    errors.push('Notes trop longues (max 500 caractères)');
  }

  return { valid: errors.length === 0, errors };
}

function sanitizeInput(str) {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 500);
}

// ============================================
// MIDDLEWARE AUTH
// ============================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// ============================================
// ROUTES API
// ============================================

// Créer une réservation (public) - LIMITÉE
app.post('/api/reservations', reservationLimiter, (req, res) => {
  const validation = validateReservation(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.errors.join(', ') });
  }

  const { nom, telephone, date, heure, type, notes } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';

  const sql = `INSERT INTO reservations (nom, telephone, date, heure, type, notes, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [
    sanitizeInput(nom),
    sanitizeInput(telephone),
    date,
    heure,
    type || 'musculation',
    sanitizeInput(notes),
    ip,
    ua
  ], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    sendReservationEmail({
      id: this.lastID,
      nom: sanitizeInput(nom),
      telephone: sanitizeInput(telephone),
      date, heure, type, notes: sanitizeInput(notes)
    }).catch(err => console.error('Email error:', err));

    res.status(201).json({
      success: true,
      message: 'Réservation créée avec succès',
      id: this.lastID
    });
  });
});

// Liste des réservations (protégé) - LIMITÉE
app.get('/api/reservations', apiLimiter, authMiddleware, (req, res) => {
  const { statut, date, search } = req.query;
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
    sql += ' AND (nom LIKE ? OR telephone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY date DESC, heure DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json({ success: true, data: rows });
  });
});

// Supprimer une réservation (protégé)
app.delete('/api/reservations/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM reservations WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    res.json({ success: true, message: 'Réservation supprimée' });
  });
});

// Mettre à jour le statut (protégé)
app.patch('/api/reservations/:id', authMiddleware, (req, res) => {
  const { statut } = req.body;
  const validStatuses = ['en_attente', 'confirmee', 'annulee'];
  if (!validStatuses.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  db.run('UPDATE reservations SET statut = ? WHERE id = ?', [statut, req.params.id], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    res.json({ success: true, message: 'Statut mis à jour' });
  });
});

// Stats (protégé)
app.get('/api/admin/stats', apiLimiter, authMiddleware, (req, res) => {
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

// Login admin - LIMITÉ
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
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

// Health check pour UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// DÉMARRAGE
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Carré Gym Backend v2.0 running on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
});
