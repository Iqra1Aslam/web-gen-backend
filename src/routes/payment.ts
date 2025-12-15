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
      basic: { credits:142, price: 499 }, // $2.50
      pro: { credits: 284, price: 999},   
      premium: { credits: 568, price: 1999 } 
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

router.get('/api/confirm-payment', async (req: Request, res: Response): Promise<any> => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

    // Retrieve session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log("🔥 STRIPE SESSION METADATA:", session.metadata);

    // ❗ Prevent multiple calls
    if (session.metadata?.processed === "true") {
      console.log("⚠️ Payment already processed. No credits added again.");

      const user = await User.findById(session.metadata.userId).select("-password -__v -token");

      return res.json({
        message: "Payment already processed",
        creditsAdded: 0,
        user
      });
    }

    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || "0");

    console.log("➡️ Extracted userId:", userId);
    console.log("➡️ Credits:", credits);

    if (!userId) return res.status(400).json({ error: "User ID missing" });

    // Fetch user
    const user = await User.findById(userId).select("-password -__v -token");

    console.log("🧪 User found:", user);

    if (user) {
      user.credits += credits;
      await user.save();
      console.log(`✔️ Credits added. New balance: ${user.credits}`);
    }

    // 🔥 Mark payment as processed in Stripe metadata
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...session.metadata,
        processed: "true",
      },
    });

    res.json({
      message: "Payment processed successfully",
      creditsAdded: credits,
      user
    });

  } catch (error: any) {
    console.error("❌ Error in payment confirm:", error.message);
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

export default router;