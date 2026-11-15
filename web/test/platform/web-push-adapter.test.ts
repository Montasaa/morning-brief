// The real Web Push adapter, checked against a stand-in fetch (no network).
// The test plays the browser: it holds the subscription's private key and
// decrypts what the adapter sent (RFC 8291), and checks the VAPID signature
// (RFC 8292) with the app's public key.
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { realOutsideServices, type PushSubscription } from "@/server/outside";
import { webPushService } from "@/server/outside/web-push";

type Call = { url: string; init: RequestInit };

function recordingFetch(status = 201): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status });
    }) as typeof fetch,
  };
}

/** A P-256 key pair as raw base64url, the way VAPID keys and browser p256dh keys are written. */
function keyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, publicKey: ecdh.getPublicKey("base64url"), privateKey: ecdh.getPrivateKey("base64url") };
}

/** A browser's subscription, plus what it needs to decrypt. */
function browser() {
  const keys = keyPair();
  const auth = randomBytes(16);
  const subscription: PushSubscription = {
    endpoint: "https://push.example.net/wpush/v2/abc123",
    keys: { p256dh: keys.publicKey, auth: auth.toString("base64url") },
  };
  return { subscription, ecdh: keys.ecdh, auth };
}

/** RFC 8291 decryption, as the browser does it. */
function decrypt(body: Buffer, ua: ReturnType<typeof browser>): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const sealed = body.subarray(21 + idlen);
  const uaPublic = ua.ecdh.getPublicKey();
  const secret = ua.ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(
    hkdfSync("sha256", secret, ua.auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32),
  );
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  expect(padded[padded.length - 1]).toBe(0x02); // the last (only) record
  return padded.subarray(0, padded.length - 1).toString("utf8");
}

describe("Web Push adapter", () => {
  it("posts the message encrypted for the browser, signed with the app's VAPID key", async () => {
    const vapid = keyPair();
    const ua = browser();
    const { calls, fetch } = recordingFetch();
    const push = webPushService({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "mailto:owner@example.com", fetch });
    const message = { title: "موجزك الصباحي جاهز", body: "Truce talks resume", url: "/", tag: "brief-ready", lang: "ar", dir: "rtl" as const };

    expect(push.publicKey).toBe(vapid.publicKey);
    expect(await push.send(ua.subscription, message)).toBe("sent");

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(ua.subscription.endpoint);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(Number(headers.get("ttl"))).toBeGreaterThan(0);
    expect(JSON.parse(decrypt(Buffer.from(init.body as Uint8Array), ua))).toEqual(message);

    const auth = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(headers.get("authorization") ?? "");
    expect(auth).not.toBeNull();
    const [, head, claims, signature, k] = auth!;
    expect(k).toBe(vapid.publicKey);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toMatchObject({
      aud: "https://push.example.net",
      sub: "mailto:owner@example.com",
    });
    const raw = Buffer.from(vapid.publicKey, "base64url");
    const verifier = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") },
      format: "jwk",
    });
    const signed = verify("sha256", Buffer.from(`${head}.${claims}`), { key: verifier, dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url"));
    expect(signed).toBe(true);
  });

  it("reports an expired subscription as gone, and throws on other refusals without the private key", async () => {
    const vapid = keyPair();
    const ua = browser();
    for (const status of [404, 410]) {
      const push = webPushService({ ...vapid, subject: "mailto:a@example.com", fetch: recordingFetch(status).fetch });
      expect(await push.send(ua.subscription, { title: "t", body: "b" })).toBe("gone");
    }
    const push = webPushService({ ...vapid, subject: "mailto:a@example.com", fetch: recordingFetch(500).fetch });
    const sending = push.send(ua.subscription, { title: "t", body: "b" });
    await expect(sending).rejects.toThrow(/refused the message \(500\)/);
    await expect(sending).rejects.not.toThrow(vapid.privateKey);
  });

  it("is used only when VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set", async () => {
    const ua = browser();
    const unset = realOutsideServices({});
    expect(unset.push.publicKey).toBeNull();
    await expect(unset.push.send(ua.subscription, { title: "t", body: "b" })).rejects.toThrow(/not connected/);

    const vapid = keyPair();
    const set = realOutsideServices({
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: "mailto:owner@example.com",
    });
    expect(set.push.publicKey).toBe(vapid.publicKey);
    // Wired in: sending would reach the network, which tests forbid.
    await expect(set.push.send(ua.subscription, { title: "t", body: "b" })).rejects.toThrow(/Real network call/);
  });
});
