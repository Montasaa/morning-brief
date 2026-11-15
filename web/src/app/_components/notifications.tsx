"use client";
// The Me tab's "Home screen and notifications" (ticket 18):
// - Install: the browser's install prompt where there is one, or how to add
//   the Brief to the home screen on an iPhone. Hidden once it runs installed.
// - This device: turn push on (asks the browser's permission, subscribes with
//   the app's VAPID key and POSTs /api/push/subscriptions) or off (DELETE).
// - Which pushes: "Brief ready" and Story Thread updates, each its own switch,
//   saved straight away with PATCH /api/me {notifications}.
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "./language";
import s from "./notifications.module.css";
import { INSTALL_PROMPT_EVENT, clearInstallPrompt, installPrompt, serviceWorkerScope } from "./service-worker";
import { quietButtonStyle } from "./styles";

export interface NotificationPreferences {
  brief_ready: boolean;
  thread_updates: boolean;
}

type Kind = keyof NotificationPreferences;

/** What this device can do. "checking" until the browser has been asked. */
type DeviceState =
  | "checking"
  | "unsupported" // no service worker or Push API (an iPhone outside the home-screen app, an old browser)
  | "not-connected" // the server has no VAPID key
  | "blocked" // the Reader blocked notifications for the site
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function registration(basePath: string): Promise<ServiceWorkerRegistration> {
  const scope = serviceWorkerScope(basePath);
  const existing = await navigator.serviceWorker.getRegistration(scope);
  return existing ?? navigator.serviceWorker.register(`${basePath}/sw.js`, { scope, updateViaCache: "none" });
}

export function NotificationSettings({
  basePath,
  publicKey,
  initial,
}: {
  basePath: string;
  /** The VAPID public key; null when push is not connected on the server. */
  publicKey: string | null;
  initial: NotificationPreferences;
}) {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState(initial);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const api = `${basePath}/api/push/subscriptions`;

  const check = useCallback(async () => {
    if (!pushSupported()) return setDevice("unsupported");
    if (!publicKey) return setDevice("not-connected");
    if (Notification.permission === "denied") return setDevice("blocked");
    try {
      const reg = await navigator.serviceWorker.getRegistration(serviceWorkerScope(basePath));
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return setDevice("off");
      const res = await fetch(api);
      const listed = res.ok ? ((await res.json()).subscriptions as { endpoint: string }[]) : [];
      setDevice(listed.some((d) => d.endpoint === sub.endpoint) ? "on" : "off");
    } catch {
      setDevice("off");
    }
  }, [api, basePath, publicKey]);

  useEffect(() => {
    void check();
  }, [check]);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration(basePath);
      await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(publicKey!);
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        if (current.length !== key.length || current.some((b, i) => b !== key[i])) {
          await sub.unsubscribe(); // made with another key: start again
          sub = null;
        }
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDevice("on");
      setMessage({ text: t("Notifications are on for this device.", "الإشعارات مفعّلة على هذا الجهاز.") });
    } catch {
      setMessage({ text: t("Could not turn notifications on. Try again.", "تعذّر تفعيل الإشعارات. حاول مرة أخرى."), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(serviceWorkerScope(basePath));
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(api, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setDevice("off");
      setMessage({ text: t("Notifications are off for this device.", "الإشعارات متوقفة على هذا الجهاز.") });
    } catch {
      setMessage({ text: t("Could not turn notifications off. Try again.", "تعذّر إيقاف الإشعارات. حاول مرة أخرى."), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(kind: Kind, on: boolean) {
    setPrefs((p) => ({ ...p, [kind]: on }));
    try {
      const res = await fetch(`${basePath}/api/me`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notifications: { [kind]: on } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage(null);
    } catch {
      setPrefs((p) => ({ ...p, [kind]: !on }));
      setMessage({ text: t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."), error: true });
    }
  }

  const deviceNote: Record<DeviceState, string> = {
    checking: "",
    unsupported: isIosSafe()
      ? t(
          "On iPhone and iPad, add the Brief to your Home Screen first, then open it from there to turn notifications on.",
          "على آيفون وآيباد، أضف الموجز إلى الشاشة الرئيسية أولًا، ثم افتحه من هناك لتفعيل الإشعارات.",
        )
      : t("This browser cannot show notifications from the Brief.", "هذا المتصفح لا يدعم إشعارات الموجز."),
    "not-connected": t("Notifications are not set up on this server yet.", "الإشعارات غير مُعدّة على الخادم بعد."),
    blocked: t(
      "Notifications are blocked for this site. Allow them in your browser's settings, then try again.",
      "الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم حاول مرة أخرى.",
    ),
    off: t("Notifications are off on this device.", "الإشعارات متوقفة على هذا الجهاز."),
    on: t("Notifications are on for this device.", "الإشعارات مفعّلة على هذا الجهاز."),
  };
  const wantsAny = prefs.brief_ready || prefs.thread_updates;

  return (
    <section className={s.section} aria-labelledby="notifications-title">
      <h2 id="notifications-title" className={s.title}>
        {t("Notifications", "الإشعارات")}
      </h2>
      <InstallApp />
      <div className={s.device}>
        <p className={s.note} data-testid="push-device-state" data-state={device}>
          {deviceNote[device]}
        </p>
        {(device === "off" || device === "blocked") && (
          <button type="button" style={quietButtonStyle} disabled={busy} onClick={() => void turnOn()}>
            {t("Turn on for this device", "تفعيل على هذا الجهاز")}
          </button>
        )}
        {device === "on" && (
          <button type="button" style={quietButtonStyle} disabled={busy} onClick={() => void turnOff()}>
            {t("Turn off for this device", "إيقاف على هذا الجهاز")}
          </button>
        )}
      </div>
      <Switch
        checked={prefs.brief_ready}
        onChange={(on) => void toggle("brief_ready", on)}
        label={t("Your Brief is ready", "موجزك جاهز")}
        hint={t("After each Edition, with your top story.", "بعد كل إصدار، مع أبرز قصة لك.")}
      />
      <Switch
        checked={prefs.thread_updates}
        onChange={(on) => void toggle("thread_updates", on)}
        label={t("Story Thread updates", "تحديثات القصص المتواصلة")}
        hint={t("A new development on a Thread you follow.", "تطور جديد في قصة تتابعها.")}
      />
      {wantsAny && device === "off" && (
        <p className={s.note}>
          {t("Turn notifications on for this device to get them here.", "فعّل الإشعارات على هذا الجهاز لتصلك هنا.")}
        </p>
      )}
      {/* A live region, not role="status": the Me tab's own status line above is the page's one status. */}
      <p aria-live="polite" className={`${s.status} ${message?.error ? s.error : ""}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}

/** isIos(), but safe to call while rendering on the server. */
function isIosSafe(): boolean {
  return typeof navigator !== "undefined" && isIos();
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange(on: boolean): void;
  label: string;
  hint: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <label className={s.switchRow}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{label}</span>
        <span className={s.note}>{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className={s.switch}
        checked={checked}
        disabled={!ready}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** "Add to Home Screen": the browser's install prompt, or the iPhone steps. Nothing once installed. */
function InstallApp() {
  const { t } = useLanguage();
  const [state, setState] = useState<"hidden" | "prompt" | "ios">("hidden");

  useEffect(() => {
    const update = () => {
      if (isStandalone()) setState("hidden");
      else if (installPrompt()) setState("prompt");
      else setState(isIos() ? "ios" : "hidden");
    };
    update();
    window.addEventListener(INSTALL_PROMPT_EVENT, update);
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, update);
  }, []);

  async function install() {
    const prompt = installPrompt();
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    clearInstallPrompt();
  }

  if (state === "hidden") return null;
  return (
    <div className={s.install}>
      <p className={s.switchLabel}>{t("Add the Brief to your home screen", "أضف الموجز إلى الشاشة الرئيسية")}</p>
      {state === "prompt" ? (
        <button type="button" style={quietButtonStyle} onClick={() => void install()}>
          {t("Install the app", "تثبيت التطبيق")}
        </button>
      ) : (
        <p className={s.note}>
          {t(
            "In Safari, tap Share, then “Add to Home Screen”. It then opens like an app, and can send you notifications.",
            "في سفاري، اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية». سيفتح بعدها كتطبيق، ويمكنه إرسال الإشعارات إليك.",
          )}
        </p>
      )}
    </div>
  );
}
