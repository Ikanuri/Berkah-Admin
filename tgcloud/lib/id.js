// ID string untuk items dan price_log (makeId() app lama berupa string acak).
export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
