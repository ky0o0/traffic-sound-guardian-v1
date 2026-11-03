import { parse } from 'acorn';
import crypto from 'node:crypto';

// Ignore parser locations and spelling-only formatting, but preserve semantic values.
// Cache tags do not alter a protected audio algorithm.
export function normalizedAST(value) {
  if (Array.isArray(value)) return value.map(normalizedAST);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['start', 'end', 'loc', 'raw'].includes(key))
        .map(([key, item]) => [key, normalizedAST(item)]),
    );
  }
  return typeof value === 'string' ? value.replace(/\?v=\d+(?:\.\d+)*/g, '?v=RELEASE') : value;
}
export function parseModule(source) {
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
}
export function astHash(ast) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedAST(ast)))
    .digest('hex');
}
