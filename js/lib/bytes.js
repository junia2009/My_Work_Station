// バイト列と文字列の相互変換（差分比較などで使う小さな関数）

export function latin1Decode(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

export const bytesToHex = (b, sep = '') => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(sep);

export function hexToBytes(s) {
  const h = s.replace(/0x|\\x|[\s:,]/gi, '');
  if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error('不正なHex文字列です');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
