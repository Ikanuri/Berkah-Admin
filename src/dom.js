// Helper DOM minimal: h(), modal input/konfirmasi, toast.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
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

function overlay(content) {
  const wrap = h('div', { class: 'overlay' }, h('div', { class: 'modal' }, content));
  document.body.append(wrap);
  return wrap;
}

// Dialog input teks. Mengembalikan string, atau null bila dibatalkan.
export function ask({ title, label = '', value = '', multiline = false, ok = 'Simpan', inputmode }) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea', { rows: 6, value, placeholder: label })
      : h('input', { type: 'text', value, placeholder: label, inputmode });
    const done = (v) => { wrap.remove(); resolve(v); };
    const wrap = overlay([
      h('h3', {}, title),
      label && !multiline ? h('p', { class: 'muted' }, label) : null,
      input,
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => done(null) }, 'Batal'),
        h('button', { class: 'btn primary', onclick: () => done(input.value) }, ok)),
    ]);
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    input.focus();
  });
}

export function confirmBox(message, ok = 'Ya', danger = false) {
  return new Promise((resolve) => {
    const done = (v) => { wrap.remove(); resolve(v); };
    const wrap = overlay([
      h('p', {}, message),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => done(false) }, 'Batal'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, ok)),
    ]);
  });
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', class: 'toast' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
