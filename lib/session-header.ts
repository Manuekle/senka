/** The request header the middleware fills with the verified session's
 *  account email — after checking the session cookie itself and dropping any
 *  value the client sent inbound. Reading it is trusting the middleware, not
 *  the caller, which is why the format is validated again at the read site:
 *  a deploy with no middleware in front must not turn a spoofable header
 *  into an identity. */
export const SESSION_ACCOUNT_HEADER = "x-senka-session";

/** The header's value only when it is a plausible email address. */
export function trustedSessionEmail(headers: Headers): string | undefined {
  const raw = headers.get(SESSION_ACCOUNT_HEADER)?.trim();
  return raw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw : undefined;
}