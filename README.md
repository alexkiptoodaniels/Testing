# StockEase — Setup & Deployment

A small inventory ledger: `index.html`, `login.html`, `signup.html`, `inventory.html`
(signed-in only), `profile.html` (signed-in only), one shared `style.css`, and one
shared `script.js`. Auth and data are handled by **Supabase**; hosting is a static
deploy on **Vercel**.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once it's provisioned, open **Project Settings → API**. You'll need:
   - **Project URL**
   - **anon / public key**

   The anon key is *meant* to be public in client-side code — it can only do what
   your Row Level Security (RLS) policies below allow it to do.

---

## 2. Run this SQL

Open **SQL Editor** in your Supabase dashboard → **New query** → paste and run
the whole block below. It creates the `inventory` table and locks it down so
each user can only ever see or touch their own rows.

```sql
-- ---------------------------------------------------------
-- Inventory table
-- ---------------------------------------------------------
create table if not exists public.inventory (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  sku            text not null,
  category       text not null default 'Uncategorized',
  quantity       integer not null default 0,
  reorder_level  integer not null default 0,
  created_at     timestamptz not null default now()
);

-- Speeds up "give me this user's items" queries
create index if not exists inventory_user_id_idx on public.inventory (user_id);

-- ---------------------------------------------------------
-- Row Level Security — each user only sees their own rows
-- ---------------------------------------------------------
alter table public.inventory enable row level security;

create policy "Users can view their own inventory"
  on public.inventory
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own inventory"
  on public.inventory
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own inventory"
  on public.inventory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own inventory"
  on public.inventory
  for delete
  using (auth.uid() = user_id);
```

That's the only table you need. User accounts themselves (email, password,
full name) are handled entirely by Supabase Auth — the site stores each
person's name in `user_metadata.full_name` at signup, so there's no separate
`profiles` table to maintain.

### Optional: skip email confirmation while testing

By default Supabase requires users to click a confirmation link before they
can sign in. For quick local testing, go to **Authentication → Providers →
Email** and toggle **Confirm email** off. Turn it back on before you launch
for real — otherwise anyone can sign up with an email they don't own.

---

## 3. Connect the site to your project

Open `script.js` and fill in the two constants near the top:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Save the file — no build step needed, this is plain HTML/CSS/JS.

---

## 4. Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop it into Vercel directly).
2. In Vercel: **Add New → Project** → import the repo.
3. Framework preset: choose **Other** (it's static — no build command needed).
4. Deploy.

Since the Supabase URL/key live in `script.js` rather than environment
variables, there's nothing extra to configure in Vercel itself. If you'd
rather not commit real keys to your repo, keep a `script.example.js` with
placeholders in git and set the real `script.js` via Vercel's dashboard
file upload, or wire up a tiny build step to inject env vars — not required
to get this running, just an option if you want it.

---

## 5. What each page expects to find

| File             | Needs to exist on the page |
|-------------------|----------------------------|
| `index.html`       | nav only |
| `login.html`        | `#login-form`, `#form-msg` |
| `signup.html`       | `#signup-form`, `#form-msg` |
| `inventory.html`    | `#auth-loading`, `#protected-content`, `#inv-table-body`, `#item-modal` |
| `profile.html`      | `#auth-loading`, `#protected-content`, `#profile-name`, etc. |

`inventory.html` and `profile.html` are guarded client-side: `script.js`
checks for a Supabase session on load, shows a brief "Checking your
session…" message, then either reveals the page or redirects to
`login.html`. The real security boundary is the RLS policies above, not
this redirect — the redirect is just UX.

---

## 6. A note on "Delete Account"

The anon key (used everywhere in this site) can delete a user's own
**data**, but it can't delete the **auth user record itself** — that
requires Supabase's service-role key, which must never be exposed in
client-side code. The profile page's delete button clears the user's
inventory rows and signs them out. If you want true self-service account
deletion, add a small serverless function (e.g. a Vercel API route) that
uses the Supabase service-role key server-side to call
`supabase.auth.admin.deleteUser(id)`.
