/**
 * Accept only internal, same-origin, relative paths as post-login return
 * destinations. Anything absolute, protocol-relative (`//host`), or otherwise
 * not starting with a single `/` is rejected, so arbitrary external URLs can
 * never be used as redirect targets.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('//') || !value.startsWith('/')) return null;
  return value;
}
