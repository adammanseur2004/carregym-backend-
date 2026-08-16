const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO;
const ADMIN_URL = process.env.ADMIN_URL;

// Vérifier la connexion au démarrage
if (!RESEND_API_KEY) {
  console.log('⚠️  RESEND_API_KEY non configuré — les emails seront désactivés.');
} else {
  console.log('✅ Resend configuré');
}

if (!EMAIL_TO) {
  console.log('⚠️  EMAIL_TO non configuré — les emails seront désactivés.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function sendReservationEmail(reservation) {
  const { nom, telephone, date, heure, type, notes, id } = reservation;

  if (!resend || !EMAIL_TO) {
    console.log('ℹ️  Email non envoyé: configuration incomplète (RESEND_API_KEY ou EMAIL_TO manquant)');
    return;
  }

  // Validation des données avant envoi
  if (!id || !nom || !telephone || !date || !heure || !type) {
    console.error('❌ Données de réservation incomplètes pour l\'email');
    return;
  }

  const safeId = parseInt(id, 10);
  if (isNaN(safeId) || safeId <= 0) {
    console.error('❌ ID de réservation invalide pour l\'email');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Carré Gym <onboarding@resend.dev>',
      to: [EMAIL_TO],
      subject: `🆕 Nouvelle réservation - ${nom.substring(0, 50)} (#${safeId})`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0a; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a; }
    .header { background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; text-align: center; border-bottom: 3px solid #82b43c; }
    .header h1 { color: #82b43c; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
    .header p { color: #b0b0b0; margin: 10px 0 0; font-size: 14px; }
    .content { padding: 30px; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #2a2a2a; }
    .label { color: #b0b0b0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
    .value { color: #ffffff; font-weight: 600; font-size: 15px; }
    .badge { display: inline-block; background: rgba(130, 180, 60, 0.2); color: #82b43c; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .footer { background: #0a0a0a; padding: 20px; text-align: center; color: #666; font-size: 12px; }
    .cta { display: block; background: #82b43c; color: #000; text-align: center; padding: 14px; border-radius: 10px; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏋️ Carré Gym</h1>
      <p>Nouvelle réservation reçue !</p>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="label">ID Réservation</span>
        <span class="value">#${safeId}</span>
      </div>
      <div class="info-row">
        <span class="label">Nom</span>
        <span class="value">${String(nom).substring(0, 100)}</span>
      </div>
      <div class="info-row">
        <span class="label">Téléphone</span>
        <span class="value">${String(telephone).substring(0, 20)}</span>
      </div>
      <div class="info-row">
        <span class="label">Date</span>
        <span class="value">${String(date).substring(0, 10)}</span>
      </div>
      <div class="info-row">
        <span class="label">Heure</span>
        <span class="value">${String(heure).substring(0, 5)}</span>
      </div>
      <div class="info-row">
        <span class="label">Type</span>
        <span class="badge">${String(type).substring(0, 50)}</span>
      </div>
      <div class="info-row">
        <span class="label">Notes</span>
        <span class="value">${notes ? String(notes).substring(0, 200) : 'Aucune'}</span>
      </div>
      <a href="${ADMIN_URL || 'https://carr-gym-backend-t9n2.onrender.com/admin'}" class="cta">Voir dans le tableau de bord</a>
    </div>
    <div class="footer">
      © 2026 Carré Gym · Rue Hassiba Ben Bouali, Rouïba · 0556 75 14 08
    </div>
  </div>
</body>
</html>
      `,
      text: `Nouvelle réservation Carré Gym:\n\nNom: ${nom}\nTéléphone: ${telephone}\nDate: ${date}\nHeure: ${heure}\nType: ${type}\nNotes: ${notes || 'Aucune'}\n\nID: #${safeId}`
    });

    if (error) {
      console.error('❌ Erreur Resend:', error);
      throw error;
    }

    console.log('📧 Email envoyé via Resend:', data?.id);
    return data;
  } catch (err) {
    console.error('❌ Erreur email:', err.message);
    throw err;
  }
}

module.exports = { sendReservationEmail };
