import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { addPurchasedSkin, setSelectedBoardSkinIfEmpty } from '@/lib/users';

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET; // optional in dev; if not set, try direct parse
  let event: Stripe.Event | null = null;
  const body = await req.text();
  try {
    if (whSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, whSecret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }
  if (!event) return new Response('Bad event', { status: 400 });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata as Record<string, string> | null | undefined;
    const skinId = meta?.skinId as string | undefined;
    const userId = session.client_reference_id as string | undefined;
    if (skinId && userId) {
      try {
        await addPurchasedSkin(userId, skinId);
        await setSelectedBoardSkinIfEmpty(userId, skinId);
      } catch (e) {
        console.error('Grant skin failed', e);
      }
    }
  }
  return new Response('ok', { status: 200 });
}

export const dynamic = 'force-dynamic';