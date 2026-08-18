// ============================================
// CARRÉ GYM - ADMIN DASHBOARD JS v2
// ============================================

const API_URL = '';

// Vérifier auth
const token = localStorage.getItem('cg_token');
if (!token) {
  window.location.href = '/admin';
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
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
  return badges[statut] || `<span class="badge">${statut}</span>`;
}

// ============================================
// TODAY'S RESERVATIONS
// ============================================
async function loadTodayReservations() {
  const todayList = document.getElementById('todayList');
  const newCount = document.getElementById('newCount');
  if (!todayList) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_URL}/api/reservations?date=${today}`, {
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
        <span class="res-time">${formatTime(r.heure)}</span>
        <span class="res-name">${escapeHtml(r.nom)}</span>
        <span class="res-type">${r.type}</span>
        <div class="res-actions">
          <button class="btn-accept" onclick="updateStatus(${r.id}, 'confirmee')">Accept</button>
          <button class="btn-reject" onclick="updateStatus(${r.id}, 'annulee')">Reject</button>
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
// FULL RESERVATIONS LIST
// ============================================
async function loadReservations() {
  const tbody = document.getElementById('reservationsTable');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;"><div class="loader"></div></td></tr>';

  try {
    const search = document.getElementById('searchInput')?.value || '';
    const date = document.getElementById('dateFilter')?.value || '';
    const statut = document.getElementById('statusFilter')?.value || '';

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

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>#${r.id}</td>
        <td>${escapeHtml(r.nom)}</td>
        <td>${escapeHtml(r.telephone)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${formatTime(r.heure)}</td>
        <td>${r.type}</td>
        <td>${getStatusBadge(r.statut)}</td>
        <td>${escapeHtml(r.notes || '-')}</td>
        <td>
          <div class="actions">
            ${r.statut !== 'confirmee' ? `<button class="btn-icon confirm" onclick="updateStatus(${r.id}, 'confirmee')" title="Confirmer">✓</button>` : ''}
            ${r.statut !== 'en_attente' ? `<button class="btn-icon pending" onclick="updateStatus(${r.id}, 'en_attente')" title="Remettre en attente">⏸</button>` : ''}
            <button class="btn-icon delete" onclick="deleteReservation(${r.id})" title="Supprimer">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Load reservations error:', err);
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#ff4444;">Erreur de connexion</td></tr>';
  }
}

// ============================================
// ACTIONS
// ============================================
async function updateStatus(id, statut) {
  try {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
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
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (err) {
    showToast('Erreur réseau', 'error');
  }
}

async function deleteReservation(id) {
  if (!confirm('Supprimer cette réservation ?')) return;

  try {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
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
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (err) {
    showToast('Erreur réseau', 'error');
  }
}

function logout() {
  localStorage.removeItem('cg_token');
  window.location.href = '/admin';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  // Filter listeners
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
