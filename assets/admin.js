/* ===== Média Marck-Land — espace privé ===== */
(function () {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  let cats = [];
  let dirty = false;

  // ---------- Petits outils ----------
  function toast(msg, isErr) {
    const t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), isErr ? 6000 : 3000);
  }
  function errMsg(error) {
    if (!error) return '';
    if (error.code === '23505') return 'Cette adresse (slug) est déjà utilisée par un autre article. Change-la.';
    if (error.code === '42501' || /row-level security/i.test(error.message)) return 'Action refusée : ce compte n’a pas les droits d’administration.';
    return error.message || 'Une erreur est survenue.';
  }
  // Bouton en deux temps, sans fenêtre de confirmation.
  function confirmBtn(label, onConfirm) {
    let armed = false, timer;
    const b = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, label);
    b.addEventListener('click', async () => {
      if (!armed) { armed = true; b.textContent = 'Confirmer ?'; timer = setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
      clearTimeout(timer); b.disabled = true; await onConfirm(); b.disabled = false; armed = false; b.textContent = label;
    });
    return b;
  }
  function statusOf(a) {
    if (a.status !== 'published') return { cls: 'draft', label: 'Brouillon' };
    if (a.published_at && new Date(a.published_at) > new Date()) return { cls: 'sched', label: 'Programmé' };
    return { cls: 'live', label: 'Publié' };
  }
  function toLocalInput(iso) {
    const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  async function loadCats() {
    const { data } = await db.from('categories').select('*').order('position');
    cats = data || [];
  }
  async function refreshCounts() {
    const [a, c] = await Promise.all([
      db.from('articles').select('id', { count: 'exact', head: true }),
      db.from('comments').select('id', { count: 'exact', head: true })
    ]);
    $('n-art').textContent = a.count != null ? '(' + a.count + ')' : '';
    $('n-com').textContent = c.count != null ? '(' + c.count + ')' : '';
  }

  // ---------- Navigation ----------
  function go(tab, arg) {
    if (dirty && !window.confirm('Tu as des modifications non enregistrées. Quitter quand même ?')) return;
    dirty = false;
    const active = tab === 'editeur' && arg ? 'articles' : tab;
    document.querySelectorAll('.side button').forEach(b => {
      if (b.dataset.tab === active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    history.replaceState(null, '', '#' + tab + (arg ? '=' + arg : ''));
    ({ articles: showArticles, editeur: showEditor, commentaires: showComments, categories: showCategories, mots: showWords })[tab](arg);
  }
  document.querySelectorAll('.side button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Mes articles ----------
  async function showArticles() {
    panel.replaceChildren(h('h1', { text: 'Mes articles' }), h('p', { class: 'hint', text: 'Chargement…' }));
    const { data, error } = await db.from('articles')
      .select('id,title,slug,status,published_at,created_at,views,category:categories(name),comments(count)')
      .order('published_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
    if (error) { panel.replaceChildren(h('h1', { text: 'Mes articles' }), h('p', { class: 'error', text: errMsg(error) })); return; }
    const rows = data || [];
    const totalViews = rows.reduce((s, r) => s + Number(r.views || 0), 0);
    const totalCom = rows.reduce((s, r) => s + commentCount(r), 0);
    const live = rows.filter(r => statusOf(r).cls === 'live').length;

    const table = rows.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Titre', 'Statut', 'Catégorie', 'Date', 'Vues', 'Comm.', ''].map(t => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, rows.map(r => {
        const st = statusOf(r);
        return h('tr', {},
          h('td', { class: 'title', text: r.title }),
          h('td', {}, h('span', { class: 'pill ' + st.cls, text: st.label })),
          h('td', { text: r.category ? r.category.name : '—' }),
          h('td', { class: 'meta', text: r.published_at ? fmtDateTime(r.published_at) : 'Créé le ' + fmtDate(r.created_at) }),
          h('td', { text: fmtNumber(r.views) }),
          h('td', { text: fmtNumber(commentCount(r)) }),
          h('td', {}, h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => go('editeur', r.id) }, 'Modifier'),
            st.cls === 'live' ? h('a', { class: 'btn btn-sm btn-ghost', href: articleUrl(r.slug), target: '_blank', rel: 'noopener' }, 'Voir') : null,
            confirmBtn('Supprimer', async () => {
              const { error: e } = await db.from('articles').delete().eq('id', r.id);
              if (e) toast(errMsg(e), true); else { toast('Article supprimé.'); showArticles(); refreshCounts(); }
            }))));
      })))) : h('div', { class: 'notice' }, 'Aucun article pour l’instant. ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => go('editeur') }, 'Écrire le premier'));

    panel.replaceChildren(
      h('h1', { text: 'Mes articles' }),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { text: 'Articles publiés' }), h('b', { text: fmtNumber(live) })),
        h('div', { class: 'stat' }, h('span', { text: 'Vues au total' }), h('b', { text: fmtNumber(totalViews) })),
        h('div', { class: 'stat' }, h('span', { text: 'Commentaires' }), h('b', { text: fmtNumber(totalCom) }))),
      table);
  }

  // ---------- Éditeur ----------
  async function showEditor(id) {
    await loadCats();
    let art = { title: '', slug: '', lede: '', content: '', category_id: cats[0] ? cats[0].id : null, tags: [], cover_url: null, status: 'draft', published_at: null };
    if (id) {
      const { data, error } = await db.from('articles').select('*').eq('id', id).maybeSingle();
      if (error || !data) { panel.replaceChildren(h('h1', { text: 'Article introuvable' })); return; }
      art = data;
    }
    const st = statusOf(art);
    let slugTouched = !!art.slug;

    const fTitle = h('input', { class: 'f f-title', id: 'e-titre', type: 'text', value: art.title, maxlength: '200', placeholder: 'Titre de l’article' });
    const fSlug = h('input', { class: 'f', id: 'e-slug', type: 'text', value: art.slug, maxlength: '80', placeholder: 'adresse-de-l-article' });
    const fLede = h('textarea', { class: 'f f-lede', id: 'e-chapo', rows: '2', maxlength: '400', placeholder: 'Une ou deux phrases qui donnent envie de lire.' });
    fLede.value = art.lede || '';
    const fCat = h('select', { class: 'f', id: 'e-cat' }, h('option', { value: '' }, 'Sans catégorie'),
      cats.map(c => h('option', { value: String(c.id), selected: c.id === art.category_id }, c.name)));
    const fTags = h('input', { class: 'f', id: 'e-tags', type: 'text', value: (art.tags || []).join(', '), placeholder: 'élections, jeunesse' });
    const coverPrev = h('div', { class: 'cover-prev' }, 'Aucune image');
    let coverUrl = art.cover_url;
    function paintCover() {
      coverPrev.style.backgroundImage = coverUrl ? 'url("' + encodeURI(coverUrl) + '")' : '';
      coverPrev.textContent = coverUrl ? '' : 'Aucune image';
      removeCover.hidden = !coverUrl;
    }
    const fCover = h('input', { type: 'file', id: 'e-cover', accept: 'image/*', class: 'sr-only' });
    const removeCover = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { coverUrl = null; dirty = true; paintCover(); } }, 'Retirer');
    fCover.addEventListener('change', async () => {
      const f = fCover.files[0]; if (!f) return;
      coverPrev.textContent = 'Envoi…';
      const url = await uploadImage(f);
      if (url) { coverUrl = url; dirty = true; }
      paintCover();
    });

    const when = art.status === 'published' && art.published_at && new Date(art.published_at) > new Date() ? 'later' : 'now';
    const rNow = h('input', { type: 'radio', name: 'quand', value: 'now', checked: when === 'now' });
    const rLater = h('input', { type: 'radio', name: 'quand', value: 'later', checked: when === 'later' });
    const fDate = h('input', { type: 'datetime-local', class: 'f', id: 'e-date', value: when === 'later' ? toLocalInput(art.published_at) : '' });
    const dateWrap = h('div', { class: 'stack', hidden: when !== 'later' }, h('label', { for: 'e-date', text: 'Date et heure (heure de Québec)' }), fDate);
    [rNow, rLater].forEach(r => r.addEventListener('change', () => { dateWrap.hidden = !rLater.checked; dirty = true; }));

    const quillBox = h('div', { id: 'quill' });
    const btnPublish = h('button', { type: 'button', class: 'btn btn-accent' }, st.cls === 'draft' ? 'Publier' : 'Mettre à jour');
    const btnDraft = h('button', { type: 'button', class: 'btn btn-ghost' }, st.cls === 'draft' ? 'Enregistrer le brouillon' : 'Retirer de la publication');
    const info = h('p', { class: 'hint' },
      st.cls === 'live' ? 'Publié le ' + fmtDateTime(art.published_at) + (art.updated_at ? ' · mis à jour le ' + fmtDateTime(art.updated_at) : '') + '. Modifier le texte affichera « Mis à jour le… ».'
        : st.cls === 'sched' ? 'Programmé pour le ' + fmtDateTime(art.published_at) + '.'
          : 'La date et l’heure de publication sont enregistrées au moment où tu cliques sur « Publier ».');

    panel.replaceChildren(
      h('h1', { text: id ? 'Modifier l’article' : 'Nouvel article' }),
      h('div', { class: 'editor-grid' },
        h('div', { class: 'editor-main' },
          h('label', { for: 'e-titre', text: 'Titre' }), fTitle,
          h('label', { for: 'e-chapo', text: 'Chapô (résumé sous le titre)' }), fLede,
          h('label', { text: 'Contenu' }), quillBox),
        h('div', { class: 'editor-side' },
          h('div', { class: 'box stack' },
            h('h2', { style: { margin: 0, fontSize: '17px' } }, 'Publication ', h('span', { class: 'pill ' + st.cls, text: st.label })),
            info,
            st.cls !== 'live' ? h('fieldset', { class: 'stack', style: { border: 0, padding: 0, margin: 0 } },
              h('legend', { text: 'Quand publier ?' }),
              h('label', { class: 'radio' }, rNow, 'Maintenant'),
              h('label', { class: 'radio' }, rLater, 'Programmer une date'),
              dateWrap) : null,
            btnPublish, btnDraft,
            st.cls === 'live' ? h('a', { class: 'btn btn-ghost', href: articleUrl(art.slug), target: '_blank', rel: 'noopener' }, 'Voir l’article ↗') : null),
          h('div', { class: 'box stack' },
            h('label', { for: 'e-cat', text: 'Catégorie' }), fCat,
            h('label', { for: 'e-tags', text: 'Mots-clés (séparés par des virgules)' }), fTags,
            h('label', { for: 'e-slug', text: 'Adresse de l’article' }), fSlug,
            h('p', { class: 'hint', text: 'Elle apparaît dans le lien : article.html?a=' + (art.slug || '…') })),
          h('div', { class: 'box stack' },
            h('label', { for: 'e-cover', text: 'Image de couverture (facultative)' }), coverPrev,
            h('div', { class: 'actions' }, h('label', { for: 'e-cover', class: 'btn btn-sm btn-ghost', style: { fontWeight: 500 } }, 'Choisir une image'), removeCover)))));
    paintCover();

    const quill = new Quill(quillBox, {
      theme: 'snow',
      placeholder: 'Écris ton article ici…',
      modules: { toolbar: { container: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], ['blockquote', 'link'], [{ list: 'ordered' }, { list: 'bullet' }], ['image'], ['clean']],
        handlers: { image: () => pickInlineImage(quill) } } }
    });
    if (art.content) quill.clipboard.dangerouslyPasteHTML(DOMPurify.sanitize(art.content));
    quill.on('text-change', () => { dirty = true; });

    fTitle.addEventListener('input', () => { dirty = true; if (!slugTouched) fSlug.value = slugify(fTitle.value); });
    fSlug.addEventListener('input', () => { slugTouched = true; dirty = true; });
    [fLede, fCat, fTags, fDate].forEach(el => el.addEventListener('input', () => { dirty = true; }));

    function collect() {
      // getSemanticHTML (Quill 2) remplace les espaces par &nbsp; : on les remet normaux.
      const html = (quill.getSemanticHTML ? quill.getSemanticHTML() : quill.root.innerHTML).replace(/&nbsp;/g, ' ');
      return {
        title: fTitle.value.trim(),
        slug: slugify(fSlug.value || fTitle.value),
        lede: fLede.value.trim() || null,
        content: quill.getText().trim() ? DOMPurify.sanitize(html) : '',
        category_id: fCat.value ? Number(fCat.value) : null,
        tags: fTags.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
        cover_url: coverUrl || null
      };
    }

    async function save(mode) {
      const p = collect();
      if (!p.title) { toast('Donne un titre à ton article.', true); fTitle.focus(); return; }
      if (!p.slug) { toast('L’adresse de l’article est vide.', true); return; }
      if (mode !== 'draft' && !p.content) { toast('L’article est vide.', true); return; }

      if (mode === 'draft') { p.status = 'draft'; p.published_at = null; }
      else if (st.cls === 'live') { /* mise à jour : on garde le statut et la date */ }
      else if (rLater.checked) {
        if (!fDate.value) { toast('Choisis la date et l’heure de publication.', true); return; }
        const d = new Date(fDate.value);
        if (d <= new Date()) { toast('La date programmée doit être dans le futur.', true); return; }
        p.status = 'published'; p.published_at = d.toISOString();
      } else { p.status = 'published'; p.published_at = null; }

      btnPublish.disabled = btnDraft.disabled = true;
      const q = id ? db.from('articles').update(p).eq('id', id).select('id').single() : db.from('articles').insert(p).select('id').single();
      const { data, error } = await q;
      btnPublish.disabled = btnDraft.disabled = false;
      if (error) { toast(errMsg(error), true); return; }
      dirty = false;
      toast(mode === 'draft' ? (st.cls === 'draft' ? 'Brouillon enregistré.' : 'Article retiré de la publication.') : st.cls === 'live' ? 'Article mis à jour.' : rLater.checked ? 'Publication programmée.' : 'Article publié !');
      refreshCounts();
      go('editeur', data.id);
    }
    btnPublish.addEventListener('click', () => save('publish'));
    btnDraft.addEventListener('click', () => save('draft'));
    if (!id) fTitle.focus();
  }

  async function uploadImage(file) {
    if (file.size > 5 * 1024 * 1024) { toast('Image trop lourde (5 Mo maximum).', true); return null; }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = new Date().toISOString().slice(0, 7) + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await db.storage.from('images').upload(path, file, { cacheControl: '31536000', contentType: file.type });
    if (error) { toast('Envoi de l’image impossible : ' + errMsg(error), true); return null; }
    return db.storage.from('images').getPublicUrl(path).data.publicUrl;
  }
  function pickInlineImage(quill) {
    const input = h('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      toast('Envoi de l’image…');
      const url = await uploadImage(f);
      if (url) { const r = quill.getSelection(true); quill.insertEmbed(r.index, 'image', url, 'user'); quill.setSelection(r.index + 1); }
    });
    input.click();
  }

  // ---------- Commentaires ----------
  async function showComments() {
    panel.replaceChildren(h('h1', { text: 'Commentaires' }), h('p', { class: 'hint', text: 'Chargement…' }));
    const { data, error } = await db.from('comments').select('id,author,body,created_at,article:articles(title,slug)').order('created_at', { ascending: false }).limit(200);
    if (error) { panel.replaceChildren(h('h1', { text: 'Commentaires' }), h('p', { class: 'error', text: errMsg(error) })); return; }
    const rows = data || [];
    panel.replaceChildren(h('h1', { text: 'Commentaires' }),
      h('p', { class: 'hint', style: { marginBottom: '16px' }, text: 'Les commentaires s’affichent tout de suite sur le site. Supprime ceux qui ne respectent pas tes règles.' }),
      rows.length ? h('div', { class: 'box', style: { padding: '4px 20px' } }, rows.map(c => h('div', { class: 'comment' },
        h('div', { class: 'avatar', 'aria-hidden': 'true', text: c.author.charAt(0).toUpperCase() }),
        h('div', { class: 'comment-body' },
          h('div', { class: 'comment-head' }, h('strong', { text: c.author }), h('span', { class: 'meta', style: { fontSize: '12px' }, text: fmtDateTime(c.created_at) })),
          h('span', { class: 'hint' }, 'sur ', c.article ? h('a', { href: articleUrl(c.article.slug), target: '_blank', rel: 'noopener', text: c.article.title }) : '—'),
          h('p', { style: { fontFamily: 'var(--serif)' }, text: c.body }),
          h('div', {}, confirmBtn('Supprimer', async () => {
            const { error: e } = await db.from('comments').delete().eq('id', c.id);
            if (e) toast(errMsg(e), true); else { toast('Commentaire supprimé.'); showComments(); refreshCounts(); }
          })))))) : h('div', { class: 'notice', text: 'Aucun commentaire pour l’instant.' }));
  }

  // ---------- Catégories ----------
  async function showCategories() {
    await loadCats();
    const nName = h('input', { class: 'f', type: 'text', placeholder: 'Nouvelle catégorie', 'aria-label': 'Nom de la nouvelle catégorie' });
    const nDesc = h('input', { class: 'f', type: 'text', placeholder: 'Courte description (facultatif)', 'aria-label': 'Description' });
    panel.replaceChildren(h('h1', { text: 'Catégories' }),
      h('div', { class: 'box' },
        cats.map((c, i) => {
          const fn = h('input', { class: 'f', type: 'text', value: c.name, 'aria-label': 'Nom' });
          const fd = h('input', { class: 'f', type: 'text', value: c.description || '', 'aria-label': 'Description' });
          return h('div', { class: 'cat-row' }, fn, fd,
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => {
              const { error } = await db.from('categories').update({ name: fn.value.trim(), description: fd.value.trim() || null }).eq('id', c.id);
              toast(error ? errMsg(error) : 'Catégorie enregistrée.', !!error);
            } }, 'Enregistrer'),
            confirmBtn('Supprimer', async () => {
              const { error } = await db.from('categories').delete().eq('id', c.id);
              if (error) toast(errMsg(error), true); else { toast('Catégorie supprimée. Ses articles sont maintenant sans catégorie.'); showCategories(); }
            }));
        }),
        h('div', { class: 'cat-row' }, nName, nDesc, h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
          const name = nName.value.trim(); if (!name) return;
          const { error } = await db.from('categories').insert({ name, slug: slugify(name), description: nDesc.value.trim() || null, position: cats.length + 1 });
          if (error) toast(errMsg(error), true); else { toast('Catégorie ajoutée.'); showCategories(); }
        } }, 'Ajouter'))));
  }

  // ---------- Mots filtrés ----------
  async function showWords() {
    const { data, error } = await db.from('blocked_words').select('word').order('word');
    const input = h('input', { class: 'f', type: 'text', placeholder: 'Un mot ou une expression', 'aria-label': 'Mot à filtrer', style: { flex: '1 1 240px', width: 'auto' } });
    async function add() {
      const w = input.value.trim().toLowerCase(); if (!w) return;
      const { error: e } = await db.from('blocked_words').insert({ word: w });
      if (e && e.code !== '23505') toast(errMsg(e), true); else showWords();
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    panel.replaceChildren(h('h1', { text: 'Mots filtrés' }),
      h('p', { class: 'hint', style: { marginBottom: '16px' }, text: 'Un commentaire qui contient l’un de ces mots est refusé automatiquement (les accents et majuscules sont ignorés).' }),
      h('div', { class: 'box stack' },
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, input, h('button', { type: 'button', class: 'btn btn-sm', onclick: add }, 'Ajouter')),
        error ? h('p', { class: 'error', text: errMsg(error) }) :
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, (data || []).length ? data.map(r => h('span', { class: 'word' }, r.word,
            h('button', { type: 'button', 'aria-label': 'Retirer ' + r.word, onclick: async () => { await db.from('blocked_words').delete().eq('word', r.word); showWords(); } }, '×'))) : h('span', { class: 'hint', text: 'Aucun mot filtré pour l’instant.' }))));
  }

  // ---------- Connexion ----------
  function showView(name) {
    $('vue-login').hidden = name !== 'login';
    $('vue-nouveau-mdp').hidden = name !== 'mdp';
    $('vue-app').hidden = name !== 'app';
  }
  async function enterApp() {
    showView('app');
    refreshCounts();
    const m = location.hash.match(/^#(articles|editeur|commentaires|categories|mots)(?:=(\d+))?/);
    go(m ? m[1] : 'articles', m && m[2] ? Number(m[2]) : undefined);
  }

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('l-msg'); msg.className = 'hint'; msg.textContent = 'Connexion…';
    const { error } = await db.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-pass').value });
    if (error) { msg.className = 'error'; msg.textContent = /invalid/i.test(error.message) ? 'Courriel ou mot de passe incorrect.' : error.message; return; }
    $('l-pass').value = '';
    enterApp();
  });
  $('l-oubli').addEventListener('click', async () => {
    const msg = $('l-msg');
    const { error } = await db.auth.resetPasswordForEmail($('l-email').value.trim(), { redirectTo: location.origin + location.pathname });
    msg.className = error ? 'error' : 'hint';
    msg.textContent = error ? error.message : 'Si ce courriel est le bon, un lien pour changer le mot de passe vient d’être envoyé.';
  });
  $('form-mdp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await db.auth.updateUser({ password: $('n-pass').value });
    $('n-msg').className = error ? 'error' : 'hint';
    $('n-msg').textContent = error ? error.message : 'Mot de passe changé.';
    if (!error) setTimeout(enterApp, 800);
  });
  $('logout').addEventListener('click', async () => {
    if (dirty && !window.confirm('Tu as des modifications non enregistrées. Te déconnecter quand même ?')) return;
    dirty = false;
    await db.auth.signOut(); showView('login');
  });

  db.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showView('mdp'); });
  db.auth.getSession().then(({ data }) => {
    if (location.hash.includes('type=recovery')) return showView('mdp');
    if (data.session) enterApp(); else showView('login');
  });
})();
