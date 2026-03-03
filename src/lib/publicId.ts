export function makePublicId(len = 22) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out;
}
