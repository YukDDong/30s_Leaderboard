const TOKEN_ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const encoder = new TextEncoder();

type AdminTokenPayload = {
  exp: number;
  iat: number;
  scope: string;
};

export async function issueAdminToken(secret: string, expiresInSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = {
    exp: now + expiresInSeconds,
    iat: now,
    scope: "league_admin",
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await sign(`${encodedHeader}.${encodedPayload}`, secret);

  return {
    token: `${encodedHeader}.${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function verifyAdminToken(token: string, secret: string) {
  if (!token) {
    throw new Error("관리자 토큰이 없습니다.");
  }

  const [encodedHeader, encodedPayload, signature] = token.split(".");

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("관리자 토큰 형식이 올바르지 않습니다.");
  }

  const expectedSignature = await sign(`${encodedHeader}.${encodedPayload}`, secret);

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("관리자 토큰 서명이 유효하지 않습니다.");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AdminTokenPayload;

  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("관리자 토큰이 만료되었습니다.");
  }

  if (payload.scope !== "league_admin") {
    throw new Error("관리자 토큰 범위가 올바르지 않습니다.");
  }

  return payload;
}

export function constantTimeCompare(a: string, b: string) {
  return timingSafeEqual(a, b);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    TOKEN_ALGORITHM,
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(TOKEN_ALGORITHM.name, key, encoder.encode(value));
  return arrayBufferToBase64Url(signatureBuffer);
}

function encodeBase64Url(value: string) {
  return arrayBufferToBase64Url(encoder.encode(value));
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < aBytes.length; index += 1) {
    result |= aBytes[index] ^ bBytes[index];
  }

  return result === 0;
}
