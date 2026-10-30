'use strict';
(function () {
  /* ---------- connexion à Supabase ---------- */
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  if (!window.supabase || !cfg.SUPABASE_URL) {
    $('summary').textContent = 'Impossible de charger l’application. Vérifie ta connexion et recharge la page.';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const CRENEAUX = {
    brunch: { label: 'Brunch', order: 0, start: [11, 0], end: [12, 30] },
    midi: { label: 'Midi', order: 1, start: [12, 30], end: [14, 0] },
    soir: { label: 'Soir', order: 2, start: [20, 0], end: [22, 0] }
  };
  const BASE_CUISINES = ['Italien', 'Japonais', 'Coréen', 'Libanais', 'Indien', 'Mexicain', 'Vietnamien', 'Thaï', 'Burger', 'Pizza', 'Bistrot', 'Brunch', 'Street food', 'Végétarien'];
  const PIN = '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';

  /* ---------- outils ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const todayKey = () => iso(new Date());
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDM = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      n.append(c.nodeType ? c : document.createTextNode(c));
    }
    return n;
  }
  function svg(path, size) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', size || 16); s.setAttribute('height', size || 16);
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = path;
    return s;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
  }
  function fail(e) {
    console.error(e);
    const code = e && e.code;
    if (code === '42501' || (e && /row-level security|permission denied/i.test(e.message || ''))) toast('Action refusée : tu n’as pas les droits pour cela.');
    else if (code === '23505') toast('Déjà présent dans ta liste.');
    else toast('Une erreur est survenue. Réessaie dans un instant.');
  }
  function emptyState(title, text, btn) {
    return el('div', { class: 'empty' }, el('strong', { text: title }), text ? el('p', { text }) : null, btn || null);
  }
  function armedButton(label, confirmLabel, onConfirm) {
    const b = el('button', { type: 'button', class: 'btn ghost danger', text: label });
    let armed = false, t;
    b.addEventListener('click', () => {
      if (!armed) {
        armed = true; b.textContent = confirmLabel; b.classList.add('armed');
        t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 3500);
      } else { clearTimeout(t); onConfirm(); }
    });
    return b;
  }
  function normLink(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch (e) { return ''; }
  }
  function sourceOf(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (h.includes('tiktok')) return 'TikTok';
      if (h.includes('instagram')) return 'Instagram';
      if (h.includes('youtube') || h === 'youtu.be') return 'YouTube';
      return h;
    } catch (e) { return ''; }
  }
  const addressLine = (r) => [r.adresse, r.ville].filter(Boolean).join(', ');
  const mapsUrl = (r) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([r.nom, r.adresse, r.ville].filter(Boolean).join(' '));
  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); toast('Adresse copiée'); }
    catch (e) { toast('Copie impossible : sélectionne l’adresse à la main.'); }
  }

  /* ---------- état ---------- */
  const S = {
    user: null, isAdmin: false, ready: false, loadError: false,
    catalogue: [], top: [], createurs: [], loves: new Set(),
    mine: [], sorties: [],
    tab: 'decouvrir', sub: 'restos', statut: 'atester', q: '', cuisine: '', cq: '', ccuisine: '',
    planView: 'semaine', weekOffset: 0, newsOffset: 0, idees: [], ideeSort: 'top', ideeFilter: '', realAdmin: false, preview: false
  };
  try {
    const t = localStorage.getItem('pr-tab'); if (t === 'plan' || t === 'liste' || t === 'decouvrir') S.tab = t;
    const p = localStorage.getItem('pr-pv'); if (p === 'semaine' || p === 'avenir') S.planView = p;
  } catch (e) { /* stockage indisponible */ }
  let welcomeOff = false;
  const welcomeSeen = () => { if (welcomeOff) return true; try { return localStorage.getItem('pr-welcome') === '1'; } catch (e) { return false; } };

  const myCreateur = () => (S.user ? S.createurs.find((c) => c.user_id === S.user.id) : null) || null;
  const byMine = (id) => S.mine.find((r) => r.id === id);
  const sortSorties = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (CRENEAUX[a.creneau]?.order ?? 9) - (CRENEAUX[b.creneau]?.order ?? 9));
  const upcoming = () => S.sorties.filter((s) => s.date >= todayKey()).sort(sortSorties);
  const nextSortie = (miId) => upcoming().find((s) => s.mon_resto_id === miId);
  const inMine = (c) => S.mine.some((r) => r.resto_id === c.id);

  /* ---------- chargement ---------- */
  async function loadPublic() {
    const [r, t, c] = await Promise.all([
      sb.from('restos').select('*').order('created_at', { ascending: false }),
      sb.rpc('top_semaine'),
      sb.from('createurs').select('*, createur_items(*)').order('created_at', { ascending: true })
    ]);
    if (r.error) throw r.error;
    S.catalogue = r.data || [];
    S.top = t.error ? [] : (t.data || []);
    S.createurs = c.error ? [] : (c.data || []);
  }
  async function loadPrivate() {
    if (!S.user) { S.mine = []; S.sorties = []; S.loves = new Set(); S.isAdmin = false; return; }
    const [m, s, l, a] = await Promise.all([
      sb.from('mes_restos').select('*').order('created_at', { ascending: false }),
      sb.from('sorties').select('*').order('date', { ascending: true }),
      sb.from('coups_de_coeur').select('resto_id'),
      sb.rpc('is_admin')
    ]);
    if (m.error) throw m.error;
    S.mine = m.data || [];
    S.sorties = s.error ? [] : (s.data || []);
    S.loves = new Set((l.data || []).map((x) => x.resto_id));
    S.realAdmin = a.data === true; S.isAdmin = S.realAdmin && !S.preview;
  }
  async function loadIdees() {
    const [r, au] = await Promise.all([sb.rpc('idees_liste'), sb.from('idees').select('id,auteur')]);
    const noms = new Map((au.data || []).map((x) => [x.id, x.auteur]));
    if (!r.error) S.idees = (r.data || []).map((x) => ({ ...x, votes: Number(x.votes), auteur: noms.get(x.id) || '' }));
  }
  async function refresh() {
    try { await Promise.all([loadPublic(), loadPrivate(), loadIdees()]); S.loadError = false; }
    catch (e) { console.error(e); S.loadError = true; }
    S.ready = true; render();
  }

  /* ---------- feuille (fenêtre) ---------- */
  function openSheet(title, body, focusSel) {
    $('sheetTitle').textContent = title;
    $('sheetBody').replaceChildren(body);
    $('ov').hidden = false;
    setTimeout(() => { const f = focusSel && $('sheetBody').querySelector(focusSel); if (f) f.focus(); }, 30);
  }
  function closeSheet() { $('ov').hidden = true; $('sheetBody').replaceChildren(); }

  const field = (label, input) => el('label', { class: 'field' }, el('span', { text: label }), input);
  const inp = (name, o = {}) => el('input', { name, type: o.type || 'text', placeholder: o.ph, inputmode: o.mode, autocomplete: o.ac || 'off', required: o.req, minlength: o.min, maxlength: o.max, value: o.value, list: o.list });
  const radios = (name, options, current) => el('div', { class: 'opts' }, options.map(([v, label]) =>
    el('label', { class: 'opt' }, el('input', { type: 'radio', name, value: String(v), checked: String(current) === String(v) }), el('span', { text: label }))));
  const radioVal = (form, name) => { const c = form.querySelector('input[name="' + name + '"]:checked'); return c ? c.value : ''; };

  /* ---------- connexion ---------- */
  function openAuth(mode, why) {
    let signup = mode === 'signup';
    const body = el('div', { class: 'stack' });
    function build() {
      const err = el('p', { class: 'err', role: 'alert' });
      const email = inp('email', { type: 'email', req: true, ac: 'email', ph: 'toi@exemple.fr' });
      const pass = inp('password', { type: 'password', req: true, min: 6, ac: signup ? 'new-password' : 'current-password', ph: '6 caractères minimum' });
      const submit = el('button', { type: 'submit', class: 'btn primary big', text: signup ? 'Créer mon compte' : 'Me connecter' });
      const form = el('form', {}, field('E-mail', email), field('Mot de passe', pass), err, submit);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); err.textContent = ''; submit.disabled = true;
        try {
          const creds = { email: email.value.trim(), password: pass.value };
          const res = signup ? await sb.auth.signUp({ ...creds, options: { emailRedirectTo: location.origin + location.pathname } }) : await sb.auth.signInWithPassword(creds);
          if (res.error) throw res.error;
          if (signup && !res.data.session) {
            body.replaceChildren(el('p', { class: 'meta', text: 'Compte créé. Un e-mail de confirmation vient de partir vers ' + creds.email + '. Clique sur le lien qu’il contient (pense à regarder les courriers indésirables), puis reviens te connecter.' }),
              el('button', { type: 'button', class: 'btn primary big', text: 'Compris', onclick: closeSheet }));
            return;
          }
          if (!signup) sb.rpc('log_connexion').then(() => {}, () => {});
          closeSheet(); toast(signup ? 'Compte créé, bienvenue !' : 'Connecté');
        } catch (x) {
          err.textContent = /invalid login/i.test(x.message || '') ? 'E-mail ou mot de passe incorrect.'
            : /already registered|already been registered/i.test(x.message || '') ? 'Cet e-mail a déjà un compte : connecte-toi.'
            : /not confirmed/i.test(x.message || '') ? 'Confirme d’abord ton e-mail : clique sur le lien reçu par courrier.'
            : /rate limit|too many/i.test(x.message || '') ? 'Trop d’essais. Réessaie dans quelques minutes.'
            : /password/i.test(x.message || '') ? 'Mot de passe trop court (6 caractères minimum).'
            : 'Connexion impossible. Réessaie dans un instant.';
          submit.disabled = false;
        }
      });
      const swap = el('button', { type: 'button', class: 'btn ghost', text: signup ? 'J’ai déjà un compte' : 'Créer un compte', onclick: () => { signup = !signup; $('sheetTitle').textContent = signup ? 'Créer un compte' : 'Connexion'; body.replaceChildren(...build()); } });
      const forgot = signup ? null : el('button', { type: 'button', class: 'btn ghost', text: 'Mot de passe oublié', onclick: async () => {
        const m = email.value.trim();
        if (!m) { err.textContent = 'Saisis ton e-mail ci-dessus, puis reclique.'; return; }
        const r = await sb.auth.resetPasswordForEmail(m, { redirectTo: location.origin + location.pathname });
        err.textContent = r.error ? 'Envoi impossible pour le moment. Réessaie dans quelques minutes.' : 'Si ce compte existe, un e-mail de réinitialisation vient de partir.';
      } });
      const google = el('button', { type: 'button', class: 'btn big', text: 'Continuer avec Google', onclick: async () => {
        const r = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
        if (r.error) err.textContent = 'Connexion Google indisponible pour le moment.';
      } });
      return [why ? el('p', { class: 'meta', text: why }) : null, google, el('p', { class: 'meta', text: 'ou avec ton e-mail' }), form, forgot, swap];
    }
    body.append(...build());
    openSheet(signup ? 'Créer un compte' : 'Connexion', body, 'input[name="email"]');
  }
  function needLogin(why) {
    if (S.user) return false;
    openAuth('login', why || 'Connecte-toi pour continuer.');
    return true;
  }

  function openNewPassword() {
    const err = el('p', { class: 'err', role: 'alert' });
    const pass = inp('password', { type: 'password', req: true, min: 6, ac: 'new-password', ph: '6 caractères minimum' });
    const form = el('form', {}, field('Nouveau mot de passe', pass), err, el('button', { type: 'submit', class: 'btn primary big', text: 'Enregistrer' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await sb.auth.updateUser({ password: pass.value });
      if (r.error) { err.textContent = 'Mot de passe refusé (6 caractères minimum).'; return; }
      closeSheet(); toast('Mot de passe changé');
    });
    openSheet('Nouveau mot de passe', form, 'input[name="password"]');
  }
  function openAccount() {
    const del = armedButton('Supprimer mon compte et mes données', 'Confirmer la suppression définitive ?', async () => {
      const r = await sb.rpc('supprimer_mon_compte');
      if (r.error) { toast('Suppression impossible'); return; }
      await sb.auth.signOut(); closeSheet(); toast('Compte supprimé');
    });
    openSheet('Mon compte', el('div', { class: 'stack' },
      el('p', { class: 'meta', text: S.user.email }),
      el('button', { type: 'button', class: 'btn', text: 'Changer mon mot de passe', onclick: openNewPassword }),
      S.realAdmin ? el('button', { type: 'button', class: 'btn', text: 'Passer en mode invité', onclick: () => { closeSheet(); setPreview(true); } }) : null,
      el('p', { class: 'meta', text: 'La suppression efface ta liste, tes sorties et tes coups de cœur. Tes idées, tes avis et tes votes restent, avec le pseudo que tu as choisi, pour aider la communauté. Elle est définitive.' }), del));
  }
  function openReport(c) {
    if (needLogin('Connecte-toi pour donner ton avis.')) return;
    const err = el('p', { class: 'err', role: 'alert' });
    const motif = el('textarea', { name: 'motif', rows: '3', maxlength: '500', required: true, placeholder: 'Ton avis sur ce resto, ou une correction : adresse fausse, resto fermé, demande de retrait…' });
    const pseudo = inp('pseudo', { req: true, min: 2, max: 30, value: savedPseudo(), ph: 'Ton pseudo' });
    const form = el('form', {}, el('p', { class: 'meta', text: c.nom }), field('Ton avis', motif), field('Pseudo', pseudo), el('p', { class: 'meta', text: PSEUDO_NOTE }), err, el('button', { type: 'submit', class: 'btn primary big', text: 'Envoyer mon avis' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      savePseudo(pseudo.value.trim());
      const r = await sb.from('signalements').insert({ resto_id: c.id, motif: motif.value.trim(), auteur: pseudo.value.trim() });
      if (r.error) { err.textContent = 'Envoi impossible (3 caractères minimum).'; return; }
      closeSheet(); toast('Avis envoyé, merci');
    });
    openSheet('Donner un avis', form, 'textarea');
  }

  /* ---------- idées d’amélioration ---------- */
  const PSEUDO_NOTE = 'Ce pseudo sera affiché avec ta contribution et conservé même si tu supprimes ton compte. N’utilise pas ton e-mail.';
  const savedPseudo = () => { try { return localStorage.getItem('pr-pseudo') || ''; } catch (e) { return ''; } };
  const savePseudo = (p) => { try { localStorage.setItem('pr-pseudo', p); } catch (e) { /* ignoré */ } };
  const IDEE_STATUTS = { proposee: 'Proposée', prevue: 'Prévue', encours: 'En cours', faite: 'Faite', refusee: 'Refusée' };
  async function toggleVote(i) {
    if (needLogin('Connecte-toi pour voter.')) return;
    const on = !i.mon_vote;
    i.mon_vote = on; i.votes += on ? 1 : -1; renderIdees();
    const r = on ? await sb.from('idees_votes').insert({ idee_id: i.id }) : await sb.from('idees_votes').delete().eq('idee_id', i.id).eq('user_id', S.user.id);
    if (r.error && !/duplicate/i.test(r.error.message || '')) { toast('Vote impossible'); await loadIdees(); renderIdees(); }
  }
  async function setIdeeStatut(i, statut) {
    const r = await sb.from('idees').update({ statut }).eq('id', i.id);
    if (r.error) { toast('Changement impossible'); return; }
    i.statut = statut; renderIdees(); toast('Statut : ' + IDEE_STATUTS[statut]);
  }
  async function removeIdee(i) {
    const r = await sb.from('idees').delete().eq('id', i.id);
    if (r.error) { toast('Suppression impossible'); return; }
    S.idees = S.idees.filter((x) => x.id !== i.id); renderIdees(); toast('Idée supprimée');
  }
  function ideeCard(i) {
    const sel = S.isAdmin ? el('select', { 'aria-label': 'Statut', onchange: (e) => setIdeeStatut(i, e.target.value) },
      Object.entries(IDEE_STATUTS).map(([v, l]) => el('option', { value: v, selected: v === i.statut, text: l }))) : null;
    return el('article', { class: 'card idee' },
      el('div', { class: 'card-top' }, el('h3', { class: 'card-name', text: i.titre }),
        el('button', { type: 'button', class: 'btn vote', 'aria-pressed': String(!!i.mon_vote), 'aria-label': 'J’aime cette idée', text: (i.mon_vote ? '♥ ' : '♡ ') + i.votes, onclick: () => toggleVote(i) })),
      i.detail ? el('p', { class: 'note', text: i.detail }) : null,
      el('div', { class: 'badges' },
        el('span', { class: 'badge' + (i.statut === 'proposee' ? ' ex' : ''), text: IDEE_STATUTS[i.statut] || i.statut }),
        el('span', { class: 'meta', text: 'par ' + (i.auteur || 'l’équipe') + ' · ' + new Date(i.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) }),
        i.mine ? el('span', { class: 'badge ex', text: 'Mon idée' }) : null),
      sel || (i.mine || S.isAdmin) ? el('div', { class: 'actions' }, sel, (i.mine || S.isAdmin) ? armedButton('Supprimer', 'Confirmer ?', () => removeIdee(i)) : null) : null);
  }
  function renderIdees() {
    $('is-top').setAttribute('aria-pressed', String(S.ideeSort === 'top')); $('is-new').setAttribute('aria-pressed', String(S.ideeSort === 'new'));
    const chips = $('ideeChips'); chips.replaceChildren();
    const opts = [['', 'Toutes'], ['proposee', 'Proposées'], ['prevue', 'Prévues'], ['encours', 'En cours'], ['faite', 'Faites']];
    opts.forEach(([v, l]) => chips.append(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.ideeFilter === v), text: l, onclick: () => { S.ideeFilter = v; renderIdees(); } })));
    let rows = S.idees.filter((i) => S.ideeFilter ? i.statut === S.ideeFilter : i.statut !== 'refusee' || S.isAdmin);
    rows.sort(S.ideeSort === 'top' ? (x, y) => y.votes - x.votes || new Date(y.created_at) - new Date(x.created_at) : (x, y) => new Date(y.created_at) - new Date(x.created_at));
    $('ideeOut').replaceChildren(...(rows.length ? rows.map(ideeCard) : [el('p', { class: 'meta', text: 'Aucune idée ici pour le moment. Propose la première !' })]));
  }
  function openIdeeForm() {
    if (needLogin('Connecte-toi pour proposer une idée.')) return;
    const err = el('p', { class: 'err', role: 'alert' });
    const titre = inp('titre', { req: true, min: 3, max: 80, ph: 'Ex. Voir les restos sur une carte' });
    const detail = el('textarea', { name: 'detail', rows: '3', maxlength: '500', placeholder: 'Explique en quelques mots (facultatif)' });
    const pseudo = inp('pseudo', { req: true, min: 2, max: 30, value: savedPseudo(), ph: 'Ton pseudo' });
    const form = el('form', {}, field('Ton idée', titre), field('Détails', detail), field('Pseudo affiché', pseudo), el('p', { class: 'meta', text: PSEUDO_NOTE }), err, el('button', { type: 'submit', class: 'btn primary big', text: 'Proposer' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      savePseudo(pseudo.value.trim());
      const r = await sb.from('idees').insert({ titre: titre.value.trim(), detail: detail.value.trim() || null, auteur: pseudo.value.trim() });
      if (r.error) { err.textContent = /limite_idees/.test(r.error.message || '') ? 'Tu as déjà proposé 3 idées aujourd’hui. Reviens demain !' : 'Envoi impossible (3 caractères minimum).'; return; }
      closeSheet(); toast('Idée envoyée, merci !'); await loadIdees(); renderIdees();
    });
    openSheet('Proposer une idée', form, 'input[name="titre"]');
  }

  /* ---------- nouveautés du jour (admin) ---------- */
  const ACTIONS = {
    inscription: 'Nouvelle inscription', suppression_compte: 'Compte supprimé',
    'insert:restos': 'Resto ajouté au catalogue', 'update:restos': 'Resto modifié', 'delete:restos': 'Resto supprimé du catalogue',
    'insert:createurs': 'Demande de créateur', 'update:createurs': 'Créateur modifié ou validé', 'delete:createurs': 'Créateur supprimé',
    'insert:admins': 'Admin ajouté', 'delete:admins': 'Admin retiré', 'insert:signalements': 'Avis reçu'
  };
  async function renderNews() {
    if (!S.isAdmin) return;
    const day = addDays(new Date(), S.newsOffset), start = new Date(day.getFullYear(), day.getMonth(), day.getDate()), end = addDays(start, 1);
    $('nw-label').textContent = (S.newsOffset === 0 ? 'Aujourd’hui · ' : S.newsOffset === -1 ? 'Hier · ' : '') + cap(fmtLong.format(start)) + ' ' + start.getFullYear();
    $('nw-next').disabled = S.newsOffset >= 0;
    const r = await sb.from('journal').select('at,email,action,cible,detail').gte('at', start.toISOString()).lt('at', end.toISOString()).order('at', { ascending: false }).limit(500);
    const rows = r.data || [], n = (k) => rows.filter((x) => x.action === k).length;
    $('newsStats').replaceChildren(...[['Inscriptions', n('inscription')], ['Connexions', n('connexion')], ['Restos ajoutés', n('insert:restos')], ['Avis', n('insert:signalements')]]
      .map(([k, v]) => el('div', { class: 'stat' }, el('strong', { text: String(v) }), el('span', { text: k }))));
    const list = rows.filter((x) => x.action !== 'connexion');
    $('newsOut').replaceChildren(...(r.error ? [el('p', { class: 'meta', text: 'Chargement impossible.' })]
      : list.length ? list.map((x) => el('article', { class: 'card' },
        el('p', { class: 'meta', text: new Date(x.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }),
        el('h3', { class: 'card-name', text: ACTIONS[x.action] || x.action }),
        (x.detail && x.detail.nom) || (x.action === 'inscription' ? x.email : '') ? el('p', { class: 'note', text: (x.detail && x.detail.nom) || x.email }) : null,
        x.email && x.action !== 'inscription' ? el('p', { class: 'meta', text: 'Par ' + x.email }) : null))
      : [el('p', { class: 'meta', text: 'Rien de nouveau ce jour-là.' })]));
  }

  /* ---------- admin ---------- */
  async function renderAdmin() {
    const st = $('adminStats'), sg = $('adminSig'), lg = $('adminLog');
    if (!S.isAdmin) return;
    const [s, g, j] = await Promise.all([
      sb.rpc('stats_admin'),
      sb.from('signalements').select('id,created_at,motif,resto_id,traite,auteur').eq('traite', false).order('created_at', { ascending: false }),
      sb.from('journal').select('at,email,action,cible,detail').order('at', { ascending: false }).limit(100)
    ]);
    const d = s.data || {};
    st.replaceChildren(...[['Utilisateurs', d.utilisateurs], ['Restos visibles', d.restos], ['Créateurs à valider', d.createurs_a_valider], ['Avis à traiter', d.signalements_ouverts]]
      .map(([k, v]) => el('div', { class: 'stat' }, el('strong', { text: String(v == null ? '–' : v) }), el('span', { text: k }))));
    const sigs = g.data || [];
    sg.replaceChildren(...(sigs.length ? sigs.map((x) => {
      const r = S.catalogue.find((c) => c.id === x.resto_id);
      return el('article', { class: 'card' }, el('h3', { class: 'card-name', text: r ? r.nom : 'Fiche supprimée' }), el('p', { class: 'note', text: x.motif }),
        el('p', { class: 'meta', text: 'par ' + (x.auteur || 'anonyme') + ' · ' + new Date(x.created_at).toLocaleString('fr-FR') }),
        el('button', { type: 'button', class: 'btn', text: 'Marquer traité', onclick: async () => { await sb.from('signalements').update({ traite: true }).eq('id', x.id); renderAdmin(); } }));
    }) : [el('p', { class: 'meta', text: 'Aucun avis.' })]));
    lg.replaceChildren(...((j.data || []).map((x) => el('p', { class: 'log-line' },
      el('span', { class: 'log-at', text: new Date(x.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }),
      ' ', el('b', { text: x.action }), ' ', (x.detail && x.detail.nom) || x.cible || '', ' ', el('span', { class: 'meta', text: x.email || '' })))));
  }

  /* ---------- briques d’affichage ---------- */
  function priceEl(r) {
    return r.budget ? el('span', { class: 'price', 'aria-label': 'Budget ' + r.budget + ' sur 3' },
      el('span', { text: '€'.repeat(r.budget) }), el('i', { text: '€'.repeat(3 - r.budget) })) : null;
  }
  function infosBlock(r) {
    const rows = [], main = [];
    if (Number(r.rating)) main.push('★ ' + String(r.rating).replace('.', ',') + (r.avis ? ' (' + r.avis + ' avis)' : ''));
    if (r.prix) main.push(r.prix);
    if (main.length) rows.push(el('p', { class: 'infos-main', text: main.join(' · ') }));
    if (r.horaires) rows.push(el('p', { class: 'meta', text: 'Horaires : ' + r.horaires }));
    if (r.plat) rows.push(el('p', { class: 'meta', text: 'À goûter : ' + r.plat }));
    if (r.resa) rows.push(el('p', { class: 'meta', text: 'Réservation : ' + r.resa }));
    return rows.length ? el('div', { class: 'infos' }, rows) : null;
  }
  function addressBlock(r, onMissing) {
    const line = addressLine(r);
    if (!line) {
      return onMissing
        ? el('div', { class: 'addr' }, svg(PIN), el('button', { type: 'button', class: 'link addr-missing', text: 'Ajouter l’adresse', onclick: onMissing }))
        : el('p', { class: 'addr-missing', text: 'Adresse à venir' });
    }
    return el('div', { class: 'addr' }, svg(PIN), el('div', { class: 'addr-text', text: line }));
  }
  function chipsFor(box, items, current, setCurrent, rerender) {
    box.replaceChildren();
    const cuisines = new Map();
    items.forEach((r) => { const c = (r.cuisine || '').trim(); if (c && !cuisines.has(plain(c))) cuisines.set(plain(c), c); });
    if (current && !cuisines.has(current)) { setCurrent(''); current = ''; }
    if (!cuisines.size) return current;
    box.append(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!current), text: 'Toutes', onclick: () => { setCurrent(''); rerender(); } }));
    [...cuisines].sort((a, b) => a[1].localeCompare(b[1], 'fr')).forEach(([k, label]) => {
      box.append(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(current === k), text: label, onclick: () => { setCurrent(current === k ? '' : k); rerender(); } }));
    });
    return current;
  }

  /* ---------- agenda ---------- */
  function gcalUrl(s, r) {
    const c = CRENEAUX[s.creneau] || CRENEAUX.soir, day = s.date.replace(/-/g, '');
    const at = (hm) => day + 'T' + pad(hm[0]) + pad(hm[1]) + '00';
    const p = new URLSearchParams({
      action: 'TEMPLATE', text: c.label + ' – ' + r.nom, dates: at(c.start) + '/' + at(c.end), ctz: 'Europe/Paris',
      location: [r.nom, r.adresse, r.ville].filter(Boolean).join(', '), details: [r.cuisine, r.note, r.lien].filter(Boolean).join('\n')
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function icsFor(s, r) {
    const c = CRENEAUX[s.creneau] || CRENEAUX.soir, d = s.date.replace(/-/g, '');
    const t = (hm) => d + 'T' + pad(hm[0]) + pad(hm[1]) + '00';
    const esc = (x) => String(x || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planning Restau//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + s.id + '@planning-restau', 'DTSTAMP:' + stamp, 'DTSTART:' + t(c.start), 'DTEND:' + t(c.end),
      'SUMMARY:' + esc(c.label + ' – ' + r.nom), 'LOCATION:' + esc([r.nom, r.adresse, r.ville].filter(Boolean).join(', ')),
      'DESCRIPTION:' + esc([r.cuisine, r.note, r.lien].filter(Boolean).join('\n')), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function downloadIcs(s, r) {
    const url = URL.createObjectURL(new Blob([icsFor(s, r)], { type: 'text/calendar;charset=utf-8' }));
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { window.location.href = url; return; }
    const a = el('a', { href: url, download: 'sortie-restau.ics' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Découvrir : restos ---------- */
  function catalogueCard(c) {
    const mine = inMine(c), loved = S.loves.has(c.id);
    const nb = (S.top.find((t) => t.resto_id === c.id) || {}).nb || 0;
    const meta = c.cuisine || '';
    const src = c.lien ? sourceOf(c.lien) : '';
    const tier = c.statut === 'partenaire' ? el('span', { class: 'badge', text: 'Partenaire' }) : el('span', { class: 'badge ex', text: 'Repéré sur les réseaux' });
    const miRow = mine ? S.mine.find((r) => r.resto_id === c.id) : null;
    return el('article', { class: 'card' + (c.masque ? ' done' : '') },
      el('div', { class: 'card-top' }, el('h3', { class: 'card-name', text: c.nom }), priceEl(c)),
      meta ? el('p', { class: 'meta', text: meta }) : null,
      addressBlock(c),
      infosBlock(c),
      c.note ? el('p', { class: 'note', text: c.note }) : null,
      el('div', { class: 'badges' }, tier,
        c.exemple ? el('span', { class: 'badge ex', text: 'Exemple' }) : null,
        c.masque ? el('span', { class: 'badge ex', text: 'Masqué' }) : null,
        c.lien ? el('a', { class: 'link', href: c.lien, target: '_blank', rel: 'noopener noreferrer', text: 'Voir la source' + (src ? ' ' + src : '') }) : null,
        (c.adresse || c.ville) ? el('a', { class: 'link', href: mapsUrl(c), target: '_blank', rel: 'noopener noreferrer', text: 'Itinéraire' }) : null),
      el('div', { class: 'actions' },
        mine ? el('span', { class: 'badge', text: 'Dans mes restos ✓' })
          : el('button', { type: 'button', class: 'btn primary', text: 'Ajouter à mes restos', onclick: () => addFromCatalogue(c) }),
        mine && miRow ? el('button', { type: 'button', class: 'btn', text: 'Planifier', onclick: () => openPlan({ miId: miRow.id }) }) : null,
        el('button', { type: 'button', class: 'btn vote', 'aria-pressed': String(loved), 'aria-label': 'J’aime', text: (loved ? '♥' : '♡') + (nb ? ' ' + nb : ''), onclick: () => toggleLove(c) }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Avis', onclick: () => openReport(c) }),
        S.isAdmin ? [
          el('button', { type: 'button', class: 'btn ghost', text: 'Modifier', onclick: () => openRestoForm('catalogue', c) }),
          el('button', { type: 'button', class: 'btn ghost', text: c.masque ? 'Afficher' : 'Masquer', onclick: () => toggleMasque(c) }),
          armedButton('Supprimer', 'Confirmer ?', () => removeCatalogue(c))
        ] : null));
  }
  function renderTop() {
    const box = $('topBox'); box.replaceChildren();
    const rows = S.top.map((t) => ({ r: S.catalogue.find((c) => c.id === t.resto_id), nb: t.nb })).filter((x) => x.r && !x.r.masque).slice(0, 5);
    if (!rows.length) return;
    box.append(el('div', { class: 'top-week' }, el('h3', { text: 'Coups de cœur de la semaine' }),
      rows.map((x, i) => el('div', { class: 'top-row-item' }, el('span', { text: (i + 1) + '. ' + x.r.nom }), el('span', { text: '♥ ' + x.nb })))));
  }
  function renderCatalogue() {
    const out = $('catOut'); out.replaceChildren();
    $('catFoot').hidden = !(S.isAdmin && S.catalogue.some((c) => c.exemple));
    renderTop();
    if (!S.ready) { $('cchips').replaceChildren(); out.append(emptyState('Chargement…', 'Je récupère le catalogue.')); return; }
    if (S.loadError) { $('cchips').replaceChildren(); out.append(emptyState('Catalogue indisponible', 'Vérifie ta connexion puis recharge la page.')); return; }
    const visible = S.catalogue.filter((c) => S.isAdmin || !c.masque);
    if (!visible.length) {
      $('cchips').replaceChildren();
      out.append(S.isAdmin
        ? emptyState('Le catalogue est vide', 'Ajoute un premier resto dont tu as l’accord, ou un resto repéré avec ses infos publiques.', el('button', { type: 'button', class: 'btn primary', text: 'Ajouter au catalogue', onclick: () => openRestoForm('catalogue') }))
        : emptyState('Le catalogue arrive bientôt', 'Les premiers restos sont en préparation. En attendant, ajoute le lien d’un resto repéré dans Mes restos.', el('button', { type: 'button', class: 'btn primary', text: 'Aller à Mes restos', onclick: () => setTab('liste') })));
      return;
    }
    S.ccuisine = chipsFor($('cchips'), visible, S.ccuisine, (v) => { S.ccuisine = v; }, renderCatalogue);
    const q = plain(S.cq.trim());
    const shown = visible
      .filter((c) => !S.ccuisine || plain(c.cuisine) === S.ccuisine)
      .filter((c) => !q || plain([c.nom, c.ville, c.cuisine, c.adresse].join(' ')).includes(q))
      .sort((a, b) => ((b.statut === 'partenaire') - (a.statut === 'partenaire')) || (a.created_at < b.created_at ? 1 : -1));
    if (!shown.length) { out.append(emptyState('Aucun résultat', 'Change la recherche ou le filtre de cuisine.')); return; }
    shown.forEach((c) => out.append(catalogueCard(c)));
  }
  async function addFromCatalogue(c) {
    if (needLogin('Connecte-toi pour enregistrer ce resto dans ta liste.')) return;
    const data = {
      resto_id: c.id, nom: c.nom, adresse: c.adresse, ville: c.ville, cuisine: c.cuisine, budget: c.budget, lien: c.lien, note: c.note,
      rating: c.rating, avis: c.avis, prix: c.prix, horaires: c.horaires, plat: c.plat, resa: c.resa, exemple: c.exemple
    };
    const { error } = await sb.from('mes_restos').insert(data);
    if (error) return fail(error);
    toast('Ajouté à tes restos'); await loadPrivate(); render();
  }
  async function toggleLove(c) {
    if (needLogin('Connecte-toi pour mettre un coup de cœur.')) return;
    const loved = S.loves.has(c.id);
    const { error } = loved ? await sb.from('coups_de_coeur').delete().eq('resto_id', c.id) : await sb.from('coups_de_coeur').insert({ resto_id: c.id });
    if (error) return fail(error);
    const t = await sb.rpc('top_semaine'); S.top = t.error ? S.top : (t.data || []);
    if (loved) S.loves.delete(c.id); else S.loves.add(c.id);
    render();
  }
  async function toggleMasque(c) {
    const { error } = await sb.from('restos').update({ masque: !c.masque }).eq('id', c.id);
    if (error) return fail(error);
    toast(c.masque ? 'Visible dans le catalogue' : 'Masqué du catalogue'); await loadPublic(); render();
  }
  async function removeCatalogue(c) {
    const { error } = await sb.from('restos').delete().eq('id', c.id);
    if (error) return fail(error);
    toast('Supprimé du catalogue'); await loadPublic(); render();
  }
  async function removeCatalogueExamples() {
    const { error } = await sb.from('restos').delete().eq('exemple', true);
    if (error) return fail(error);
    toast('Exemples supprimés du catalogue'); await loadPublic(); render();
  }

  /* ---------- Découvrir : créateurs ---------- */
  function itemCard(it, mine) {
    const src = it.lien ? sourceOf(it.lien) : '';
    const asResto = { nom: it.nom, adresse: it.adresse, ville: it.ville };
    return el('div', { class: 'item' },
      el('h4', { text: it.nom }),
      it.cuisine ? el('p', { class: 'meta', text: it.cuisine }) : null,
      addressLine(it) ? addressBlock(it) : null,
      it.commentaire ? el('p', { class: 'note', text: it.commentaire }) : null,
      el('div', { class: 'badges' },
        it.collab ? el('span', { class: 'badge plan', text: 'Collaboration commerciale' }) : null,
        it.lien ? el('a', { class: 'link', href: it.lien, target: '_blank', rel: 'noopener noreferrer', text: 'Voir le post' + (src ? ' ' + src : '') }) : null,
        (it.adresse || it.ville) ? el('a', { class: 'link', href: mapsUrl(asResto), target: '_blank', rel: 'noopener noreferrer', text: 'Itinéraire' }) : null),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn primary', text: 'Ajouter à mes restos', onclick: () => addFromItem(it) }),
        mine ? armedButton('Retirer', 'Confirmer ?', () => removeItem(it)) : null));
  }
  function creatorCard(c) {
    const own = S.user && c.user_id === S.user.id;
    const items = (c.createur_items || []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return el('article', { class: 'card' },
      el('div', { class: 'card-top' }, el('h3', { class: 'card-name', text: c.nom }),
        el('span', { class: c.verifie ? 'badge' : 'badge ex', text: c.verifie ? 'Vérifié' : 'En attente' })),
      (c.handle || c.plateforme) ? el('p', { class: 'meta', text: [c.handle, c.plateforme].filter(Boolean).join(' · ') }) : null,
      c.bio ? el('p', { class: 'creator-bio', text: c.bio }) : null,
      items.length ? el('div', { class: 'items' }, items.map((it) => itemCard(it, own || S.isAdmin)))
        : el('p', { class: 'meta', text: c.verifie ? 'Aucun resto dans cette liste pour l’instant.' : 'Cette liste sera visible après validation.' }),
      el('div', { class: 'actions' },
        own && c.verifie ? el('button', { type: 'button', class: 'btn primary', text: 'Ajouter un resto', onclick: () => openItemForm(c) }) : null,
        S.isAdmin && !c.verifie ? el('button', { type: 'button', class: 'btn primary', text: 'Valider', onclick: () => validateCreator(c, true) }) : null,
        S.isAdmin && c.verifie ? el('button', { type: 'button', class: 'btn ghost', text: 'Retirer la validation', onclick: () => validateCreator(c, false) }) : null,
        (own || S.isAdmin) ? armedButton(own ? 'Supprimer mon profil' : 'Supprimer', 'Confirmer ?', () => removeCreator(c)) : null));
  }
  function renderCreators() {
    const out = $('crOut'), bar = $('crBar'); out.replaceChildren(); bar.replaceChildren();
    if (!S.ready) { out.append(emptyState('Chargement…', 'Je récupère les créateurs.')); return; }
    if (S.loadError) { out.append(emptyState('Créateurs indisponibles', 'Vérifie ta connexion puis recharge la page.')); return; }
    const mine = myCreateur();
    if (!mine) {
      bar.append(el('div', { class: 'welcome' }, el('h2', { text: 'Tu es créateur de contenu ?' }),
        el('p', { text: 'Partage ta liste de restos avec la communauté. Ton profil est visible après validation.' }),
        el('button', { type: 'button', class: 'btn primary', text: 'Devenir créateur', onclick: () => { if (!needLogin('Connecte-toi pour demander un profil créateur.')) openCreatorForm(); } })));
    }
    const list = S.createurs.filter((c) => c.verifie || (S.user && c.user_id === S.user.id) || S.isAdmin)
      .sort((a, b) => (a.verifie === b.verifie ? 0 : a.verifie ? 1 : -1));
    if (!list.length) { out.append(emptyState('Pas encore de créateur', 'Les premières listes arrivent bientôt.')); return; }
    list.forEach((c) => out.append(creatorCard(c)));
  }
  async function addFromItem(it) {
    if (needLogin('Connecte-toi pour enregistrer ce resto dans ta liste.')) return;
    const { error } = await sb.from('mes_restos').insert({ nom: it.nom, adresse: it.adresse, ville: it.ville, cuisine: it.cuisine, budget: it.budget, lien: it.lien, note: it.commentaire });
    if (error) return fail(error);
    toast('Ajouté à tes restos'); await loadPrivate(); render();
  }
  async function removeItem(it) {
    const { error } = await sb.from('createur_items').delete().eq('id', it.id);
    if (error) return fail(error);
    toast('Resto retiré de la liste'); await loadPublic(); render();
  }
  async function validateCreator(c, v) {
    const { error } = await sb.rpc('valider_createur', { p_id: c.id, p_verifie: v });
    if (error) return fail(error);
    toast(v ? 'Créateur validé' : 'Validation retirée'); await loadPublic(); render();
  }
  async function removeCreator(c) {
    const { error } = await sb.from('createurs').delete().eq('id', c.id);
    if (error) return fail(error);
    toast('Profil supprimé'); await loadPublic(); render();
  }
  function openCreatorForm() {
    const err = el('p', { class: 'err', role: 'alert' });
    const plat = el('select', { name: 'plateforme' }, ['TikTok', 'Instagram', 'YouTube', 'Autre'].map((p) => el('option', { value: p, text: p })));
    const bio = el('textarea', { name: 'bio', maxlength: 400, placeholder: 'Ton univers en deux phrases' });
    const submit = el('button', { type: 'submit', class: 'btn primary big', text: 'Envoyer ma demande' });
    const form = el('form', {}, field('Nom affiché', inp('nom', { req: true, max: 80, ph: 'Ton nom de créateur' })),
      field('Pseudo', inp('handle', { max: 80, ph: '@tonpseudo' })), field('Plateforme principale', plat), field('Présentation', bio),
      el('p', { class: 'meta', text: 'Ton profil et ta liste seront visibles par tous après validation par l’administrateur. Tu pourras les retirer à tout moment.' }), err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); submit.disabled = true; err.textContent = '';
      const f = form.elements;
      const { error } = await sb.from('createurs').insert({ nom: f.nom.value.trim(), handle: f.handle.value.trim(), plateforme: plat.value, bio: bio.value.trim() });
      if (error) { err.textContent = error.code === '23505' ? 'Tu as déjà demandé un profil créateur.' : 'Envoi impossible. Réessaie dans un instant.'; submit.disabled = false; return; }
      closeSheet(); toast('Demande envoyée, en attente de validation'); await loadPublic(); render();
    });
    openSheet('Devenir créateur', form, 'input[name="nom"]');
  }
  function openItemForm(c) {
    const err = el('p', { class: 'err', role: 'alert' });
    const com = el('textarea', { name: 'commentaire', maxlength: 600, placeholder: 'Ton avis, le plat à commander…' });
    const collab = el('input', { type: 'checkbox', name: 'collab' });
    const submit = el('button', { type: 'submit', class: 'btn primary big', text: 'Publier' });
    const form = el('form', {}, field('Nom du resto', inp('nom', { req: true, max: 120 })), field('Adresse', inp('adresse')),
      el('div', { class: 'row2' }, field('Ville', inp('ville')), field('Cuisine', inp('cuisine', { list: 'cuisines' }))),
      el('fieldset', { class: 'field' }, el('legend', { text: 'Budget' }), radios('budget', [[1, '€'], [2, '€€'], [3, '€€€']], '')),
      field('Lien de ton post', inp('lien', { mode: 'url', ph: 'https://www.tiktok.com/…' })), field('Ton commentaire', com),
      el('label', { class: 'check' }, collab, 'Collaboration commerciale (partenariat rémunéré ou resto offert)'),
      err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); submit.disabled = true; err.textContent = '';
      const f = form.elements;
      const { error } = await sb.from('createur_items').insert({
        createur_id: c.id, nom: f.nom.value.trim(), adresse: f.adresse.value.trim(), ville: f.ville.value.trim(), cuisine: f.cuisine.value.trim(),
        budget: Number(radioVal(form, 'budget')) || 0, lien: normLink(f.lien.value), commentaire: com.value.trim(), collab: collab.checked
      });
      if (error) { err.textContent = 'Publication impossible. Réessaie dans un instant.'; submit.disabled = false; return; }
      closeSheet(); toast('Resto ajouté à ta liste'); await loadPublic(); render();
    });
    openSheet('Ajouter un resto à ma liste', form, 'input[name="nom"]');
  }

  /* ---------- Mes restos ---------- */
  function miCard(r) {
    const next = nextSortie(r.id);
    const meta = r.cuisine || '';
    const src = r.lien ? sourceOf(r.lien) : '';
    return el('article', { class: 'card' + (r.teste ? ' done' : '') },
      el('div', { class: 'card-top' }, el('h3', { class: 'card-name', text: r.nom }), priceEl(r)),
      meta ? el('p', { class: 'meta', text: meta }) : null,
      addressBlock(r, () => openRestoForm('perso', r)),
      infosBlock(r),
      r.note ? el('p', { class: 'note', text: r.note }) : null,
      el('div', { class: 'badges' },
        next ? el('span', { class: 'badge plan', text: 'Prévu ' + fmtShort.format(parseISO(next.date)) + ' · ' + CRENEAUX[next.creneau].label }) : null,
        r.exemple ? el('span', { class: 'badge ex', text: 'Exemple' }) : null,
        r.lien ? el('a', { class: 'link', href: r.lien, target: '_blank', rel: 'noopener noreferrer', text: 'Voir le post' + (src ? ' ' + src : '') }) : null,
        (r.adresse || r.ville) ? el('a', { class: 'link', href: mapsUrl(r), target: '_blank', rel: 'noopener noreferrer', text: 'Itinéraire' }) : null),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn primary', text: next ? 'Replanifier' : 'Planifier', onclick: () => openPlan({ miId: r.id }) }),
        el('button', { type: 'button', class: 'btn', text: r.teste ? 'Remettre à tester' : 'Testé ✓', onclick: () => toggleTeste(r) }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Modifier', onclick: () => openRestoForm('perso', r) }),
        armedButton('Supprimer', 'Confirmer ?', () => removeMine(r))));
  }
  function renderMine() {
    const out = $('listOut'); out.replaceChildren();
    $('exFoot').hidden = !S.mine.some((r) => r.exemple);
    $('chips').replaceChildren();
    if (!S.ready) { out.append(emptyState('Chargement…', 'Je récupère ta liste.')); return; }
    if (!S.user) { out.append(emptyState('Ta liste personnelle', 'Connecte-toi pour enregistrer tes restos et les retrouver sur tous tes appareils.', el('button', { type: 'button', class: 'btn primary', text: 'Se connecter', onclick: () => openAuth('login') }))); return; }
    if (S.loadError) { out.append(emptyState('Liste indisponible', 'Vérifie ta connexion puis recharge la page.')); return; }
    if (!S.mine.length) {
      out.append(emptyState('Ta liste est vide', 'Pioche dans Découvrir ou colle le lien d’un post TikTok ou Insta.',
        el('div', { class: 'actions' },
          el('button', { type: 'button', class: 'btn primary', text: 'Voir Découvrir', onclick: () => setTab('decouvrir') }),
          el('button', { type: 'button', class: 'btn', text: 'Ajouter un resto', onclick: () => openRestoForm('perso') }))));
      return;
    }
    const inStatut = S.mine.filter((r) => !!r.teste === (S.statut === 'teste'));
    S.cuisine = chipsFor($('chips'), inStatut, S.cuisine, (v) => { S.cuisine = v; }, renderMine);
    const q = plain(S.q.trim());
    const shown = inStatut.filter((r) => !S.cuisine || plain(r.cuisine) === S.cuisine)
      .filter((r) => !q || plain([r.nom, r.ville, r.cuisine, r.adresse].join(' ')).includes(q));
    if (!shown.length) {
      out.append(emptyState(inStatut.length ? 'Aucun résultat' : (S.statut === 'teste' ? 'Rien de testé pour l’instant' : 'Tout est testé'),
        inStatut.length ? 'Change la recherche ou le filtre de cuisine.' : (S.statut === 'teste' ? 'Quand tu as mangé quelque part, touche « Testé ✓ » sur sa carte.' : 'Ajoute de nouvelles adresses avec le bouton en bas.')));
      return;
    }
    shown.forEach((r) => out.append(miCard(r)));
  }
  async function toggleTeste(r) {
    const { error } = await sb.from('mes_restos').update({ teste: !r.teste }).eq('id', r.id);
    if (error) return fail(error);
    toast(r.teste ? 'Remis dans « À tester »' : 'Marqué comme testé'); await loadPrivate(); render();
  }
  async function removeMine(r) {
    const { error } = await sb.from('mes_restos').delete().eq('id', r.id);
    if (error) return fail(error);
    toast('Resto supprimé'); await loadPrivate(); render();
  }
  async function removeExamples() {
    const { error } = await sb.from('mes_restos').delete().eq('exemple', true);
    if (error) return fail(error);
    toast('Exemples supprimés'); await loadPrivate(); render();
  }

  /* ---------- formulaire resto (perso ou catalogue) ---------- */
  async function openRestoForm(kind, r) {
    const cat = kind === 'catalogue';
    if (!cat && needLogin('Connecte-toi pour enregistrer un resto.')) return;
    let accord = null;
    if (cat && r) { const a = await sb.from('restos_accords').select('*').eq('resto_id', r.id).maybeSingle(); accord = a.data || null; }
    const v = (k) => (r && r[k] != null && r[k] !== 0 ? String(r[k]) : '');
    const err = el('p', { class: 'err', role: 'alert' });
    const lienIn = inp('lien', { mode: 'url', ph: 'https://www.tiktok.com/…', value: v('lien') });
    const hint = el('span', { class: 'hint' });
    const upHint = () => { const l = normLink(lienIn.value); hint.textContent = l ? 'Source détectée : ' + (sourceOf(l) || 'lien') : ''; };
    lienIn.addEventListener('input', upHint);
    const note = el('textarea', { name: 'note', placeholder: 'Le plat à commander, l’ambiance, réserver à l’avance…' }); note.value = v('note');
    const dl = el('datalist', { id: 'cuisines' }, BASE_CUISINES.map((c) => el('option', { value: c })));
    const has = r && (r.rating || r.avis || r.prix || r.horaires || r.plat || r.resa);
    const more = el('details', { class: 'more', open: !!has }, el('summary', { text: 'Infos du resto (note, prix, horaires…)' }),
      el('div', { class: 'stack' },
        el('div', { class: 'row2' }, field('Note sur 5', inp('rating', { mode: 'decimal', ph: '4,5', value: r && Number(r.rating) ? String(r.rating).replace('.', ',') : '' })),
          field('Nombre d’avis', inp('avis', { mode: 'numeric', ph: '320', value: v('avis') }))),
        field('Prix', inp('prix', { ph: '25–35 € par personne', value: v('prix') })),
        field('Horaires', inp('horaires', { ph: 'Mar–dim, 12h–14h30 / 19h–22h30', value: v('horaires') })),
        field('Plat phare', inp('plat', { ph: 'Ce que tout le monde commande', value: v('plat') })),
        field('Réservation', inp('resa', { ph: 'Conseillée le week-end', value: v('resa') }))));
    const partner = cat && r ? r.statut === 'partenaire' : false;
    const catBlock = cat ? el('div', { class: 'stack' },
      el('fieldset', { class: 'field' }, el('legend', { text: 'Statut dans le catalogue' }), radios('statut', [['partenaire', 'Partenaire'], ['repere', 'Repéré']], partner ? 'partenaire' : 'repere')),
      field('Accord du restaurant obtenu le', inp('accord', { type: 'date', value: accord && accord.accord_le ? accord.accord_le : '' })),
      field('Contact ou preuve de l’accord', inp('contact', { ph: 'Nom, e-mail ou lien du message', value: accord ? accord.contact : '' })),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'masque', checked: !!(r && r.masque) }), 'Masquer du catalogue (retrait demandé)'),
      el('p', { class: 'meta', text: 'Un resto « Repéré » n’affiche que des faits publics (nom, adresse, horaires) et un lien vers la source, sans photo ni avis recopiés.' })) : null;
    const submit = el('button', { type: 'submit', class: 'btn primary big', text: r ? 'Enregistrer les changements' : 'Enregistrer' });
    const form = el('form', {}, field('Lien du post (TikTok, Insta…)', lienIn), hint,
      field('Nom du resto', inp('nom', { req: true, max: 120, ph: 'Ex. Chez Mamie Pasta', value: v('nom') })),
      field('Adresse', inp('adresse', { ph: 'Numéro et rue', value: v('adresse') })),
      el('div', { class: 'row2' }, field('Ville', inp('ville', { ph: 'Paris 11e', value: v('ville') })), field('Cuisine', inp('cuisine', { list: 'cuisines', ph: 'Italien', value: v('cuisine') }))),
      dl, el('fieldset', { class: 'field' }, el('legend', { text: 'Budget' }), radios('budget', [[1, '€'], [2, '€€'], [3, '€€€']], r ? r.budget : '')),
      field('Note', note), more, catBlock, err, submit);
    upHint();
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      const f = form.elements;
      const data = {
        nom: f.nom.value.trim(), adresse: f.adresse.value.trim(), ville: f.ville.value.trim(), cuisine: f.cuisine.value.trim(),
        budget: Number(radioVal(form, 'budget')) || 0, lien: normLink(f.lien.value), note: note.value.trim(),
        rating: Math.min(5, Math.max(0, parseFloat(String(f.rating.value).replace(',', '.')) || 0)), avis: Math.max(0, parseInt(f.avis.value, 10) || 0),
        prix: f.prix.value.trim(), horaires: f.horaires.value.trim(), plat: f.plat.value.trim(), resa: f.resa.value.trim()
      };
      try {
        if (cat) {
          data.statut = radioVal(form, 'statut') || 'repere'; data.masque = f.masque.checked;
          const q = r ? sb.from('restos').update(data).eq('id', r.id).select().single() : sb.from('restos').insert(data).select().single();
          const res = await q; if (res.error) throw res.error;
          const hasAccord = data.statut === 'partenaire' || f.accord.value || f.contact.value.trim();
          if (hasAccord) {
            const a = await sb.from('restos_accords').upsert({ resto_id: res.data.id, accord_le: f.accord.value || null, contact: f.contact.value.trim() });
            if (a.error) throw a.error;
          }
          await loadPublic();
        } else {
          const res = r ? await sb.from('mes_restos').update(data).eq('id', r.id) : await sb.from('mes_restos').insert(data);
          if (res.error) throw res.error;
          await loadPrivate();
        }
        closeSheet(); toast(cat ? 'Catalogue mis à jour' : 'Resto enregistré'); render();
      } catch (x) { console.error(x); err.textContent = 'Enregistrement impossible. Réessaie dans un instant.'; submit.disabled = false; }
    });
    openSheet(cat ? (r ? 'Modifier dans le catalogue' : 'Ajouter au catalogue') : (r ? 'Modifier le resto' : 'Ajouter un resto'), form, r ? 'input[name="nom"]' : 'input[name="lien"]');
  }

  /* ---------- Planning ---------- */
  function sortieCard(s) {
    const r = byMine(s.mon_resto_id), slot = CRENEAUX[s.creneau] || CRENEAUX.soir;
    if (!r) return el('article', { class: 'card sortie' }, el('span', { class: 'slot', text: slot.label }), el('div', { class: 'sortie-main' }, el('p', { class: 'meta', text: 'Ce resto n’existe plus.' }), armedButton('Retirer', 'Confirmer ?', () => removeSortie(s))));
    return el('article', { class: 'card sortie' },
      el('span', { class: 'slot', text: slot.label }),
      el('div', { class: 'sortie-main' },
        el('h3', { class: 'card-name', text: r.nom }),
        r.cuisine ? el('p', { class: 'meta', text: r.cuisine }) : null,
        addressBlock(r, () => openRestoForm('perso', r)),
        infosBlock(r),
        el('div', { class: 'sortie-actions' },
          el('a', { class: 'link', href: mapsUrl(r), target: '_blank', rel: 'noopener noreferrer', text: 'Itinéraire' }),
          addressLine(r) ? el('button', { type: 'button', class: 'btn ghost', text: 'Copier', onclick: () => copyText(addressLine(r)) }) : null),
        el('div', { class: 'sortie-actions' },
          el('button', { type: 'button', class: 'btn primary', text: 'Agenda iPhone', onclick: () => downloadIcs(s, r) }),
          el('a', { class: 'btn', href: gcalUrl(s, r), target: '_blank', rel: 'noopener noreferrer', text: 'Google Agenda' }),
          armedButton('Retirer', 'Confirmer ?', () => removeSortie(s)))));
  }
  function renderPlan() {
    const out = $('planOut'); out.replaceChildren();
    const week = S.planView === 'semaine';
    $('weekbar').hidden = !week;
    if (!S.ready) { out.append(emptyState('Chargement…', 'Je récupère ton planning.')); return; }
    if (!S.user) { out.append(emptyState('Ton planning', 'Connecte-toi pour planifier tes sorties.', el('button', { type: 'button', class: 'btn primary', text: 'Se connecter', onclick: () => openAuth('login') }))); return; }
    if (week) {
      const start = addDays(mondayOf(new Date()), S.weekOffset * 7), end = addDays(start, 6);
      $('wk-label').textContent = fmtDM.format(start) + ' – ' + fmtDM.format(end);
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i), key = iso(day);
        const items = S.sorties.filter((s) => s.date === key).sort(sortSorties);
        out.append(el('section', { class: 'day' + (key < todayKey() ? ' past' : '') },
          el('div', { class: 'day-head' },
            el('h3', {}, cap(fmtShort.format(day)), key === todayKey() ? el('span', { class: 'badge', text: 'Aujourd’hui' }) : null),
            el('button', { type: 'button', class: 'day-add', 'aria-label': 'Planifier le ' + fmtLong.format(day), text: '+ Planifier', onclick: () => openPlan({ date: key }) })),
          items.length ? items.map(sortieCard) : el('p', { class: 'day-empty', text: 'Rien de prévu' })));
      }
      return;
    }
    const list = upcoming();
    if (!list.length) { out.append(emptyState('Aucune sortie à venir', 'Planifie un resto depuis sa carte, ou touche « + Planifier » dans la vue Semaine.', el('button', { type: 'button', class: 'btn primary', text: 'Planifier une sortie', onclick: () => openPlan({}) }))); return; }
    const groups = new Map();
    list.forEach((s) => { if (!groups.has(s.date)) groups.set(s.date, []); groups.get(s.date).push(s); });
    const tk = todayKey(), tm = iso(addDays(new Date(), 1));
    groups.forEach((items, key) => {
      out.append(el('section', { class: 'day' }, el('div', { class: 'day-head' }, el('h3', { text: key === tk ? 'Aujourd’hui' : key === tm ? 'Demain' : cap(fmtLong.format(parseISO(key))) })), items.map(sortieCard)));
    });
  }
  async function removeSortie(s) {
    const { error } = await sb.from('sorties').delete().eq('id', s.id);
    if (error) return fail(error);
    toast('Retiré du planning'); await loadPrivate(); render();
  }
  function openPlan(opts) {
    opts = opts || {};
    if (needLogin('Connecte-toi pour planifier une sortie.')) return;
    if (!S.mine.length) { toast('Ajoute d’abord un resto à ta liste.'); openRestoForm('perso'); return; }
    const err = el('p', { class: 'err', role: 'alert' });
    const sorted = S.mine.slice().sort((a, b) => (!!a.teste - !!b.teste) || a.nom.localeCompare(b.nom, 'fr'));
    const sel = el('select', { name: 'resto' }, sorted.map((r) => el('option', { value: r.id, text: r.nom + (r.teste ? ' (testé)' : '') })));
    if (opts.miId) sel.value = opts.miId;
    const date = inp('date', { type: 'date', req: true, value: opts.date || todayKey() });
    const submit = el('button', { type: 'submit', class: 'btn primary big', text: 'Ajouter au planning' });
    const form = el('form', {}, field('Resto', sel), field('Date', date),
      el('fieldset', { class: 'field' }, el('legend', { text: 'Moment' }), radios('creneau', [['brunch', 'Brunch'], ['midi', 'Midi'], ['soir', 'Soir']], 'soir')), err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      const { error } = await sb.from('sorties').insert({ mon_resto_id: sel.value, date: date.value, creneau: radioVal(form, 'creneau') || 'soir' });
      if (error) { err.textContent = 'Enregistrement impossible. Réessaie dans un instant.'; submit.disabled = false; return; }
      S.tab = 'plan'; S.planView = 'semaine';
      S.weekOffset = Math.round((mondayOf(parseISO(date.value)) - mondayOf(new Date())) / (7 * 864e5));
      try { localStorage.setItem('pr-tab', 'plan'); localStorage.setItem('pr-pv', 'semaine'); } catch (x) { /* ignoré */ }
      closeSheet(); toast('Ajouté au planning'); await loadPrivate(); render();
    });
    openSheet('Planifier une sortie', form, 'input[name="date"]');
  }

  /* ---------- rendu général ---------- */
  function renderUser() {
    const box = $('userBox'); box.replaceChildren();
    if (S.user) {
      box.append(el('button', { type: 'button', class: 'btn ghost who', text: S.isAdmin ? 'Admin' : (S.user.email || '').split('@')[0], onclick: openAccount }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Quitter', onclick: async () => { await sb.auth.signOut(); toast('Déconnecté'); } }));
    } else if (S.ready) {
      box.append(el('button', { type: 'button', class: 'btn ghost', text: 'Connexion', onclick: () => openAuth('login') }),
        el('button', { type: 'button', class: 'btn primary', text: 'S’inscrire', onclick: () => openAuth('signup') }));
    }
  }
  function renderChrome() {
    const nAT = S.mine.filter((r) => !r.teste).length, nT = S.mine.filter((r) => r.teste).length, nUp = upcoming().length;
    $('seg-atester').textContent = 'À tester (' + nAT + ')'; $('seg-teste').textContent = 'Testés (' + nT + ')';
    $('seg-atester').setAttribute('aria-pressed', String(S.statut === 'atester')); $('seg-teste').setAttribute('aria-pressed', String(S.statut === 'teste'));
    $('pv-semaine').setAttribute('aria-pressed', String(S.planView === 'semaine')); $('pv-avenir').setAttribute('aria-pressed', String(S.planView === 'avenir'));
    $('sub-restos').setAttribute('aria-pressed', String(S.sub === 'restos')); $('sub-createurs').setAttribute('aria-pressed', String(S.sub === 'createurs'));
    $('previewBar').hidden = !(S.realAdmin && S.preview);
    $('tab-admin').hidden = !S.isAdmin; $('tab-news').hidden = !S.isAdmin; if (!S.isAdmin && (S.tab === 'admin' || S.tab === 'news')) S.tab = 'decouvrir';
    ['decouvrir', 'liste', 'plan', 'idees', 'news', 'admin'].forEach((t) => { $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
    $('view-decouvrir').hidden = S.tab !== 'decouvrir'; $('view-liste').hidden = S.tab !== 'liste'; $('view-plan').hidden = S.tab !== 'plan'; $('view-admin').hidden = S.tab !== 'admin'; $('view-news').hidden = S.tab !== 'news'; $('view-idees').hidden = S.tab !== 'idees';
    $('d-restos').hidden = S.sub !== 'restos'; $('d-createurs').hidden = S.sub !== 'createurs';
    $('welcomeSignup').hidden = !!S.user;
    $('welcome').hidden = !(S.ready && !S.loadError && !welcomeSeen() && (!S.user || !S.mine.length));
    const cr = myCreateur();
    const fabMode = (S.tab === 'admin' || S.tab === 'news') ? '' : S.tab === 'idees' ? 'idee' : S.tab === 'plan' ? 'plan' : S.tab === 'liste' ? 'liste' : (S.sub === 'restos' ? (S.isAdmin ? 'cat' : '') : (cr && cr.verifie ? 'item' : ''));
    $('fab').hidden = !fabMode; $('fab').dataset.mode = fabMode;
    $('fabLabel').textContent = { idee: 'Proposer une idée', plan: 'Planifier', liste: 'Ajouter un resto', cat: 'Ajouter au catalogue', item: 'Ajouter à ma liste' }[fabMode] || '';
    $('summary').textContent = !S.ready ? 'Chargement…' : S.loadError ? 'Connexion impossible pour le moment'
      : S.user ? nAT + ' à tester · ' + nUp + (nUp > 1 ? ' sorties' : ' sortie') + ' à venir'
      : S.catalogue.filter((c) => !c.masque).length + ' restos à découvrir';
  }
  function render() {
    renderUser(); renderChrome();
    if (S.tab === 'decouvrir') { if (S.sub === 'restos') renderCatalogue(); else renderCreators(); }
    else if (S.tab === 'liste') renderMine(); else if (S.tab === 'admin') renderAdmin(); else if (S.tab === 'news') renderNews(); else if (S.tab === 'idees') renderIdees(); else renderPlan();
  }
  function setTab(t) { S.tab = t; try { localStorage.setItem('pr-tab', t); } catch (e) { /* ignoré */ } render(); window.scrollTo(0, 0); }

  /* ---------- branchements ---------- */
  $('tab-decouvrir').addEventListener('click', () => setTab('decouvrir'));
  $('tab-liste').addEventListener('click', () => setTab('liste'));
  $('tab-plan').addEventListener('click', () => setTab('plan'));
  function setPreview(on) { S.preview = on; S.isAdmin = S.realAdmin && !on; S.tab = on ? 'decouvrir' : 'admin'; render(); window.scrollTo(0, 0); toast(on ? 'Mode invité' : 'Mode admin'); }
  $('guestBtn').addEventListener('click', () => setPreview(true));
  $('previewOff').addEventListener('click', () => setPreview(false));
  $('tab-admin').addEventListener('click', () => setTab('admin'));
  $('tab-news').addEventListener('click', () => setTab('news'));
  $('tab-idees').addEventListener('click', () => setTab('idees'));
  $('seg-idees').addEventListener('click', (e) => { const b = e.target.closest('button[data-isort]'); if (b) { S.ideeSort = b.dataset.isort; renderIdees(); } });
  $('nw-prev').addEventListener('click', () => { S.newsOffset -= 1; render(); });
  $('nw-next').addEventListener('click', () => { if (S.newsOffset < 0) { S.newsOffset += 1; render(); } });
  $('seg-sub').addEventListener('click', (e) => { const b = e.target.closest('button[data-sub]'); if (b) { S.sub = b.dataset.sub; render(); } });
  $('seg-statut').addEventListener('click', (e) => { const b = e.target.closest('button[data-statut]'); if (b) { S.statut = b.dataset.statut; S.cuisine = ''; render(); } });
  $('seg-plan').addEventListener('click', (e) => { const b = e.target.closest('button[data-pv]'); if (!b) return; S.planView = b.dataset.pv; try { localStorage.setItem('pr-pv', S.planView); } catch (x) { /* ignoré */ } render(); });
  $('wk-prev').addEventListener('click', () => { S.weekOffset -= 1; render(); });
  $('wk-next').addEventListener('click', () => { S.weekOffset += 1; render(); });
  $('q').addEventListener('input', (e) => { S.q = e.target.value; renderMine(); });
  $('cq').addEventListener('input', (e) => { S.cq = e.target.value; renderCatalogue(); });
  $('exRemove').addEventListener('click', removeExamples);
  $('catExRemove').addEventListener('click', removeCatalogueExamples);
  $('welcomeSignup').addEventListener('click', () => openAuth('signup'));
  $('welcomeOk').addEventListener('click', () => { welcomeOff = true; try { localStorage.setItem('pr-welcome', '1'); } catch (e) { /* ignoré */ } $('welcome').hidden = true; });
  $('fab').addEventListener('click', () => {
    const m = $('fab').dataset.mode;
    if (m === 'plan') openPlan({}); else if (m === 'liste') openRestoForm('perso'); else if (m === 'cat') openRestoForm('catalogue');
    else if (m === 'idee') openIdeeForm(); else if (m === 'item') { const c = myCreateur(); if (c) openItemForm(c); }
  });
  $('sheetClose').addEventListener('click', closeSheet);
  $('ov').addEventListener('click', (e) => { if (e.target === $('ov')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('ov').hidden) closeSheet(); });

  /* ---------- démarrage ---------- */
  render();
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'PASSWORD_RECOVERY') { setTimeout(openNewPassword, 0); return; }
    if (evt === 'INITIAL_SESSION' || evt === 'TOKEN_REFRESHED') return;
    const next = session ? session.user : null;
    if ((next && S.user && next.id === S.user.id) || (!next && !S.user)) return;
    S.user = next;
    setTimeout(refresh, 0);
  });
  sb.auth.getSession().then(({ data }) => {
    S.user = data && data.session ? data.session.user : null;
    refresh();
  }).catch(() => { S.ready = true; S.loadError = true; render(); });
})();
