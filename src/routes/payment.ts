import express, { Router, Request, Response } from "express";
import Stripe from 'stripe';
import { User } from "../models/user";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!,
//      {
//   apiVersion: '2024-11-20.acacia'
// }
);
const router = Router();
router.post('/api/create-checkout', async (req: Request, res: Response): Promise<any> => {
  try {
    // const { userId, creditsPackage } = req.body;
    const { userId, creditsPackage } = req.body as { 
      userId: string; 
      creditsPackage: 'basic' | 'pro' | 'premium' 
    };
    console.log("userId",userId);
    // Define credit packages
    const packages = {
      basic: { credits: 500, price: 399 }, // $3.99
      pro: { credits: 1500, price: 999},   // $9.99
      premium: { credits: 3000, price: 1999 } // $19.99
    };

    const selected = packages[creditsPackage];
    if (!selected) {
      return res.status(400).json({ error: 'Invalid package' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${selected.credits} Credits`,
            description: 'AI Generation Credits'
          },
          unit_amount: selected.price // Amount in cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
      metadata: {
        userId: userId,
        credits: selected.credits.toString()
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Checkout creation failed' });
  }
});
router.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const userId = session.metadata?.userId;
      const credits = parseInt(session.metadata?.credits || '0');

      // Add credits to user
      const user = await User.findById(userId);
      if (user) {
        user.credits += credits;
        await user.save();
        
        console.log(`Added ${credits} credits to user ${userId}`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).send(`Webhook Error: ${errorMessage}`);
  }
});
// backend: payment.ts
router.get('/api/confirm-payment', async (req: Request, res: Response): Promise<any> => {
  try {

    const sessionId = req.query.session_id as string;
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || '0');

    if (!userId) return res.status(400).json({ error: 'User ID not found in session metadata' });

    // Update DB
    const user = await User.findById(userId);
    if (user) {
      user.credits += credits;
      await user.save();
      console.log(`Added ${credits} credits to user ${userId}`);
    }

    res.json({ creditsAdded: credits });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

export default router;