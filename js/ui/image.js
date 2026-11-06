// 写真を保存用に縮小する（長辺 1600px・JPEG）。スマホの写真の向き（EXIF）も直す

export const MAX_SIDE = 1600;
const QUALITY = 0.85;
const KEEP_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const loadBitmap = async (file) => {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* 下の方法で読む */ }
  }
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
    img.onerror = () => { URL.revokeObjectURL(url); ng(new Error('画像として読めませんでした（HEIC などは、JPEG に変換してから貼ってください）')); };
    img.src = url;
  });
};

// 返り値：{ blob, w, h, name }
export async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルではありません');
  const bmp = await loadBitmap(file);
  const w0 = bmp.width, h0 = bmp.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  // 小さくて軽い画像は、そのまま保存する（スクリーンショットの文字がにじまないように）
  if (k === 1 && KEEP_TYPES.includes(file.type) && file.size <= 600 * 1024) {
    bmp.close?.();
    return { blob: file, w: w0, h: h0, name: file.name || 'photo' };
  }
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; // 透明な部分は白にする（JPEG は透明にできないため）
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('画像を変換できませんでした');
  return { blob, w, h, name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg' };
}

// Blob ⇄ data URL（書き出し・読み込み用）
export const blobToDataUrl = (blob) => new Promise((ok, ng) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ng(r.error);
  r.readAsDataURL(blob);
});
export async function dataUrlToBlob(url) {
  if (!/^data:image\/(jpeg|png|gif|webp);base64,/.test(url)) throw new Error('写真の形式が違います');
  return (await fetch(url)).blob();
}
