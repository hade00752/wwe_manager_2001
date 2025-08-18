// Persistent storage with graceful fallback
const mem = new Map();

function canUse(storage){
  try{
    const k="__t"; storage.setItem(k,"1"); storage.removeItem(k); return true;
  }catch(e){ return false; }
}
const HAS_LS = (typeof localStorage!=="undefined") && canUse(localStorage);
const HAS_SS = !HAS_LS && (typeof sessionStorage!=="undefined") && canUse(sessionStorage);

function getStore(){ return HAS_LS ? localStorage : HAS_SS ? sessionStorage : null; }

// Patched: Circular-safe JSON stringify
export function setJSON(key, val){
  const seen = new WeakSet();
  const s = JSON.stringify(val, (k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return; // skip circular reference
      seen.add(v);
    }
    return v;
  });
  const store = getStore();
  if(store) store.setItem(key, s); else mem.set(key, s);
}

export function getJSON(key, def=null){
  try{
    const store = getStore();
    const s = store ? store.getItem(key) : mem.get(key);
    return s ? JSON.parse(s) : def;
  }catch(e){ return def; }
}
