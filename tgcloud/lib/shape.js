// Permission di sisi server: worker TIDAK PERNAH menerima field modal.
// Murni, dipakai endpoint dan di-test langsung.

export const HPP_FIELDS = ['isi', 'satuanHpp', 'hargaBeli', 'hargaJual'];

export function shapeItemFor(role, item) {
  if (role === 'boss') return item;
  const out = { ...item };
  for (const f of HPP_FIELDS) delete out[f];
  return out;
}

export function canSeeSuppliers(role) {
  return role === 'boss';
}

export function isApproved(role) {
  return role === 'boss' || role === 'worker';
}
