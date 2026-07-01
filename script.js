/* =========================================================
   STOCKEASE — shared script.js (Supabase-backed)

   Uses Supabase Auth for signup/login/logout and a Postgres
   `inventory` table (with row-level security) for CRUD.
   Requires the Supabase JS SDK to be loaded before this file:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

   Fill in your project's URL + anon key below. The anon key
   is safe to expose in client-side code — it only grants what
   your Row Level Security policies allow. See README.md.
   ========================================================= */

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ---------------------------------------------------------
   Session helpers
   --------------------------------------------------------- */
async function getSessionUser() {
  const { data, error } = await sb.auth.getSession();
  if (error) return null;
  return data.session ? data.session.user : null;
}

/* ---------------------------------------------------------
   Navbar — reflects auth state, kept in sync via onAuthStateChange
   --------------------------------------------------------- */
function applyNavForUser(user) {
  const loggedIn = !!user;

  document.querySelectorAll('[data-auth="in"]').forEach(el => el.classList.toggle('hidden', !loggedIn));
  document.querySelectorAll('[data-auth="out"]').forEach(el => el.classList.toggle('hidden', loggedIn));

  const authBtn = document.getElementById('nav-auth-btn');
  if (authBtn) {
    if (loggedIn) {
      authBtn.textContent = 'Sign Out';
      authBtn.setAttribute('href', '#');
      authBtn.onclick = async (e) => {
        e.preventDefault();
        await sb.auth.signOut();
        showToast('Signed out');
        setTimeout(() => { window.location.href = 'index.html'; }, 350);
      };
    } else {
      authBtn.textContent = 'Login';
      authBtn.setAttribute('href', 'login.html');
      authBtn.onclick = null;
    }
  }

  const nameEl = document.getElementById('nav-user-name');
  if (nameEl) {
    const fullName = loggedIn ? (user.user_metadata && user.user_metadata.full_name) || user.email : '';
    nameEl.textContent = fullName ? fullName.split(' ')[0] : '';
  }
}

async function initNavbar() {
  const user = await getSessionUser();
  applyNavForUser(user);

  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === current);
  });

  sb.auth.onAuthStateChange((_event, session) => {
    applyNavForUser(session ? session.user : null);
  });
}

/* Guards a protected page. Expects the page to have:
     <div id="auth-loading">…</div>
     <div id="protected-content" class="hidden">…</div>
   Reveals protected-content if signed in, otherwise redirects
   to login.html. Returns the signed-in user (or null). */
async function requireAuth() {
  const user = await getSessionUser();
  const loading = document.getElementById('auth-loading');
  const content = document.getElementById('protected-content');

  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (loading) loading.classList.add('hidden');
  if (content) content.classList.remove('hidden');
  return user;
}

/* ---------------------------------------------------------
   Signup / Login form wiring
   --------------------------------------------------------- */
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('form-msg');
    const submitBtn = form.querySelector('button[type="submit"]');
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    const showError = (text) => {
      msg.textContent = text;
      msg.className = 'form-msg error show';
    };

    if (!name || !email || !password || !confirm) return showError('Please fill in every field.');
    if (password.length < 6) return showError('Password needs at least 6 characters.');
    if (password !== confirm) return showError('Passwords do not match.');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';

    if (error) {
      showError(error.message || 'Could not create your account.');
      return;
    }

    if (!data.session) {
      // Email confirmation is turned on in Supabase Auth settings.
      msg.textContent = 'Account created — check your email to confirm, then sign in.';
      msg.className = 'form-msg success show';
      form.reset();
      return;
    }

    msg.textContent = 'Account created. Redirecting…';
    msg.className = 'form-msg success show';
    setTimeout(() => { window.location.href = 'inventory.html'; }, 500);
  });
}

function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('form-msg');
    const submitBtn = form.querySelector('button[type="submit"]');
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const { error } = await sb.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';

    if (error) {
      msg.textContent = error.message || 'Incorrect email or password.';
      msg.className = 'form-msg error show';
      return;
    }

    msg.textContent = 'Welcome back. Redirecting…';
    msg.className = 'form-msg success show';
    setTimeout(() => { window.location.href = 'inventory.html'; }, 400);
  });
}

/* ---------------------------------------------------------
   Inventory data (Supabase table: public.inventory)
   --------------------------------------------------------- */
async function fetchInventory() {
  const { data, error } = await sb.from('inventory').select('*').order('created_at', { ascending: true });
  if (error) {
    showToast('Could not load inventory: ' + error.message, 'error');
    return [];
  }
  return data;
}

function stockStatus(item) {
  if (item.quantity <= 0) return 'critical';
  if (item.quantity <= item.reorder_level) return 'low';
  return 'ok';
}

/* ---------------------------------------------------------
   Inventory page
   --------------------------------------------------------- */
async function initInventoryPage() {
  const table = document.getElementById('inv-table-body');
  if (!table) return; // not on this page

  const user = await requireAuth();
  if (!user) return;

  let items = [];
  let searchTerm = '';

  async function loadAndRender() {
    items = await fetchInventory();
    renderTable();
  }

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
      (i.category || '').toLowerCase().includes(searchTerm)
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
      const pct = Math.max(4, Math.min(100, Math.round((item.quantity / Math.max(item.reorder_level * 2, 1)) * 100)));
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

  const searchInput = document.getElementById('inv-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderTable();
    });
  }

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
    document.getElementById('field-reorder').value = item ? item.reorder_level : '';
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

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('field-name').value.trim();
    const sku = document.getElementById('field-sku').value.trim();
    const category = document.getElementById('field-category').value.trim() || 'Uncategorized';
    const quantity = Number(document.getElementById('field-quantity').value);
    const reorder_level = Number(document.getElementById('field-reorder').value);

    if (!name || !sku || Number.isNaN(quantity) || Number.isNaN(reorder_level)) {
      showToast('Please fill in every field correctly.', 'error');
      return;
    }

    const saveBtn = modalForm.querySelector('button[type="submit"]');
    saveBtn.disabled = true;

    if (editingId) {
      const { error } = await sb.from('inventory')
        .update({ name, sku, category, quantity, reorder_level })
        .eq('id', editingId);
      saveBtn.disabled = false;
      if (error) { showToast('Update failed: ' + error.message, 'error'); return; }
      showToast('Item updated', 'success');
    } else {
      const { error } = await sb.from('inventory')
        .insert({ name, sku, category, quantity, reorder_level, user_id: user.id });
      saveBtn.disabled = false;
      if (error) { showToast('Add failed: ' + error.message, 'error'); return; }
      showToast('Item added', 'success');
    }

    closeModal();
    await loadAndRender();
  });

  table.addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-delete');
    if (editId) {
      const item = items.find(i => i.id === editId);
      if (item) openModal(item);
    }
    if (delId) {
      const item = items.find(i => i.id === delId);
      if (item && confirm(`Remove "${item.name}" from inventory?`)) {
        const { error } = await sb.from('inventory').delete().eq('id', delId);
        if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
        showToast('Item removed');
        await loadAndRender();
      }
    }
  });

  await loadAndRender();
}

/* ---------------------------------------------------------
   Profile page
   --------------------------------------------------------- */
async function initProfilePage() {
  const el = document.getElementById('profile-name');
  if (!el) return; // not on this page

  const user = await requireAuth();
  if (!user) return;

  const fullName = (user.user_metadata && user.user_metadata.full_name) || user.email;
  document.getElementById('profile-name').textContent = fullName;
  document.getElementById('profile-email').textContent = user.email;
  const name2 = document.getElementById('profile-name-2');
  const email2 = document.getElementById('profile-email-2');
  if (name2) name2.textContent = fullName;
  if (email2) email2.textContent = user.email;
  document.getElementById('profile-avatar-initials').textContent = fullName
    .split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('profile-joined').textContent = new Date(user.created_at)
    .toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const items = await fetchInventory();
  document.getElementById('profile-item-count').textContent = items.length;
  document.getElementById('profile-low-count').textContent = items.filter(i => stockStatus(i) !== 'ok').length;

  const logoutBtn = document.getElementById('profile-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await sb.auth.signOut();
      showToast('Signed out');
      setTimeout(() => { window.location.href = 'index.html'; }, 350);
    });
  }

  const deleteBtn = document.getElementById('profile-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const ok = confirm(
        'This deletes all your inventory data and signs you out.\n\n' +
        'Note: fully deleting the login account itself requires a server-side ' +
        'admin action (the public anon key cannot do this) — see README.md.'
      );
      if (!ok) return;
      const { error } = await sb.from('inventory').delete().eq('user_id', user.id);
      if (error) { showToast('Could not clear data: ' + error.message, 'error'); return; }
      await sb.auth.signOut();
      showToast('Inventory data deleted');
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
