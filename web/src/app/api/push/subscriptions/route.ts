// The signed-in Reader's push devices (ticket 18).
// GET: {public_key, subscriptions: [{endpoint, created_at}]}; public_key is the
// VAPID key browsers subscribe with (null when push is not connected).
// POST {endpoint, keys: {p256dh, auth}} (a browser PushSubscription): turn push
// on for this device. 201 {subscription}; 422 {error, reasons} for anything else.
// DELETE {endpoint}: turn it off. 200 {removed}.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { listDevices, subscribeDevice, unsubscribeDevice } from "@/server/push/subscriptions";
import { sessionTokenFrom } from "@/server/readers/sessions";

export const dynamic = "force-dynamic";

async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ public_key: ctx.services.push.publicKey, subscriptions: listDevices(ctx, access.reader.id) });
}

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const result = subscribeDevice(ctx, access.reader, sessionTokenFrom(req)!, await jsonBody(req));
  if (!result.ok) return Response.json({ error: result.reasons[0], reasons: result.reasons }, { status: 422 });
  return Response.json({ subscription: result.subscription }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const body = (await jsonBody(req)) as { endpoint?: unknown } | undefined;
  return Response.json({ removed: unsubscribeDevice(ctx, access.reader, body?.endpoint) });
}
