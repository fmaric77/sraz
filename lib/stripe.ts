import Stripe from 'stripe';

const sk = process.env.STRIPE_SECRET_KEY || 'sk_test_51RiZm0Q9TtpeyXJ7xFWGSfCirKnD3PsFLwp7S3VjJelXpz9synu9CvoJiulRn9yqmRcLUpg82HdETO3979PZ8IY90085ewQ5lC';

export const stripe = new Stripe(sk);

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51RiZm0Q9TtpeyXJ7dDU0QXj5ClkQmsLPyzAKXH7RgPorLR08aEjAVlVAkzJuhmHAz9b8JGejftsUYDQRXAY8j4C600mGCBNrxV';