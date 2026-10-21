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
  div.innerHTML = DOMPurify.sanitize(html || '');
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
function articleUrl(slug) { return 'article.html?a=' + encodeURIComponent(slug); }
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
});

function showError(container, message) {
  container.replaceChildren(h('div', { class: 'notice error', role: 'alert', text: message }));
}
