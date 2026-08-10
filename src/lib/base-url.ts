/**
 * Resolve the origin used for same-server API fetches from server components.
 *
 * In production the public origin is used — the request's `Host` + protocol —
 * which is what lets the API resolve the same viewer (session cookie) as the
 * page. The public certificate is valid there, so the fetch verifies fine.
 *
 * In local development we call the same Next.js server over the loopback
 * interface instead. `next dev --experimental-https` serves a self-signed /
 * mkcert certificate that only covers `localhost`/`127.0.0.1`, and Node's TLS
 * stack does not trust it by default. Fetching the public hostname (e.g. a LAN
 * IP like `192.168.1.4`) then fails certificate verification with an
 * "unknown certificate verification error". Pinning the host to `127.0.0.1`
 * keeps the same protocol but never verifies a public hostname against the
 * dev certificate.
 */
export function getInternalBaseUrl(headersList: {
  get(name: string): string | null;
}): string {
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';

  if (process.env.NODE_ENV === 'production') {
    return `${protocol}://${host}`;
  }

  const port = host.includes(':') ? host.split(':').at(-1) : '3000';
  return `${protocol}://127.0.0.1:${port}`;
}
