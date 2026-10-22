/* ===== Média Marck-Land — outils communs ===== */
// Connexion publique à la base (la clé "publishable" est faite pour être visible).
const SUPABASE_URL = 'https://inglzcjrvhauqoezfbdd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MXJi2QLnqEBi7rJUQ8sf0g_xBM043Fh';
const SITE_NAME = 'Marck-Land Ahouansou';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TZ = 'America/Toronto';

// "18 octobre 2026 à 21 h 14"
function fmtDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-CA', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return date + ' à ' + time.replace(/\s/g, ' ');
}
// "18 oct. 2026"
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('fr-CA', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtNumber(n) { return Number(n || 0).toLocaleString('fr-CA'); }

function textOf(html) {
  const div = document.createElement('div');
  div.innerHTML = DOMPurify.sanitize(html || '', { FORBID_TAGS: ['iframe', 'img'] });
  return div.textContent || '';
}
function readMinutes(html) {
  const words = textOf(html).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
function plural(n, one, many) { return fmtNumber(n) + ' ' + (n > 1 ? many : one); }

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function articleUrl(slug) { return '/a/' + encodeURIComponent(slug) + '/'; }
function categoryUrl(slug) { return 'articles.html?cat=' + encodeURIComponent(slug); }

// Petit constructeur d'éléments sûr (le texte passe toujours par textContent).
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ARTICLE_FIELDS = 'id,title,slug,lede,content,cover_url,tags,published_at,updated_at,views,category:categories(id,name,slug),comment_count';

function commentCount(a) { return a.comment_count || 0; }

// Carte d'article (accueil, articles similaires)
function articleCard(a, opts) {
  const o = opts || {};
  return h('a', { class: 'card', href: articleUrl(a.slug) },
    o.cover && a.cover_url ? h('div', { class: 'card-cover', style: { backgroundImage: 'url("' + encodeURI(a.cover_url) + '")' }, 'aria-hidden': 'true' }) : null,
    a.category ? h('span', { class: 'kicker', text: a.category.name }) : null,
    h('h3', { text: a.title }),
    a.lede ? h('p', { text: a.lede }) : null,
    h('span', { class: 'meta', text: fmtDate(a.published_at) + ' · ' + readMinutes(a.content) + ' min · ' + plural(a.views, 'vue', 'vues') })
  );
}

function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a[data-page]').forEach(a => {
    if (a.dataset.page === page || (page === 'article.html' && a.dataset.page === 'articles.html')) a.setAttribute('aria-current', 'page');
  });
}
document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
  // Bandeau d'abonnement en bas de page (sauf pages où il ferait doublon).
  const page = location.pathname.split('/').pop() || 'index.html';
  const footer = document.querySelector('.site-footer');
  if (footer && !['abonnement.html', 'admin.html', 'article.html'].includes(page)) {
    const band = h('section', { class: 'sub-band', 'aria-label': 'Abonnement' },
      h('div', { class: 'wrap' }, subscribeBox({ dark: true })));
    footer.before(band);
  }
});

function showError(container, message) {
  container.replaceChildren(h('div', { class: 'notice error', role: 'alert', text: message }));
}

// ---------- Nettoyage du contenu des articles ----------
// Seules les vidéos YouTube et Vimeo sont acceptées comme contenu intégré.
const VIDEO_SRC = /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/;
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe' && !VIDEO_SRC.test(node.getAttribute('src') || '')) node.remove();
});
function cleanHTML(html) {
  return DOMPurify.sanitize(html || '', { ADD_TAGS: ['iframe'], ADD_ATTR: ['allowfullscreen', 'frameborder', 'allow', 'target'] });
}

// ---------- Abonnement par courriel ----------
const NEWSLETTER_URL = SUPABASE_URL + '/functions/v1/newsletter';
async function newsletter(action, payload, accessToken) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  let r, data = {};
  try {
    r = await fetch(NEWSLETTER_URL, { method: 'POST', headers, body: JSON.stringify(Object.assign({ action }, payload)) });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    return { error: 'Connexion impossible. Vérifie ta connexion Internet et réessaie.' };
  }
  if (!r.ok || data.error) return { error: data.error || 'Une erreur est survenue (' + r.status + ').' };
  return data;
}

// Bloc « Recevoir les nouveaux articles » (accueil, articles, page abonnement)
function subscribeBox(opts) {
  const o = opts || {};
  const id = 'abo-' + Math.random().toString(36).slice(2, 7);
  const input = h('input', { class: 'field', id, type: 'email', name: 'email', autocomplete: 'email', required: true, placeholder: 'ton.courriel@exemple.com', style: { flex: '1 1 240px', width: 'auto' } });
  const trap = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
  const msg = h('p', { class: 'meta', role: 'status', style: { margin: 0 } }, 'Un courriel à chaque nouvel article. Désabonnement en un clic.');
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Je m’abonne');
  const form = h('form', { class: 'subscribe' + (o.dark ? ' dark' : ''), novalidate: true },
    h('div', {},
      h('h2', { text: o.title || 'Recevoir les nouveaux articles' }),
      h('p', { class: 'sub-lede', text: o.lede || 'Laisse ton courriel et je t’écris quand je publie un nouveau texte. Rien d’autre.' })),
    h('div', { class: 'sub-row' }, h('label', { for: id, class: 'sr-only', text: 'Ton adresse courriel' }), input, btn),
    h('div', { class: 'hp', 'aria-hidden': 'true' }, trap),
    msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.className = 'meta error'; msg.textContent = 'Vérifie ton adresse courriel.'; input.focus(); return; }
    btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Envoi…';
    const r = await newsletter('subscribe', { email, website: trap.value });
    btn.disabled = false;
    if (r.error) { msg.className = 'meta error'; msg.textContent = r.error; return; }
    input.value = '';
    msg.className = 'meta ok';
    msg.textContent = 'Presque fini ! Ouvre le courriel que je viens de t’envoyer et clique sur « Confirmer mon abonnement ». Pense à regarder dans tes indésirables.';
  });
  return form;
}
