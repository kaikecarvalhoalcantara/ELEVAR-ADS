/**
 * Auth simples via senha única — calcula SHA-256 da senha pra usar como
 * cookie value. Edge-runtime safe (usa Web Crypto, não node:crypto).
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export const AUTH_COOKIE_NAME = "auto_session";
export const AUTH_MAX_AGE_DAYS = 30;
