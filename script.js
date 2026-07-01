/* =========================================================
   STOCKEASE — shared script.js
   Handles: auth (localStorage-based demo), navbar state,
   page guards, inventory CRUD, profile page.

   NOTE: This is a front-end-only demo. Passwords are stored
   in localStorage on the visitor's own browser, not sent to
   a server. Do not reuse this as a real auth system — swap
   in a real backend (sessions, hashed passwords, a database)
   before handling real user data.
   ========================================================= */

const DB_USERS = 'stockease_users';
const DB_SESSION = 'stockease_session';
const DB_INVENTORY = 'stockease_inventory';

/* ---------------------------------------------------------
   Small storage helpers
   --------------------------------------------------------- */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() { return readJSON(DB_USERS, []); }
function saveUsers(users) { writeJSON(DB_USERS, users); }

function getSessionEmail() { return localStorage.getItem(DB_SESSION); }
function setSessionEmail(email) { localStorage.setItem(DB_SESSION, email); }
function clearSession() { localStorage.removeItem(DB_SESSION); }

function getCurrentUser() {
  const email = getSessionEmail();
  if (!email) return null;
  return getUsers().find(u => u.email === email) || null;
}

/* Very small non-cryptographic hash — good enough to avoid
   storing plaintext passwords in this demo, not real security. */
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = (h << 5) - h + pw.charCodeAt(i);
    h |= 0;
  }
  return 'h' + h.toString(36);
}

/* ---------------------------------------------------------
   Toast
   --------------------------------------------------------- */
function showToast(message, type = 'default') {
  let toast = document.getElementById('se-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'se-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

/* ---------------------------------------------------------
   Navbar — reflects auth state on every page
   --------------------------------------------------------- */
function initNavbar() {
  const user = getCurrentUser();
  const loggedIn = !!user;

  document.querySelectorAll('[data-auth="in"]').forEach(el => {
    el.classList.toggle('hidden', !loggedIn);
  });
  document.querySelectorAll('[data-auth="out"]').forEach(el => {
    el.classList.toggle('hidden', loggedIn);
  });

  const authBtn = document.getElementById('nav-auth-btn');
  if (authBtn) {
    if (loggedIn) {
      authBtn.textContent = 'Sign Out';
      authBtn.setAttribute('href', '#');
      authBtn.onclick = (e) => {
        e.preventDefault();
        clearSession();
        showToast('Signed out');
        setTimeout(() => { window.location.href = 'index.html'; }, 400);
      };
    } else {
      authBtn.textContent = 'Login';
      authBtn.setAttribute('href', 'login.html');
      authBtn.onclick = null;
    }
  }

  const nameEl = document.getElementById('nav-user-name');
  if (nameEl && user) nameEl.textContent = user.name.split(' ')[0];

  // highlight active nav link
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === current);
  });
}

/* Redirects away from protected pages if not signed in.
   Call at the top of inventory.html / profile.html. */
function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/* ---------------------------------------------------------
   Signup / Login form wiring
   --------------------------------------------------------- */
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('form-msg');
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    const showError = (text) => {
      msg.textContent = text;
      msg.className = 'form-msg error show';
    };

    if (!name || !email || !password || !confirm) {
      showError('Please fill in every field.');
      return;
    }
    if (password.length < 6) {
      showError('Password needs at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }
    const users = getUsers();
    if (users.some(u => u.email === email)) {
      showError('An account with that email already exists.');
      return;
    }

    users.push({ name, email, password: hashPassword(password), createdAt: new Date().toISOString() });
    saveUsers(users);
    setSessionEmail(email);

    msg.textContent = 'Account created. Redirecting…';
    msg.className = 'form-msg success show';
    setTimeout(() => { window.location.href = 'inventory.html'; }, 600);
  });
}

function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('form-msg');
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    const user = getUsers().find(u => u.email === email);
    if (!user || user.password !== hashPassword(password)) {
      msg.textContent = 'Incorrect email or password.';
      msg.className = 'form-msg error show';
      return;
    }
    setSessionEmail(email);
    msg.textContent = 'Welcome back. Redirecting…';
    msg.className = 'form-msg success show';
    setTimeout(() => { window.location.href = 'inventory.html'; }, 500);
  });
}

/* ---------------------------------------------------------
   Inventory data
   --------------------------------------------------------- */
function getInventoryStore() { return readJSON(DB_INVENTORY, {}); }
function saveInventoryStore(store) { writeJSON(DB_INVENTORY, store); }

function getInventory(email) {
  const store = getInventoryStore();
  return store[email] || [];
}
function saveInventory(email, items) {
  const store = getInventoryStore();
  store[email] = items;
  saveInventoryStore(store);
}

function seedInventoryIfEmpty(email) {
  const existing = getInventory(email);
  if (existing.length) return existing;
  const starter = [
    { id: cryptoId(), name: 'Kraft Shipping Boxes (M)', sku: 'BOX-M-001', category: 'Packaging', quantity: 84, reorderLevel: 30 },
    { id: cryptoId(), name: 'Packing Tape Rolls', sku: 'TPE-CLR-014', category: 'Packaging', quantity: 12, reorderLevel: 20 },
    { id: cryptoId(), name: 'Cotton T-Shirt — Black, L', sku: 'APP-TSH-BLK-L', category: 'Apparel', quantity: 5, reorderLevel: 15 },
    { id: cryptoId(), name: 'Ceramic Mug, 12oz', sku: 'MUG-CER-012', category: 'Homeware', quantity: 46, reorderLevel: 10 }
  ];
  saveInventory(email, starter);
  return starter;
}

function cryptoId() {
  return 'i' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function stockStatus(item) {
  if (item.quantity <= 0) return 'critical';
  if (item.quantity <= item.reorderLevel) return 'low';
  return 'ok';
}

/* ---------------------------------------------------------
   Inventory page
   --------------------------------------------------------- */
function initInventoryPage() {
  const table = document.getElementById('inv-table-body');
  if (!table) return; // not on this page

  const user = getCurrentUser();
  if (!user) return;

  let items = seedInventoryIfEmpty(user.email);
  let searchTerm = '';

  function persist() { saveInventory(user.email, items); }

  function renderStats() {
    const total = items.length;
    const low = items.filter(i => stockStatus(i) !== 'ok').length;
    const totalUnits = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-units').textContent = totalUnits;
    const lowEl = document.getElementById('stat-low');
    lowEl.textContent = low;
    lowEl.classList.toggle('accent', low > 0);
  }

  function renderTable() {
    const filtered = items.filter(i =>
      i.name.toLowerCase().includes(searchTerm) ||
      i.sku.toLowerCase().includes(searchTerm) ||
      i.category.toLowerCase().includes(searchTerm)
    );

    const wrap = document.getElementById('inv-table-wrap');
    const empty = document.getElementById('inv-empty');

    if (!items.length) {
      wrap.classList.add('hidden');
      empty.classList.remove('hidden');
      renderStats();
      return;
    }
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');

    table.innerHTML = filtered.map(item => {
      const status = stockStatus(item);
      const pct = Math.max(4, Math.min(100, Math.round((item.quantity / Math.max(item.reorderLevel * 2, 1)) * 100)));
      const badgeClass = status === 'ok' ? 'badge-ok' : status === 'low' ? 'badge-low' : 'badge-critical';
      const badgeText = status === 'ok' ? 'In stock' : status === 'low' ? 'Reorder soon' : 'Out of stock';
      return `
        <tr>
          <td>
            <div class="item-name-cell">${escapeHtml(item.name)}</div>
            <div class="sku-cell">${escapeHtml(item.sku)}</div>
          </td>
          <td>${escapeHtml(item.category)}</td>
          <td>
            <div class="stock-gauge">
              <div class="stock-gauge-track">
                <div class="stock-gauge-fill status-${status}" style="width:${pct}%"></div>
              </div>
              <span class="stock-gauge-label mono">${item.quantity}</span>
            </div>
          </td>
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" data-edit="${item.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-delete="${item.id}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    if (!filtered.length) {
      table.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:28px;">No items match "${escapeHtml(searchTerm)}".</td></tr>`;
    }

    renderStats();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // search
  const searchInput = document.getElementById('inv-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderTable();
    });
  }

  // modal open/close
  const modal = document.getElementById('item-modal');
  const modalForm = document.getElementById('item-form');
  const modalTitle = document.getElementById('modal-title');
  let editingId = null;

  function openModal(item) {
    editingId = item ? item.id : null;
    modalTitle.textContent = item ? 'Edit Item' : 'Add Item';
    document.getElementById('field-name').value = item ? item.name : '';
    document.getElementById('field-sku').value = item ? item.sku : '';
    document.getElementById('field-category').value = item ? item.category : '';
    document.getElementById('field-quantity').value = item ? item.quantity : '';
    document.getElementById('field-reorder').value = item ? item.reorderLevel : '';
    modal.classList.add('show');
    document.getElementById('field-name').focus();
  }
  function closeModal() {
    modal.classList.remove('show');
    editingId = null;
  }

  document.getElementById('add-item-btn').addEventListener('click', () => openModal(null));
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('show')) closeModal(); });

  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('field-name').value.trim();
    const sku = document.getElementById('field-sku').value.trim();
    const category = document.getElementById('field-category').value.trim() || 'Uncategorized';
    const quantity = Number(document.getElementById('field-quantity').value);
    const reorderLevel = Number(document.getElementById('field-reorder').value);

    if (!name || !sku || Number.isNaN(quantity) || Number.isNaN(reorderLevel)) {
      showToast('Please fill in every field correctly.', 'error');
      return;
    }

    if (editingId) {
      items = items.map(i => i.id === editingId ? { ...i, name, sku, category, quantity, reorderLevel } : i);
      showToast('Item updated', 'success');
    } else {
      items.push({ id: cryptoId(), name, sku, category, quantity, reorderLevel });
      showToast('Item added', 'success');
    }
    persist();
    renderTable();
    closeModal();
  });

  // row actions (edit / delete) via event delegation
  table.addEventListener('click', (e) => {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-delete');
    if (editId) {
      const item = items.find(i => i.id === editId);
      if (item) openModal(item);
    }
    if (delId) {
      const item = items.find(i => i.id === delId);
      if (item && confirm(`Remove "${item.name}" from inventory?`)) {
        items = items.filter(i => i.id !== delId);
        persist();
        renderTable();
        showToast('Item removed');
      }
    }
  });

  renderTable();
}

/* ---------------------------------------------------------
   Profile page
   --------------------------------------------------------- */
function initProfilePage() {
  const el = document.getElementById('profile-name');
  if (!el) return; // not on this page

  const user = getCurrentUser();
  if (!user) return;

  document.getElementById('profile-name').textContent = user.name;
  document.getElementById('profile-email').textContent = user.email;
  const name2 = document.getElementById('profile-name-2');
  const email2 = document.getElementById('profile-email-2');
  if (name2) name2.textContent = user.name;
  if (email2) email2.textContent = user.email;
  document.getElementById('profile-avatar-initials').textContent = user.name
    .split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('profile-joined').textContent = new Date(user.createdAt || Date.now())
    .toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const items = getInventory(user.email);
  document.getElementById('profile-item-count').textContent = items.length;
  document.getElementById('profile-low-count').textContent = items.filter(i => stockStatus(i) !== 'ok').length;

  const logoutBtn = document.getElementById('profile-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      showToast('Signed out');
      setTimeout(() => { window.location.href = 'index.html'; }, 400);
    });
  }

  const deleteBtn = document.getElementById('profile-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!confirm('Delete your account and all inventory data? This cannot be undone.')) return;
      const users = getUsers().filter(u => u.email !== user.email);
      saveUsers(users);
      const store = getInventoryStore();
      delete store[user.email];
      saveInventoryStore(store);
      clearSession();
      showToast('Account deleted');
      setTimeout(() => { window.location.href = 'index.html'; }, 500);
    });
  }
}

/* ---------------------------------------------------------
   Boot
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSignupForm();
  initLoginForm();
  initInventoryPage();
  initProfilePage();
});
