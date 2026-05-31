import "server-only";

import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
export const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
} satisfies ScryptOptions;
const MAXMEM = 64 * 1024 * 1024;

type HashStaffCredentialOptions = {
  salt?: Buffer;
};

type ParsedStaffCredentialHash = {
  scheme: string;
  params: {
    N: number;
    r: number;
    p: number;
    length: number;
  };
  salt: Buffer;
  key: Buffer;
};

function assertCredentialInput(plaintext: string) {
  if (!plaintext || plaintext.length < 8) {
    throw new Error("STAFF_CREDENTIAL_TOO_SHORT");
  }
}

function encodeSegment(value: Buffer) {
  return value.toString("base64url");
}

function decodeSegment(value: string) {
  return Buffer.from(value, "base64url");
}

function serializeParams() {
  return [
    `n=${SCRYPT_PARAMS.N}`,
    `r=${SCRYPT_PARAMS.r}`,
    `p=${SCRYPT_PARAMS.p}`,
    `l=${KEY_LENGTH}`,
  ].join(",");
}

function parseParams(value: string): ParsedStaffCredentialHash["params"] {
  const entries = new Map(
    value.split(",").map((part) => {
      const [key, rawValue] = part.split("=", 2);

      return [key, Number(rawValue)] as const;
    }),
  );

  return {
    N: entries.get("n") ?? 0,
    r: entries.get("r") ?? 0,
    p: entries.get("p") ?? 0,
    length: entries.get("l") ?? 0,
  };
}

function isValidScryptParams(
  params: ParsedStaffCredentialHash["params"],
): boolean {
  return [params.N, params.r, params.p, params.length].every(
    (value) => Number.isSafeInteger(value) && value > 0,
  );
}

function parseStaffCredentialHash(
  storedHash: string,
): ParsedStaffCredentialHash | null {
  const segments = storedHash.split("$");

  if (segments.length !== 5) {
    return null;
  }

  const [prefix, scheme, rawParams, rawSalt, rawKey] = segments;

  if (
    prefix !== "" ||
    scheme !== STAFF_CREDENTIAL_SCHEME ||
    !rawParams ||
    !rawSalt ||
    !rawKey
  ) {
    return null;
  }

  const params = parseParams(rawParams);
  const salt = decodeSegment(rawSalt);
  const key = decodeSegment(rawKey);

  if (
    !isValidScryptParams(params) ||
    salt.length === 0 ||
    key.length !== params.length
  ) {
    return null;
  }

  return {
    scheme,
    params,
    salt,
    key,
  };
}

async function deriveStaffCredentialKey(
  plaintext: string,
  salt: Buffer,
  params: ParsedStaffCredentialHash["params"],
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      params.length,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashStaffCredential(
  plaintext: string,
  options: HashStaffCredentialOptions = {},
) {
  assertCredentialInput(plaintext);

  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const key = await deriveStaffCredentialKey(plaintext, salt, {
    ...SCRYPT_PARAMS,
    length: KEY_LENGTH,
  });

  return [
    "",
    STAFF_CREDENTIAL_SCHEME,
    serializeParams(),
    encodeSegment(salt),
    encodeSegment(key),
  ].join("$");
}

export async function verifyStaffCredential(
  plaintext: string,
  storedHash: string,
) {
  if (!plaintext || !storedHash) {
    return false;
  }

  const parsed = parseStaffCredentialHash(storedHash);

  if (!parsed) {
    return false;
  }

  const candidate = await deriveStaffCredentialKey(
    plaintext,
    parsed.salt,
    parsed.params,
  );

  return (
    candidate.length === parsed.key.length &&
    timingSafeEqual(candidate, parsed.key)
  );
}

export function needsStaffCredentialRehash(storedHash: string) {
  const parsed = parseStaffCredentialHash(storedHash);

  if (!parsed) {
    return true;
  }

  return (
    parsed.scheme !== STAFF_CREDENTIAL_SCHEME ||
    parsed.params.N !== SCRYPT_PARAMS.N ||
    parsed.params.r !== SCRYPT_PARAMS.r ||
    parsed.params.p !== SCRYPT_PARAMS.p ||
    parsed.params.length !== KEY_LENGTH
  );
}
