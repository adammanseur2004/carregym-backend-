// ============================================
// CARRÉ GYM — ADMIN DASHBOARD JS v3 (Sécurisé)
// ============================================

const API_URL = '';
const TOKEN_KEY = 'cg_token';

// Vérifier auth
const token = localStorage.getItem(TOKEN_KEY);
if (!token) {
  window.location.href = '/admin';
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// ============================================
// SÉCURITÉ — ÉCHAPPEMENT HTML COMPLET
// ============================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR');
}

function formatTime(timeStr) {
  if (!timeStr) return '-';
  return timeStr.substring(0, 5);
}

function getStatusBadge(statut) {
  const badges = {
    'en_attente': '<span class="badge pending">En attente</span>',
    'confirmee': '<span class="badge confirmed">Confirmée</span>',
    'annulee': '<span class="badge cancelled">Annulée</span>'
  };
  return badges[statut] || `<span class="badge">${escapeHtml(statut)}</span>`;
}

// ============================================
// TODAY'S RESERVATIONS — ÉCHAPPEMENT SÉCURISÉ
// ============================================
async function loadTodayReservations() {
  const todayList = document.getElementById('todayList');
  const newCount = document.getElementById('newCount');
  if (!todayList) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_URL}/api/reservations?date=${encodeURIComponent(today)}`, {
      headers: getHeaders()
    });
    const data = await res.json();

    if (!data.success) {
      todayList.innerHTML = '<div class="empty-state">Erreur de chargement</div>';
      if (newCount) newCount.textContent = '0';
      return;
    }

    const reservations = data.data || [];
    const pending = reservations.filter(r => r.statut === 'en_attente');

    if (newCount) newCount.textContent = pending.length;

    if (reservations.length === 0) {
      todayList.innerHTML = '<div class="empty-state">Aucune réservation aujourd\'hui</div>';
      return;
    }

    todayList.innerHTML = reservations.map(r => `
      <div class="res-item">
        <span class="res-time">${escapeHtml(formatTime(r.heure))}</span>
        <span class="res-name">${escapeHtml(r.nom)}</span>
        <span class="res-type">${escapeHtml(r.type)}</span>
        <div class="res-actions">
          <button class="btn-accept" onclick="updateStatus(${parseInt(r.id,10)}, 'confirmee')">Accept</button>
          <button class="btn-reject" onclick="updateStatus(${parseInt(r.id,10)}, 'annulee')">Reject</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('loadToday error:', err);
    todayList.innerHTML = '<div class="empty-state">Erreur de connexion</div>';
    if (newCount) newCount.textContent = '0';
  }
}

// ============================================
// STATS
// ============================================
async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/api/admin/stats`, {
      headers: getHeaders()
    });
    const data = await res.json();

    if (data.success) {
      const statTotal = document.getElementById('statTotal');
      const statToday = document.getElementById('statToday');
      const statPending = document.getElementById('statPending');
      const statConfirmed = document.getElementById('statConfirmed');

      if (statTotal) statTotal.textContent = data.data.total;
      if (statToday) statToday.textContent = data.data.today;
      if (statPending) statPending.textContent = data.data.pending;
      if (statConfirmed) statConfirmed.textContent = data.data.confirmed;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ============================================
// FULL RESERVATIONS LIST — VALIDATION + ÉCHAPPEMENT
// ============================================
async function loadReservations() {
  const tbody = document.getElementById('reservationsTable');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;"><div class="loader"></div></td></tr>';

  try {
    const searchRaw = document.getElementById('searchInput')?.value || '';
    const dateRaw = document.getElementById('dateFilter')?.value || '';
    const statutRaw = document.getElementById('statusFilter')?.value || '';

    // Validation frontend des filtres
    const search = searchRaw.trim().substring(0, 100);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : '';
    const statut = ['en_attente', 'confirmee', 'annulee'].includes(statutRaw) ? statutRaw : '';

    let url = `${API_URL}/api/reservations`;
    const params = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (date) params.push(`date=${encodeURIComponent(date)}`);
    if (statut) params.push(`statut=${encodeURIComponent(statut)}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url, { headers: getHeaders() });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#ff4444;">Erreur de chargement</td></tr>';
      return;
    }

    const rows = data.data || [];
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">Aucune réservation trouvée</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const id = parseInt(r.id, 10);
      return `
      <tr>
        <td>#${id}</td>
        <td>${escapeHtml(r.nom)}</td>
        <td>${escapeHtml(r.telephone)}</td>
        <td>${escapeHtml(formatDate(r.date))}</td>
        <td>${escapeHtml(formatTime(r.heure))}</td>
        <td>${escapeHtml(r.type)}</td>
        <td>${getStatusBadge(r.statut)}</td>
        <td>${escapeHtml(r.notes || '-')}</td>
        <td>
          <div class="actions">
            ${r.statut !== 'confirmee' ? `<button class="btn-icon confirm" onclick="updateStatus(${id}, 'confirmee')" title="Confirmer">✓</button>` : ''}
            ${r.statut !== 'en_attente' ? `<button class="btn-icon pending" onclick="updateStatus(${id}, 'en_attente')" title="Remettre en attente">⏸</button>` : ''}
            <button class="btn-icon delete" onclick="deleteReservation(${id})" title="Supprimer">🗑</button>
          </div>
        </td>
      </tr>
    `}).join('');

  } catch (err) {
    console.error('Load reservations error:', err);
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#ff4444;">Erreur de connexion</td></tr>';
  }
}

// ============================================
// ACTIONS — VALIDATION DES IDs
// ============================================
async function updateStatus(id, statut) {
  const safeId = parseInt(id, 10);
  if (isNaN(safeId) || safeId <= 0) {
    showToast('ID invalide', 'error');
    return;
  }
  if (!['en_attente', 'confirmee', 'annulee'].includes(statut)) {
    showToast('Statut invalide', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/reservations/${safeId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ statut })
    });
    const data = await res.json();

    if (data.success) {
      showToast(statut === 'confirmee' ? 'Réservation confirmée' : 'Statut mis à jour');
      loadTodayReservations();
      loadReservations();
      loadStats();
    } else {
      showToast(escapeHtml(data.error) || 'Erreur', 'error');
    }
  } catch (err) {
    showToast('Erreur réseau', 'error');
  }
}

async function deleteReservation(id) {
  const safeId = parseInt(id, 10);
  if (isNaN(safeId) || safeId <= 0) {
    showToast('ID invalide', 'error');
    return;
  }

  if (!confirm('Supprimer cette réservation ?')) return;

  try {
    const res = await fetch(`${API_URL}/api/reservations/${safeId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();

    if (data.success) {
      showToast('Réservation supprimée');
      loadTodayReservations();
      loadReservations();
      loadStats();
    } else {
      showToast(escapeHtml(data.error) || 'Erreur', 'error');
    }
  } catch (err) {
    showToast('Erreur réseau', 'error');
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/admin';
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadTodayReservations();
  loadReservations();

  // Auto refresh every 30s
  setInterval(() => {
    loadTodayReservations();
    loadReservations();
    loadStats();
  }, 30000);

  // Filter listeners avec debounce
  const searchInput = document.getElementById('searchInput');
  const dateFilter = document.getElementById('dateFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (searchInput) searchInput.addEventListener('input', debounce(loadReservations, 300));
  if (dateFilter) dateFilter.addEventListener('change', loadReservations);
  if (statusFilter) statusFilter.addEventListener('change', loadReservations);
});

function debounce(fn, ms) {
  let timeout;
  return function() {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, arguments), ms);
  };
}
