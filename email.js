const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Vérifier la connexion au démarrage
if (!process.env.RESEND_API_KEY) {
  console.log('⚠️  RESEND_API_KEY non configuré');
  console.log('   Ajoutez RESEND_API_KEY dans les variables d\'environnement Render.');
} else {
  console.log('✅ Resend configuré');
}

async function sendReservationEmail(reservation) {
  const { nom, telephone, date, heure, type, notes, id } = reservation;

  const to = process.env.EMAIL_TO || 'carregym@example.com';

  if (!process.env.RESEND_API_KEY) {
    console.log('ℹ️  Email non envoyé: RESEND_API_KEY non configuré');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Carré Gym <onboarding@resend.dev>',
      to: [to],
      subject: `🆕 Nouvelle réservation - ${nom} (#${id})`,
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
        <span class="value">#${id}</span>
      </div>
      <div class="info-row">
        <span class="label">Nom</span>
        <span class="value">${nom}</span>
      </div>
      <div class="info-row">
        <span class="label">Téléphone</span>
        <span class="value">${telephone}</span>
      </div>
      <div class="info-row">
        <span class="label">Date</span>
        <span class="value">${date}</span>
      </div>
      <div class="info-row">
        <span class="label">Heure</span>
        <span class="value">${heure}</span>
      </div>
      <div class="info-row">
        <span class="label">Type</span>
        <span class="badge">${type}</span>
      </div>
      <div class="info-row">
        <span class="label">Notes</span>
        <span class="value">${notes || 'Aucune'}</span>
      </div>
      <a href="${process.env.ADMIN_URL || 'https://carr-gym-backend-t9n2.onrender.com/admin'}" class="cta">Voir dans le tableau de bord</a>
    </div>
    <div class="footer">
      © 2026 Carré Gym · Rue Hassiba Ben Bouali, Rouïba · 0556 75 14 08
    </div>
  </div>
</body>
</html>
      `,
      text: `Nouvelle réservation Carré Gym:\n\nNom: ${nom}\nTéléphone: ${telephone}\nDate: ${date}\nHeure: ${heure}\nType: ${type}\nNotes: ${notes || 'Aucune'}\n\nID: #${id}`
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
