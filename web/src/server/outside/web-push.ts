// The real Web Push adapter (ticket 18), with node:crypto only:
// - the message is encrypted for the browser as RFC 8291 says (aes128gcm,
//   ECDH on P-256 with the subscription's p256dh key and auth secret), and
// - the request is signed with the app's VAPID key (RFC 8292: an ES256 JWT for
//   the push service's origin).
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, the raw P-256 keys, as
// `web-push generate-vapid-keys` prints them) and VAPID_SUBJECT (mailto: or
// https: contact) come from the environment; the private key is never logged.
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";
import type { PushService, PushSubscription } from "./index";

export interface WebPushOptions {
  publicKey: string;
  privateKey: string;
  /** Who the push service can contact about this sender: "mailto:you@example.com" or an https URL. */
  subject: string;
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** How long a push service keeps an undelivered message, in seconds. Default: 12 hours. */
  ttlSeconds?: number;
}

/** Record size written in the aes128gcm header; a push message is always one record. */
const RECORD_SIZE = 4096;
const JWT_LIFETIME_S = 12 * 60 * 60;

export function webPushService(options: WebPushOptions): PushService {
  const signingKey = vapidSigningKey(options.publicKey, options.privateKey);
  return {
    publicKey: options.publicKey,
    async send(subscription, message) {
      const doFetch = options.fetch ?? fetch;
      const body = encryptPayload(subscription, Buffer.from(JSON.stringify(message), "utf8"));
      const jwt = vapidJwt(signingKey, new URL(subscription.endpoint).origin, options.subject);
      const res = await doFetch(subscription.endpoint, {
        method: "POST",
        headers: {
          authorization: `vapid t=${jwt}, k=${options.publicKey}`,
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
          ttl: String(options.ttlSeconds ?? JWT_LIFETIME_S),
          urgency: "normal",
          ...(message.tag ? { topic: topicHeader(message.tag) } : {}),
        },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(15_000),
      });
      // 404 and 410: the browser unsubscribed or the subscription expired.
      if (res.status === 404 || res.status === 410) return "gone";
      if (!res.ok) throw new Error(`The push service refused the message (${res.status})`);
      return "sent";
    },
  };
}

/** RFC 8291 + RFC 8188: the encrypted body for one subscription. Exported for the adapter tests only. */
export function encryptPayload(subscription: PushSubscription, plaintext: Buffer): Buffer {
  const uaPublic = Buffer.from(subscription.keys.p256dh, "base64url");
  const authSecret = Buffer.from(subscription.keys.auth, "base64url");
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("The subscription's p256dh key is not a P-256 public key");

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));

  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));

  // One record: the message, then the 0x02 delimiter of the last record.
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);
  if (sealed.length + 86 > RECORD_SIZE) throw new Error("The push message is too long");

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, sealed]);
}

function vapidSigningKey(publicKey: string, privateKey: string): KeyObject {
  const pub = Buffer.from(publicKey, "base64url");
  const d = Buffer.from(privateKey, "base64url");
  if (pub.length !== 65 || pub[0] !== 0x04 || d.length !== 32) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not a raw P-256 key pair (base64url)");
  }
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33).toString("base64url"),
      d: d.toString("base64url"),
    },
    format: "jwk",
  });
}

/** RFC 8292: an ES256 JWT for the push service's origin. */
function vapidJwt(key: KeyObject, audience: string, subject: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + JWT_LIFETIME_S,
    sub: subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned, "utf8"), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** The Topic header (RFC 8030) replaces an undelivered message with the same topic: at most 32 base64url characters. */
function topicHeader(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}
