// Identificador permanente por navegador, salvo apenas localmente.
// O token de 128 bits impede salas facilmente adivinháveis; o link QR é um segredo.
export function isValidRoomCode(value) {
  return typeof value==='string' && /^[A-F0-9]{32}$/.test(value);
}
export function newRoomCode(randomBytes) {
  const bytes=randomBytes(16);
  if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw new Error('Fonte segura de aleatoriedade indisponível.');
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function persistentRoomCode({storage,randomBytes,rotate=false}) {
  const key='borake-persistent-room-v1';
  try {
    const existing=storage?.getItem(key);
    if(!rotate && isValidRoomCode(existing)) return existing;
    const id=newRoomCode(randomBytes);
    storage?.setItem(key,id);
    return id;
  } catch {
    return newRoomCode(randomBytes);
  }
}
