import { auth } from '@/auth';
import { stripe } from '@/lib/stripe';
import { BOARD_SKINS } from '@/lib/skins';
import { findUserByEmail } from '@/lib/users';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  const user = await findUserByEmail(session.user.email);
  if (!user?._id) return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  const skinId = String(body.skinId || '');
  const skin = BOARD_SKINS.find(s => s.id === skinId);
  if (!skin) return new Response(JSON.stringify({ error: 'INVALID_SKIN' }), { status: 400 });
  if ((user.purchasedSkins || []).includes(skinId)) {
    return new Response(JSON.stringify({ error: 'ALREADY_OWNED' }), { status: 400 });
  }
  try {
    const origin = (() => { try { return new URL(req.url).origin; } catch { return process.env.NEXT_PUBLIC_BASE_URL || ''; } })();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'eur',
      customer_email: String(user.email),
      client_reference_id: String(user._id ?? ''),
      metadata: { skinId: String(skinId), userId: String(user._id ?? '') },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(skin.priceEuros * 100),
            product_data: { name: `${skin.name} (Board Skin)` },
          },
        },
      ],
      success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/store`,
    });
    return new Response(JSON.stringify({ url: checkout.url }), { status: 200 });
  } catch (e) {
    console.error('Stripe checkout create failed', e);
    return new Response(JSON.stringify({ error: 'CHECKOUT_FAILED' }), { status: 500 });
  }
}