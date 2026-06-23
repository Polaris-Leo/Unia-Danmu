/**
 * 模板替换：@key@ → value
 */
export function applyTemplate(text, vars) {
  let result = text;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`@${key}@`, val ?? '');
  }
  return result;
}

/**
 * 从数组随机取一项
 */
export function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
