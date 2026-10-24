/* ===== Média Marck-Land — espace privé ===== */
(function () {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  let cats = [];
  let dirty = false;

  // ---------- Formats supplémentaires de l'éditeur ----------
  const BlockEmbed = Quill.import('blots/block/embed');
  class Divider extends BlockEmbed {}
  Divider.blotName = 'divider'; Divider.tagName = 'hr';
  // Légende : une classe sur la ligne (comme l'alignement), relue correctement par l'éditeur.
  const Parchment = Quill.import('parchment');
  const Caption = new Parchment.ClassAttributor('caption', 'legende', { scope: Parchment.Scope.BLOCK, whitelist: ['image'] });
  // Quill 2 enregistre les vidéos comme simple lien : on garde le lecteur intégré.
  const Video = Quill.import('formats/video');
  class EmbedVideo extends Video { html() { return this.domNode.outerHTML; } }
  Quill.register(EmbedVideo, true);
  Quill.register(Divider, true);
  Quill.register({ 'formats/caption': Caption }, true);
  const COLORS = ['#16191D', '#1E7A54', '#1F5FAD', '#A3301F', '#8A5A00', '#6B3FA0', '#5F6670'];
  const TOOL_TITLES = {
    'ql-header': 'Intertitre', 'ql-bold': 'Gras', 'ql-italic': 'Italique', 'ql-underline': 'Souligné', 'ql-strike': 'Barré',
    'ql-color': 'Couleur du texte', 'ql-align': 'Alignement', 'ql-script': 'Exposant / indice', 'ql-blockquote': 'Citation',
    'ql-link': 'Lien', 'ql-list': 'Liste', 'ql-indent': 'Retrait', 'ql-image': 'Insérer une image', 'ql-video': 'Insérer une vidéo YouTube ou Vimeo',
    'ql-caption': 'Transformer la ligne en légende d’image', 'ql-divider': 'Ligne de séparation', 'ql-table': 'Insérer un tableau', 'ql-clean': 'Effacer la mise en forme'
  };

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
    const [a, c, m] = await Promise.all([
      db.from('articles').select('id', { count: 'exact', head: true }),
      db.from('comments').select('id', { count: 'exact', head: true }),
      db.from('messages').select('id', { count: 'exact', head: true }).eq('is_read', false)
    ]);
    $('n-msg').textContent = m.count ? '(' + m.count + ' nouveau' + (m.count > 1 ? 'x' : '') + ')' : '';
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
    ({ articles: showArticles, editeur: showEditor, commentaires: showComments, messages: showMessages, abonnes: showSubscribers, categories: showCategories, mots: showWords })[tab](arg);
  }
  document.querySelectorAll('.side button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Mes articles ----------
  async function showArticles() {
    panel.replaceChildren(h('h1', { text: 'Mes articles' }), h('p', { class: 'hint', text: 'Chargement…' }));
    const { data, error } = await db.from('articles')
      .select('id,title,slug,status,published_at,created_at,views,category:categories(name),comment_count')
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

    // --- Envoi aux abonnés ---
    const subsCount = (await db.from('subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed')).count || 0;
    const fSend = h('input', { type: 'checkbox', id: 'e-send', checked: !!art.send_newsletter });
    fSend.addEventListener('change', () => { dirty = true; });
    let sendBox;
    if (art.newsletter_sent_at) {
      sendBox = h('p', { class: 'hint', style: { color: 'var(--accent-dark)' } }, '✓ Envoyé à ' + plural(art.newsletter_count || 0, 'abonné', 'abonnés') + ' le ' + fmtDateTime(art.newsletter_sent_at) + '.');
    } else if (st.cls === 'live') {
      const b = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Envoyer aux abonnés maintenant');
      let armed = false;
      b.addEventListener('click', async () => {
        if (!armed) { armed = true; b.textContent = 'Confirmer l’envoi à ' + plural(subsCount, 'abonné', 'abonnés') + ' ?'; setTimeout(() => { armed = false; b.textContent = 'Envoyer aux abonnés maintenant'; }, 5000); return; }
        b.disabled = true; b.textContent = 'Envoi…';
        await sendNow(id);
        go('editeur', id);
      });
      sendBox = h('div', { class: 'stack' }, b, h('p', { class: 'hint', text: plural(subsCount, 'abonné confirmé', 'abonnés confirmés') + '. Un article ne peut être envoyé qu’une seule fois.' }));
    } else {
      sendBox = h('div', { class: 'stack' },
        h('label', { class: 'radio', for: 'e-send' }, fSend, 'Envoyer aux abonnés par courriel'),
        h('p', { class: 'hint', text: plural(subsCount, 'abonné confirmé', 'abonnés confirmés') + '. Si l’article est programmé, le courriel part à l’heure de publication.' }));
    }

    const quillBox = h('div', { id: 'quill' });
    const imgBar = h('div', { class: 'img-bar', hidden: true, role: 'toolbar', 'aria-label': 'Taille de l’image' });
    const tableBar = h('div', { class: 'table-bar', hidden: true, role: 'toolbar', 'aria-label': 'Modifier le tableau' });
    const editorWrap = h('div', { class: 'editor-wrap' }, quillBox, imgBar);
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
          h('label', { text: 'Contenu' }), tableBar, editorWrap,
          h('p', { class: 'hint', text: 'Astuces : colle (Ctrl+V) ou glisse une image directement dans le texte. Clique sur une image pour changer sa taille. Pour une légende, écris-la sous l’image puis clique sur « Légende ».' })),
        h('div', { class: 'editor-side' },
          h('div', { class: 'box stack' },
            h('h2', { style: { margin: 0, fontSize: '17px' } }, 'Publication ', h('span', { class: 'pill ' + st.cls, text: st.label })),
            info,
            st.cls !== 'live' ? h('fieldset', { class: 'stack', style: { border: 0, padding: 0, margin: 0 } },
              h('legend', { text: 'Quand publier ?' }),
              h('label', { class: 'radio' }, rNow, 'Maintenant'),
              h('label', { class: 'radio' }, rLater, 'Programmer une date'),
              dateWrap) : null,
            sendBox,
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
      modules: {
        table: true,
        toolbar: {
          container: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: COLORS }],
            [{ align: [] }],
            [{ script: 'super' }, { script: 'sub' }],
            ['blockquote', 'link'],
            [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
            ['image', 'video', 'caption', 'divider', 'table'],
            ['clean']
          ],
          handlers: {
            image: () => pickInlineImage(quill),
            divider: () => { const r = quill.getSelection(true); quill.insertEmbed(r.index, 'divider', true, 'user'); quill.setSelection(r.index + 1, 0, 'user'); },
            caption: () => { const f = quill.getFormat(); quill.format('caption', f.caption ? false : 'image', 'user'); },
            table: () => { quill.getModule('table').insertTable(3, 3); }
          }
        },
        uploader: {
          mimetypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
          handler: async (range, files) => {
            let index = range.index;
            for (const f of files) {
              toast('Envoi de l’image…');
              const url = await uploadImage(f);
              if (url) { quill.insertEmbed(index, 'image', url, 'user'); index += 1; }
            }
            quill.setSelection(index, 0, 'user');
          }
        }
      }
    });
    // Libellés et infobulles en français pour la barre d'outils
    const tb = quill.getModule('toolbar').container;
    tb.querySelectorAll('button, .ql-picker').forEach(el => {
      const cls = [...el.classList].find(c => TOOL_TITLES[c]);
      if (!cls) return;
      let t = TOOL_TITLES[cls];
      if (cls === 'ql-script') t = el.value === 'sub' ? 'Indice' : 'Exposant';
      if (cls === 'ql-list') t = el.value === 'ordered' ? 'Liste numérotée' : 'Liste à puces';
      if (cls === 'ql-indent') t = el.value === '-1' ? 'Diminuer le retrait' : 'Augmenter le retrait';
      el.setAttribute('title', t);
      if (el.tagName === 'BUTTON') el.setAttribute('aria-label', t);
    });
    tb.querySelector('.ql-caption').textContent = 'Légende';
    tb.querySelector('.ql-divider').textContent = '―';
    tb.querySelector('.ql-table').textContent = 'Tableau';

    if (art.content) quill.clipboard.dangerouslyPasteHTML(cleanHTML(art.content));
    quill.on('text-change', () => { dirty = true; imgBar.hidden = true; });

    // --- Taille des images : clic sur une image ---
    let currentImg = null;
    const sizes = [['Petite', '35%'], ['Moyenne', '60%'], ['Pleine largeur', '100%']];
    imgBar.append(...sizes.map(([label, w]) => h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => {
      if (!currentImg) return;
      const blot = Quill.find(currentImg);
      if (!blot) return;
      quill.formatText(quill.getIndex(blot), 1, 'width', w === '100%' ? false : w, 'user');
      imgBar.hidden = true;
    } }, label)));
    quill.root.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        currentImg = e.target;
        imgBar.hidden = false;
        imgBar.style.top = (e.target.offsetTop + 8) + 'px';
      } else { imgBar.hidden = true; currentImg = null; }
    });

    // --- Tableau : actions quand le curseur est dans un tableau ---
    const tableModule = quill.getModule('table');
    const tActions = [
      ['+ Ligne', () => tableModule.insertRowBelow()], ['+ Colonne', () => tableModule.insertColumnRight()],
      ['− Ligne', () => tableModule.deleteRow()], ['− Colonne', () => tableModule.deleteColumn()],
      ['Supprimer le tableau', () => tableModule.deleteTable()]
    ];
    tableBar.append(h('span', { class: 'hint', text: 'Tableau :' }), ...tActions.map(([label, fn]) => h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { fn(); dirty = true; } }, label)));
    quill.on('editor-change', () => {
      const r = quill.getSelection();
      let inTable = false;
      if (r) { try { inTable = !!tableModule.getTable(r)[0]; } catch (e) { inTable = false; } }
      tableBar.hidden = !inTable;
    });

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
        content: quill.getText().trim() || /<(img|iframe|table|hr)/i.test(html) ? cleanHTML(html) : '',
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

      if (!art.newsletter_sent_at && st.cls !== 'live') p.send_newsletter = fSend.checked;
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
      if (mode !== 'draft' && st.cls !== 'live' && p.send_newsletter) {
        if (rLater.checked) toast('Le courriel aux abonnés partira à l’heure de publication.');
        else await sendNow(data.id);
      }
      refreshCounts();
      go('editeur', data.id);
    }
    btnPublish.addEventListener('click', () => save('publish'));
    btnDraft.addEventListener('click', () => save('draft'));
    if (!id) fTitle.focus();
  }

  async function sendNow(articleId) {
    const { data: s } = await db.auth.getSession();
    const r = await newsletter('send', { article_id: articleId }, s.session && s.session.access_token);
    if (r.error) toast('Courriel aux abonnés non envoyé : ' + r.error, true);
    else if (r.already) toast('Cet article avait déjà été envoyé.');
    else if (r.scheduled) toast('Le courriel partira à l’heure de publication.');
    else toast('Courriel envoyé à ' + plural(r.sent || 0, 'abonné', 'abonnés') + '.');
  }

  // ---------- Abonnés ----------
  async function showSubscribers() {
    panel.replaceChildren(h('h1', { text: 'Abonnés' }), h('p', { class: 'hint', text: 'Chargement…' }));
    const { data, error } = await db.from('subscribers').select('id,email,status,created_at,confirmed_at').order('created_at', { ascending: false });
    if (error) { panel.replaceChildren(h('h1', { text: 'Abonnés' }), h('p', { class: 'error', text: errMsg(error) })); return; }
    const rows = data || [];
    const n = (s) => rows.filter(r => r.status === s).length;
    const label = { confirmed: ['live', 'Confirmé'], pending: ['sched', 'En attente'], unsubscribed: ['draft', 'Désabonné'] };
    panel.replaceChildren(h('h1', { text: 'Abonnés' }),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { text: 'Confirmés (reçoivent les courriels)' }), h('b', { text: fmtNumber(n('confirmed')) })),
        h('div', { class: 'stat' }, h('span', { text: 'En attente de confirmation' }), h('b', { text: fmtNumber(n('pending')) })),
        h('div', { class: 'stat' }, h('span', { text: 'Désabonnés' }), h('b', { text: fmtNumber(n('unsubscribed')) }))),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { style: { minWidth: '560px' } },
        h('thead', {}, h('tr', {}, ['Courriel', 'Statut', 'Inscrit le', ''].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, rows.map(r => h('tr', {},
          h('td', { text: r.email }),
          h('td', {}, h('span', { class: 'pill ' + label[r.status][0], text: label[r.status][1] })),
          h('td', { class: 'meta', text: fmtDateTime(r.created_at) }),
          h('td', {}, confirmBtn('Retirer', async () => {
            const { error: e } = await db.from('subscribers').delete().eq('id', r.id);
            if (e) toast(errMsg(e), true); else { toast('Abonné retiré.'); showSubscribers(); }
          }))))))) : h('div', { class: 'notice', text: 'Aucun abonné pour l’instant. Le formulaire est sur l’accueil, sous chaque article et sur la page « S’abonner ».' }));
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
  async function showMessages() {
    panel.replaceChildren(h('h1', { text: 'Messages' }), h('p', { class: 'hint', text: 'Chargement…' }));
    const { data, error } = await db.from('messages').select('id,name,email,body,is_read,created_at').order('created_at', { ascending: false });
    if (error) { panel.append(h('div', { class: 'notice', text: errMsg(error) })); return; }
    const rows = data || [];
    const unread = rows.filter(r => !r.is_read).map(r => r.id);
    panel.replaceChildren(h('h1', { text: 'Messages' }),
      h('p', { class: 'hint', style: { marginBottom: '16px' }, text: 'Messages reçus par le formulaire « Écris-moi » de l’accueil. Tu reçois aussi une alerte dans Gmail pour chacun.' }),
      rows.length ? h('div', { class: 'stack' }, rows.map(r => h('div', { class: 'box', style: { borderColor: r.is_read ? '' : 'var(--accent)' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'baseline', marginBottom: '8px' } },
          h('b', { text: r.name }), h('span', { class: 'hint', text: r.email }),
          !r.is_read ? h('span', { class: 'pill live', text: 'Nouveau' }) : null,
          h('span', { class: 'hint', style: { marginLeft: 'auto' }, text: fmtDateTime(r.created_at) })),
        h('p', { style: { margin: '0 0 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--serif)', fontSize: '17px' }, text: r.body }),
        h('div', { class: 'actions' },
          h('a', { class: 'btn btn-sm', href: 'mailto:' + encodeURIComponent(r.email) + '?subject=' + encodeURIComponent('Re : ton message sur mon blog') }, 'Répondre'),
          confirmBtn('Supprimer', async () => {
            const { error: e } = await db.from('messages').delete().eq('id', r.id);
            if (e) toast(errMsg(e), true); else { toast('Message supprimé.'); showMessages(); refreshCounts(); }
          })))))
        : h('div', { class: 'notice', text: 'Aucun message pour l’instant.' }));
    if (unread.length) { await db.from('messages').update({ is_read: true }).in('id', unread); refreshCounts(); }
  }

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
    const m = location.hash.match(/^#(articles|editeur|commentaires|messages|abonnes|categories|mots)(?:=(\d+))?/);
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
