import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { addPurchasedSkin, setSelectedBoardSkinIfEmpty } from '@/lib/users';

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const id = String(body.sessionId || '');
  if (!id) return new Response(JSON.stringify({ error: 'INVALID' }), { status: 400 });
  try {
    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.retrieve(id);
    if (session.payment_status === 'paid') {
      const meta = session.metadata as Record<string, string> | null | undefined;
      const skinId = meta?.skinId as string | undefined;
      const userId = session.client_reference_id as string | undefined;
      if (skinId && userId) {
        await addPurchasedSkin(userId, skinId);
        // Optionally set as selected if none selected
        await setSelectedBoardSkinIfEmpty(userId, skinId);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'NOT_PAID' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'LOOKUP_FAILED' }), { status: 500 });
  }
}