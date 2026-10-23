// Helper DOM + modal gaya app lama (.overlay > .modal), numpad, toast.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

// Tanda khusus: HTML statis tepercaya (ikon SVG) — jangan pernah diisi data pengguna.
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

function modalShell({ title, body, foot, maxWidth, z }) {
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'overlay open', style: z ? `z-index:${z}` : null, onclick: (e) => { if (e.target === wrap) wrap.dispatchEvent(new CustomEvent('dismiss')); } },
    h('div', { class: 'modal', style: maxWidth ? `max-width:${maxWidth}px` : null },
      title != null ? h('div', { class: 'modal-head' },
        h('div', { class: 'modal-title' }, title),
        h('button', { class: 'modal-x', 'aria-label': 'Tutup', onclick: () => wrap.dispatchEvent(new CustomEvent('dismiss')) }, '✕')) : null,
      h('div', { class: 'modal-body' }, body),
      foot ? h('div', { class: 'modal-foot' }, foot) : null));
  document.body.append(wrap);
  return { wrap, close };
}

// Dialog input teks. Mengembalikan string, atau null bila dibatalkan.
export function ask({ title, label = '', value = '', multiline = false, ok = 'Simpan', inputmode, extraFoot, extraBody }) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea', { class: 'inp', rows: 6, value, style: 'width:100%' })
      : h('input', { type: 'text', class: 'inp', value, inputmode, style: 'width:100%' });
    let done;
    const m = modalShell({
      title,
      body: [label ? h('div', { class: 'hint', style: 'margin:0 0 8px' }, label) : null, input, extraBody || null],
      foot: [
        extraFoot || null,
        h('button', { class: 'btn sm', onclick: () => done(null) }, 'Batal'),
        h('button', { class: 'btn sm primary', onclick: () => done(input.value) }, ok),
      ],
    });
    done = (v) => { m.close(); resolve(v); };
    m.wrap.addEventListener('dismiss', () => done(null));
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    input.focus();
    input.select?.();
  });
}

export function confirmBox(message, ok = 'OK', danger = false) {
  return new Promise((resolve) => {
    let done;
    const m = modalShell({
      title: null, maxWidth: 330, z: 1100,
      body: h('div', { style: 'font-size:13.5px;line-height:1.6;white-space:pre-line;padding-top:4px' }, message),
      foot: [
        h('button', { class: 'btn sm', onclick: () => done(false) }, 'Batal'),
        h('button', { class: 'btn sm ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, ok),
      ],
    });
    done = (v) => { m.close(); resolve(v); };
    m.wrap.addEventListener('dismiss', () => done(false));
  });
}

// Modal kustom (mis. pengaturan). Mengembalikan { close }.
export function openModal({ title, body, foot, maxWidth }) {
  const m = modalShell({ title, body, foot, maxWidth });
  m.wrap.addEventListener('dismiss', m.close);
  return m;
}

// Numpad kalkulator (openCalc di app lama). Mengembalikan angka > 0 atau null.
export function openCalc(title, satLabel, current) {
  return new Promise((resolve) => {
    let val = '';
    const disp = h('div', { class: 'calc-disp is-zero' }, current != null ? String(current) : '0');
    const paint = () => {
      disp.textContent = val || '0';
      disp.className = 'calc-disp' + (val ? '' : ' is-zero');
    };
    let done;
    const key = (k) => {
      if (k === 'del') { val = val.slice(0, -1); paint(); return; }
      if (k === 'ok') { const v = parseFloat(val); done(val && v > 0 ? v : null); return; }
      if (k === '.' && val.includes('.')) return;
      if (val.length >= 8) return;
      val = val === '0' && k !== '.' ? k : val + k;
      paint();
    };
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'];
    const wrap = h('div', { class: 'overlay open', onclick: (e) => { if (e.target === wrap) done(null); } },
      h('div', { class: 'modal calc-modal' },
        h('div', { class: 'calc-head' },
          h('div', { class: 'calc-name' }, title || '—'), disp, h('div', { class: 'calc-sat' }, satLabel || '')),
        h('div', { class: 'calc-grid' },
          keys.map((k) => h('button', { class: 'calc-btn' + (k === 'del' ? ' del' : ''), onclick: () => key(k) }, k === 'del' ? '⌫' : k)),
          h('button', { class: 'calc-btn okbtn', onclick: () => key('ok') }, '✓ Konfirmasi'))));
    done = (v) => { wrap.remove(); resolve(v); };
    document.body.append(wrap);
  });
}

// Popup satuan (kisi 3 kolom). onPick(unit). fixed=true untuk di dalam tabel scroll.
export function unitPopup(anchor, units, current, onPick, { fixed = false } = {}) {
  closeUnitPops();
  const pop = h('div', { class: 'unit-pop' + (fixed ? ' hpp-unit-pop' : '') },
    units.map((u) => h('button', {
      class: 'unit-opt' + (u === current ? ' sel' : ''),
      onclick: (e) => { e.stopPropagation(); closeUnitPops(); onPick(u); },
    }, u)));
  if (fixed) {
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const w = 196;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    const below = r.bottom + 4;
    pop.style.top = (below + 170 > window.innerHeight ? Math.max(8, r.top - 4 - 170) : below) + 'px';
    pop.style.zIndex = '1200';
  } else {
    anchor.parentElement.append(pop);
  }
  return pop;
}
export function closeUnitPops() { document.querySelectorAll('.unit-pop').forEach((p) => p.remove()); }
export const hasUnitPop = () => !!document.querySelector('.unit-pop');
document.addEventListener('click', () => closeUnitPops());

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
