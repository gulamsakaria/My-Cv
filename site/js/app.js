/* Gulam Sakaria – evidence portfolio
   Renders the whole page from content/site.json. No dependencies, no build step.
   - Nothing is shown for content that is missing.
   - Add ?dev=1 to the address to see "Add photo" boxes and a list of problems.
   - Safeguarding gate: an image about people is only shown when it declares
     people_under_18 (true/false), and faces_blurred: true if minors are visible.
     Documents are only shown when redacted: true.
*/
(() => {
  'use strict';

  const DEV = new URLSearchParams(location.search).get('dev') === '1';
  const MOTION = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HAS_IO = 'IntersectionObserver' in window;
  document.documentElement.classList.add('js');

  const $ = (s, r = document) => r.querySelector(s);
  const problems = [];

  /* ---------- tiny helpers ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid);
    }
    return el;
  }
  const add = (parent, ...kids) => { kids.flat(Infinity).forEach((k) => { if (k != null && k !== false) parent.append(k); }); return parent; };
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const bn = (text, tag = 'p', cls = '') => (str(text) ? h(tag, { class: ('bn ' + cls).trim(), lang: 'bn', text }) : null);

  function safeUrl(u) {
    if (!str(u)) return '';
    try {
      const url = new URL(u, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) { return ''; }
  }
  const isPdf = (p) => /\.pdf(\?|#|$)/i.test(p || '');

  function warn(msg) {
    if (!problems.includes(msg)) problems.push(msg);
    renderDevPanel();
  }

  function slot(label, hint) {
    return h('div', { class: 'dev-slot' }, h('span', null, label, hint ? h('small', { text: hint }) : null));
  }

  /* ---------- safeguarding gates ---------- */
  // Returns true if an image object may be published.
  function imageOk(img, where) {
    if (!img || !str(img.src)) return false;
    if (typeof img.people_under_18 !== 'boolean') {
      warn(`${where}: hidden – "people_under_18" must be true or false (${img.src})`);
      return false;
    }
    if (img.people_under_18 && img.faces_blurred !== true) {
      warn(`${where}: hidden – shows people under 18 but "faces_blurred" is not true (${img.src})`);
      return false;
    }
    if (!str(img.alt) && !str(img.caption)) {
      warn(`${where}: hidden – needs "alt" text (${img.src})`);
      return false;
    }
    return true;
  }
  const altOf = (it) => str(it.alt) || str(it.caption);

  function makeImg(it, cls, where) {
    const im = h('img', { class: cls, src: it.thumb || it.src, alt: altOf(it) || '', loading: 'lazy', decoding: 'async' });
    im.addEventListener('error', () => {
      warn(`${where}: file not found – ${im.getAttribute('src')}`);
      const host = im.closest('[data-item]');
      if (host && !DEV) host.hidden = true;
      else if (host) im.replaceWith(slot('Missing file', im.getAttribute('src')));
    });
    return im;
  }

  /* ---------- reveal + counters ---------- */
  let revealIO = null;
  function countUp(el) {
    const to = Number(el.dataset.to);
    const t0 = performance.now(), dur = 1300;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function reveal(el, delay) {
    if (delay) el.style.setProperty('--d', delay + 'ms');
    el.classList.add('reveal');
    if (!MOTION || !HAS_IO) { el.classList.add('in'); return el; }
    el.querySelectorAll('.count').forEach((c) => { c.textContent = '0'; });
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          e.target.querySelectorAll('.count').forEach(countUp);
          revealIO.unobserve(e.target);
        }
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    }
    revealIO.observe(el);
    return el;
  }

  /* ---------- lightbox ---------- */
  const LB = (() => {
    const dlg = $('#lightbox');
    const media = $('#lb-media');
    const cap = $('#lb-caption'), capBn = $('#lb-caption-bn'), count = $('#lb-count');
    let list = [], idx = 0, opener = null;

    function show() {
      const it = list[idx];
      media.replaceChildren();
      if (it.type === 'video') {
        const v = h('video', { controls: true, playsinline: true, preload: 'metadata', poster: it.poster || null, src: it.src, 'aria-label': it.alt || it.caption || 'Video' });
        media.append(v);
      } else {
        media.append(h('img', { src: it.src, alt: it.alt || it.caption || '' }));
        const nxt = list[(idx + 1) % list.length];
        if (nxt && nxt.type !== 'video') new Image().src = nxt.src;
      }
      cap.textContent = it.caption || '';
      capBn.textContent = it.caption_bn || '';
      capBn.hidden = !it.caption_bn;
      count.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
      dlg.toggleAttribute('data-single', list.length < 2);
    }
    function go(d) { if (list.length < 2) return; idx = (idx + d + list.length) % list.length; show(); }
    function open(items, i, from) {
      list = items; idx = i; opener = from || document.activeElement;
      show();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      document.documentElement.classList.add('lb-open');
      $('.lb-close', dlg).focus();
    }
    function close() { if (dlg.open) dlg.close(); }
    dlg.addEventListener('close', () => {
      media.replaceChildren();
      document.documentElement.classList.remove('lb-open');
      if (opener && document.contains(opener)) opener.focus();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.classList.contains('lb-inner') || e.target === media) close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    $('.lb-close', dlg).addEventListener('click', close);
    $('.lb-prev', dlg).addEventListener('click', () => go(-1));
    $('.lb-next', dlg).addEventListener('click', () => go(1));
    let sx = null;
    dlg.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    return { open };
  })();

  /* ---------- section helpers ---------- */
  function showSection(id, on) {
    const sec = document.getElementById(id);
    if (sec) sec.hidden = !on;
    if (!on) {
      const link = document.querySelector(`.nav a[href="#${id}"]`);
      if (link) link.closest('li').remove();
    }
  }

  /* ---------- 1. hero ---------- */
  function renderHero(d) {
    const p = d.profile || {};
    const name = str(p.name) || 'Gulam Sakaria';
    const nameEl = $('#name');
    const parts = name.split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    nameEl.replaceChildren(h('span', { class: 'first', text: parts.join(' ') }), last ? h('span', { class: 'last', text: last }) : null);
    nameEl.setAttribute('aria-label', name);

    $('#hero-eyebrow').textContent = str(p.eyebrow);
    $('#hero-eyebrow').hidden = !str(p.eyebrow);
    $('#hero-tagline').textContent = str(p.tagline);
    const tbn = $('#hero-tagline-bn');
    tbn.textContent = str(p.tagline_bn); tbn.hidden = !str(p.tagline_bn);

    const roles = $('#hero-roles'); roles.replaceChildren();
    (p.roles || []).forEach((r) => {
      if (!str(r.title)) return;
      roles.append(h('li', { class: 'chip' },
        h('strong', { text: r.title }),
        str(r.org) ? h('span', { text: r.org }) : null,
        str(r.since) ? h('em', { text: `Since ${r.since}` }) : null));
    });
    roles.hidden = !roles.children.length;

    const theme = $('#hero-theme');
    theme.replaceChildren();
    if (str(p.theme)) theme.append(h('span', { class: 'badge' }, h('small', { text: str(p.theme_label) || 'Theme' }), p.theme));
    theme.hidden = !str(p.theme);

    const box = $('#hero-portrait'); box.replaceChildren();
    const grid = $('.hero-grid');
    if (p.portrait && imageOk({ people_under_18: false, ...p.portrait }, 'Portrait')) {
      const pt = { ...p.portrait, alt: str(p.portrait.alt) || `Portrait of ${name}` };
      const im = h('img', { class: 'portrait', src: pt.src, alt: pt.alt, width: 680, height: 850, fetchpriority: 'high', decoding: 'async' });
      im.addEventListener('error', () => { warn(`Portrait: file not found – ${pt.src}`); box.replaceChildren(DEV ? slot('Portrait file missing', pt.src) : ''); });
      box.append(im);
      grid.classList.add('has-portrait');
    } else if (DEV) {
      box.append(slot('Add portrait', 'profile.portrait in content/site.json'));
      grid.classList.add('has-portrait');
    } else {
      box.hidden = true;
    }
  }

  /* ---------- 2. stats ---------- */
  function numNode(value, prefix, suffix) {
    return h('div', { class: 'num' },
      h('span', { class: 'sr-only', text: `${prefix || ''}${fmt(value)}${suffix || ''}` }),
      h('span', { 'aria-hidden': 'true' },
        prefix ? h('span', { class: 'pre', text: prefix }) : null,
        h('span', { class: 'count', 'data-to': value, text: fmt(value) }),
        suffix ? h('span', { class: 'suf', text: suffix }) : null));
  }
  function renderStats(d) {
    const s = d.stats || {};
    const items = (s.items || []).filter((x) => isNum(x.value) || (x.multi && x.multi.length));
    const grid = $('#stats'); grid.replaceChildren();
    items.forEach((it, i) => {
      const card = h('article', { class: `stat stat--${['l', 'm', 'xl'].includes(it.size) ? it.size : 'm'}` });
      if (str(it.qualifier)) card.append(h('p', { class: 'stat-q', text: it.qualifier }));
      if (it.multi && it.multi.length) {
        card.append(h('div', { class: 'multi' }, it.multi.filter((m) => isNum(m.value)).map((m) =>
          h('div', null, numNode(m.value, m.prefix, m.suffix), h('p', { class: 'stat-label', text: m.label || '' })))));
        if (str(it.label)) card.append(h('p', { class: 'stat-detail', text: it.label }));
      } else {
        card.append(numNode(it.value, it.prefix, it.suffix));
        card.append(h('p', { class: 'stat-label', text: str(it.label) }));
        if (str(it.detail)) card.append(h('p', { class: 'stat-detail', text: it.detail }));
      }
      const parts = (it.breakdown || []).filter((b) => isNum(b.value) && b.value > 0);
      if (parts.length) {
        card.append(
          h('div', { class: 'seg', role: 'img', 'aria-label': parts.map((b) => `${b.label}: ${fmt(b.value)}`).join('; ') },
            parts.map((b) => h('span', { style: `flex:${b.value}` }))),
          h('ul', { class: 'legend' }, parts.map((b) => h('li', null, h('i'), b.label, h('b', { text: fmt(b.value) })))));
      }
      grid.append(reveal(card, (i % 3) * 80));
    });
    const note = $('#stats-note');
    note.replaceChildren();
    if (str(s.footnote)) {
      const f = str(s.footnote);
      const hasEvidence = !$('#evidence').hidden;
      const m = f.match(/^(.*?)(Sources are linked[^.]*\.?)(.*)$/i);
      if (m && hasEvidence) note.append(m[1], h('a', { href: '#evidence', text: m[2] }), m[3]);
      else note.textContent = f;
    }
    showSection('impact', items.length > 0);
  }

  /* ---------- 3. cartoons ---------- */
  function renderCartoons(d) {
    const c = d.cartoons;
    if (!c) return showSection('cartoons', false);
    const items = Array.isArray(c.items) ? c.items : [];
    $('#cartoons-h').textContent = str(c.heading) || 'Awareness cartoons';
    const intro = $('#cartoons-intro'); intro.replaceChildren();
    if (str(c.intro)) add(intro, h('p', { text: c.intro }), bn(c.intro_bn));
    const page = safeUrl(c.page_url);
    if (page) intro.append(h('p', null, h('a', { class: 'ext', href: page, target: '_blank', rel: 'noopener noreferrer', text: `${str(c.page_label) || 'Open the page'} ↗` })));

    const grid = $('#cartoon-grid'); grid.replaceChildren();
    const clips = items.filter((x) => str(x.video)).map((x) => ({ type: 'video', src: x.video, poster: x.poster, alt: x.title, caption: x.title, caption_bn: x.title_bn }));
    let n = 0;
    items.forEach((it, i) => {
      const fb = safeUrl(it.facebook_url);
      const hasVideo = str(it.video);
      if (!str(it.title) && !fb && !hasVideo) return;
      n++;
      const title = str(it.title) || `Cartoon ${i + 1}`;
      let media;
      const inner = [];
      if (str(it.poster)) {
        inner.push(makeImg({ src: it.poster, thumb: it.thumb, alt: `Thumbnail of the cartoon: ${title}` }, '', `Cartoon "${title}"`));
      }
      if (hasVideo) {
        const at = clips.findIndex((x) => x.src === it.video);
        media = h('button', { class: 'thumb' + (inner.length ? '' : ' empty'), type: 'button', 'aria-label': `Play clip: ${title}`, onclick: (e) => LB.open(clips, at, e.currentTarget) },
          inner, inner.length ? null : h('span', { text: title }), h('span', { class: 'glyph', 'aria-hidden': 'true', text: '▶' }));
      } else if (fb) {
        media = h('a', { class: 'thumb' + (inner.length ? '' : ' empty'), href: fb, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${title} – open the original Facebook post (opens in a new tab)` },
          inner, inner.length ? null : h('span', { text: title }), h('span', { class: 'glyph', 'aria-hidden': 'true', text: '↗' }));
      } else {
        media = h('div', { class: 'thumb empty' }, inner, inner.length ? null : h('span', { text: title }));
      }
      const links = h('div', { class: 'cartoon-links' });
      if (hasVideo) links.append(h('button', { class: 'linkbtn', type: 'button', text: 'Play clip', onclick: (e) => LB.open(clips, clips.findIndex((x) => x.src === it.video), e.currentTarget) }));
      if (fb) links.append(h('a', { href: fb, target: '_blank', rel: 'noopener noreferrer', text: 'Facebook post ↗' }));
      const li = h('li', { class: 'cartoon', 'data-item': '' }, media,
        h('div', { class: 'cartoon-body' }, h('h3', { text: title }), bn(it.title_bn), str(it.date) ? h('p', { class: 'stat-detail', text: it.date }) : null, links));
      grid.append(reveal(li, (n % 4) * 60));
    });

    if (!n && DEV) {
      for (let k = 0; k < 3; k++) grid.append(h('li', null, slot('Add cartoon', 'content/site.json › cartoons.items')));
    }
    const note = $('#cartoons-note');
    note.textContent = '';
    if (n && isNum(c.count) && n < c.count) note.textContent = `Showing ${n} of ${c.count} cartoons.`;
    showSection('cartoons', true);
  }

  /* ---------- 4. school + survey ---------- */
  function waffle(pct) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'waffle');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${pct} out of every 100 students`);
    // fill from the bottom-left, row by row, so the filled share reads like a rising level
    for (let k = 0; k < 100; k++) {
      const row = 9 - Math.floor(k / 10), col = k % 10;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', col * 20 + 10); c.setAttribute('cy', row * 20 + 10); c.setAttribute('r', 7.5);
      c.setAttribute('class', k < pct ? 'on' : 'off');
      c.style.setProperty('--i', k);
      svg.append(c);
    }
    return svg;
  }
  let docRefs = {};
  function renderSchool(d) {
    const s = d.school;
    if (!s) return showSection('school', false);
    $('#school-h').textContent = str(s.heading) || 'School session';
    const body = $('#school-body'); body.replaceChildren();

    const left = h('div', null);
    if (str(s.summary)) add(left, h('p', { class: 'school-lead', text: s.summary }), bn(s.summary_bn));
    const facts = (s.facts || []).filter((f) => str(f.value));
    if (facts.length) left.append(h('dl', { class: 'facts' }, facts.map((f) => h('div', null, h('dd', { text: f.value }), h('dt', { text: f.label || '' })))));
    if (s.photo && imageOk(s.photo, 'School photo')) {
      left.append(h('div', { class: 'school-photo', 'data-item': '' }, makeImg(s.photo, '', 'School photo')));
    }
    if (str(s.permission_document)) {
      left.append(h('p', { class: 'school-actions', id: 'school-permission' }));
    }
    body.append(reveal(left));

    const sv = s.survey;
    if (sv && isNum(sv.percent)) {
      const pct = Math.max(0, Math.min(100, Math.round(sv.percent)));
      const box = h('div', { class: 'survey' },
        h('p', { class: 'survey-h', text: str(sv.title) || 'Survey result' }),
        h('div', { class: 'survey-big' }, numNode(pct, '', '%'), h('p', { text: str(sv.statement) })),
        waffle(pct),
        h('ul', { class: 'legend legend--light' },
          h('li', null, h('i', { class: 'on' }), `${pct} of every 100 students (filled circles)`),
          h('li', null, h('i', { class: 'off' }), `${100 - pct} of every 100: other responses`)),
        isNum(sv.respondents) ? h('p', { class: 'stat-detail', text: `Based on ${fmt(sv.respondents)} responses.` }) : null,
        str(sv.note) ? h('p', { class: 'stat-detail', text: sv.note }) : null);
      body.append(reveal(box, 120));
    }
    showSection('school', true);
  }
  // once documents are rendered, link the school permission letter
  function linkPermission(d) {
    const id = d.school && str(d.school.permission_document);
    const host = $('#school-permission');
    if (!id || !host) return;
    const ref = docRefs[id];
    if (!ref) { host.remove(); if (DEV) warn(`School: permission_document "${id}" not found among visible documents`); return; }
    host.append(ref.pdf
      ? h('a', { href: ref.file, target: '_blank', rel: 'noopener noreferrer', text: 'View the written permission from the school authorities ↗' })
      : h('button', { class: 'linkbtn', type: 'button', text: 'View the written permission from the school authorities', onclick: (e) => LB.open([ref.lb], 0, e.currentTarget) }));
  }

  /* ---------- 5. activities ---------- */
  function renderActivities(d) {
    const grid = $('#activity-grid'); grid.replaceChildren();
    let n = 0;
    (d.activities || []).forEach((a, i) => {
      if (!str(a.title)) return;
      n++;
      const photo = a.photo && imageOk(a.photo, `Activity "${a.title}"`) ? h('div', { 'data-item': '' }, makeImg(a.photo, 'card-img', `Activity "${a.title}"`)) : null;
      const link = safeUrl(a.link);
      const li = h('li', { class: 'card' }, photo,
        h('div', { class: 'card-body' },
          h('p', { class: 'card-idx', text: String(n).padStart(2, '0') }),
          h('h3', { text: a.title }), bn(a.title_bn, 'p', 'bn-title'),
          str(a.summary) ? h('p', { text: a.summary }) : null, bn(a.summary_bn),
          link ? h('a', { class: 'ext', href: link, target: '_blank', rel: 'noopener noreferrer', text: `${str(a.link_label) || 'Open link'} ↗` }) : null,
          (a.facts || []).length ? h('ul', { class: 'tags' }, a.facts.filter(str).map((f) => h('li', { text: f }))) : null));
      grid.append(reveal(li, (i % 3) * 70));
    });
    showSection('activities', n > 0);
  }

  /* ---------- 6. outcomes ---------- */
  function renderOutcomes(d) {
    const o = d.outcomes;
    const items = o && Array.isArray(o.items) ? o.items.filter((x) => str(x.text)) : [];
    $('#outcomes-intro').textContent = o && str(o.intro) ? o.intro : '';
    $('#outcomes-intro').hidden = !(o && str(o.intro));
    const ul = $('#outcome-list'); ul.replaceChildren();
    items.forEach((x, i) => ul.append(reveal(h('li', null,
      isNum(x.count) ? h('span', { class: 'big', 'aria-hidden': 'true', text: String(x.count) }) : null,
      h('p', null, isNum(x.count) ? h('span', { class: 'sr-only', text: `${x.count} ` }) : null, x.text)), i * 90)));
    showSection('outcomes', items.length > 0);
  }

  /* ---------- 7. evidence wall ---------- */
  function renderGallery(d) {
    const ul = $('#gallery'); ul.replaceChildren();
    const good = (d.gallery || []).filter((g, i) => imageOk(g, `Gallery #${i + 1}`));
    const lbItems = good.map((g) => ({ type: 'image', src: g.src, alt: altOf(g), caption: str(g.caption) + (str(g.date) ? ` (${g.date})` : ''), caption_bn: str(g.caption_bn) }));
    good.forEach((g, i) => {
      const btn = h('button', { class: 'tile', type: 'button', 'aria-label': `Open photo: ${str(g.caption) || altOf(g)}`, onclick: (e) => LB.open(lbItems, i, e.currentTarget) },
        makeImg(g, '', `Gallery #${i + 1}`));
      const li = h('li', { 'data-item': '' }, h('figure', { class: 'photo' }, btn,
        (str(g.caption) || str(g.caption_bn)) ? h('figcaption', null, str(g.caption), bn(g.caption_bn, 'span')) : null));
      ul.append(reveal(li, (i % 4) * 60));
    });
    if (!good.length && DEV) for (let k = 0; k < 4; k++) ul.append(h('li', null, slot('Add photo', 'assets/photos → content/site.json › gallery')));
    const on = good.length > 0 || DEV;
    $('#gallery-block').hidden = !on;
    return on;
  }
  function renderPosts(d) {
    const ul = $('#posts'); ul.replaceChildren();
    let n = 0;
    (d.posts || []).forEach((p, i) => {
      const url = safeUrl(p.url);
      if (!url) { warn(`Post #${i + 1}: needs a valid http(s) "url"`); return; }
      n++;
      const metrics = [['views', p.views], ['reactions', p.reactions], ['comments', p.comments]].filter(([, v]) => isNum(v) && v > 0);
      const thumb = p.image && imageOk({ alt: str(p.title) ? `Preview of the post: ${p.title}` : 'Post preview', ...p.image }, `Post #${i + 1} preview`)
        ? h('div', { 'data-item': '' }, makeImg({ alt: str(p.title) ? `Preview of the post: ${p.title}` : 'Post preview', ...p.image }, 'post-img', `Post #${i + 1}`)) : null;
      const li = h('li', { class: 'post' }, thumb,
        h('div', { class: 'post-body' },
          h('p', { class: 'post-src', text: [str(p.platform), str(p.source), str(p.date)].filter(Boolean).join(' · ') }),
          str(p.title) ? h('h3', { text: p.title }) : null, bn(p.title_bn),
          metrics.length ? h('p', { class: 'post-metrics' }, metrics.map(([k, v]) => h('span', null, h('b', { text: fmt(v) }), ' ' + k))) : null,
          h('a', { class: 'ext', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'View original post ', h('span', { 'aria-hidden': 'true', text: '↗' }), h('span', { class: 'sr-only', text: ' (opens in a new tab)' }))));
      ul.append(reveal(li, (i % 3) * 70));
    });
    if (!n && DEV) for (let k = 0; k < 2; k++) ul.append(h('li', null, slot('Add post link', 'content/site.json › posts')));
    const on = n > 0 || DEV;
    $('#posts-block').hidden = !on;
    return on;
  }
  function renderDocs(d) {
    const ul = $('#docs'); ul.replaceChildren();
    docRefs = {};
    let n = 0;
    (d.documents || []).forEach((doc, i) => {
      if (!str(doc.file) || !str(doc.title)) { warn(`Document #${i + 1}: needs "title" and "file"`); return; }
      if (doc.redacted !== true) { warn(`Document "${doc.title}": hidden – set "redacted": true after hiding names, phone numbers and addresses of anyone but you`); return; }
      n++;
      const pdf = isPdf(doc.file);
      const lb = { type: 'image', src: doc.file, alt: `${doc.title} (document)`, caption: doc.title };
      const preview = str(doc.thumb) ? makeImg({ src: doc.thumb, alt: '' }, '', `Document "${doc.title}"`) : (!pdf ? makeImg({ src: doc.file, alt: '' }, '', `Document "${doc.title}"`) : h('span', { class: 'pdf', 'aria-hidden': 'true', text: 'PDF' }));
      const label = `${pdf ? 'Open' : 'View'} document: ${doc.title}`;
      const media = pdf
        ? h('a', { class: 'doc-media', href: doc.file, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label + ' (opens in a new tab)' }, preview)
        : h('button', { class: 'doc-media', type: 'button', 'aria-label': label, onclick: (e) => LB.open([lb], 0, e.currentTarget) }, preview);
      const li = h('li', { class: 'doc', 'data-item': '' }, media,
        h('div', { class: 'doc-body' },
          str(doc.kind) ? h('p', { class: 'doc-kind', text: doc.kind }) : null,
          h('h3', { text: doc.title }), bn(doc.title_bn),
          str(doc.note) ? h('p', { text: doc.note }) : null));
      ul.append(reveal(li, (i % 4) * 60));
      if (str(doc.id)) docRefs[doc.id] = { pdf, file: doc.file, lb };
    });
    if (!n && DEV) for (let k = 0; k < 2; k++) ul.append(h('li', null, slot('Add document', 'assets/docs → content/site.json › documents')));
    const on = n > 0 || DEV;
    $('#docs-block').hidden = !on;
    return on;
  }

  /* ---------- 8. organisations + footer ---------- */
  function renderOrgs(d) {
    const ul = $('#org-list'); ul.replaceChildren();
    const orgs = (d.organisations || []).filter((o) => str(o.name));
    orgs.forEach((o, i) => ul.append(reveal(h('li', null, h('strong', { text: o.name }), str(o.role) ? h('span', { text: o.role }) : null), i * 60)));
    showSection('organisations', orgs.length > 0);
  }

  /* ---------- nav highlight ---------- */
  function setupNav() {
    if (!HAS_IO) return;
    const links = [...document.querySelectorAll('.nav a[href^="#"]')].filter((a) => a.getAttribute('href') !== '#top');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const a = map.get(e.target.id);
        if (!a) continue;
        if (e.isIntersecting) {
          links.forEach((x) => x.removeAttribute('aria-current'));
          a.setAttribute('aria-current', 'true');
          const ul = a.closest('ul'); if (ul) ul.scrollLeft = Math.max(0, a.offsetLeft - 48);
        } else if (a.getAttribute('aria-current')) a.removeAttribute('aria-current');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s && !s.hidden) io.observe(s); });
    const top = document.getElementById('top');
    if (top) new IntersectionObserver((es) => { if (es[0].isIntersecting) { const ul = $('.nav ul'); if (ul) ul.scrollLeft = 0; } }, { threshold: 0.5 }).observe(top);
  }

  /* ---------- dev panel ---------- */
  function renderDevPanel() {
    if (!DEV) return;
    let p = $('#dev-panel');
    if (!p) { p = h('details', { class: 'dev-panel', id: 'dev-panel', open: true }); document.body.append(p); }
    p.replaceChildren(h('summary', { text: problems.length ? `Dev mode · ${problems.length} issue(s)` : 'Dev mode · no issues' }),
      h('ul', null, problems.map((m) => h('li', { text: m }))));
  }

  /* ---------- boot ---------- */
  async function boot() {
    let data;
    try {
      const res = await fetch('content/site.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      data = await res.json();
    } catch (err) {
      const box = $('#load-error');
      document.documentElement.classList.add('ready');
      box.hidden = false;
      box.textContent = location.protocol === 'file:'
        ? 'This page cannot load its content when opened as a file. Serve the folder (for example: python3 -m http.server) or upload it to a host. See the README.'
        : 'Could not load content/site.json: ' + err.message;
      return;
    }

    if (data.meta && str(data.meta.title)) document.title = data.meta.title;
    if (data.meta && str(data.meta.description)) {
      const m = document.querySelector('meta[name="description"]'); if (m) m.content = data.meta.description;
    }

    // evidence first (the stats footnote links to it), then everything else
    const ev = [renderGallery(data), renderPosts(data), renderDocs(data)].some(Boolean);
    showSection('evidence', ev);
    renderHero(data);
    renderStats(data);
    renderCartoons(data);
    renderSchool(data);
    linkPermission(data);
    renderActivities(data);
    renderOutcomes(data);
    renderOrgs(data);

    $('#footer-text').textContent = str(data.footer);
    const brand = $('.brand'); if (brand && data.profile && str(data.profile.name)) brand.textContent = data.profile.name;
    setupNav();
    renderDevPanel();
    document.documentElement.classList.add('ready');
  }
  boot();
})();
