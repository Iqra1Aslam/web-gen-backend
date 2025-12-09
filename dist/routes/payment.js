"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const user_1 = require("../models/user");
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
const router = (0, express_1.Router)();
router.post('/api/create-checkout', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const { userId, creditsPackage } = req.body;
        const { userId, creditsPackage } = req.body;
        console.log("userId", userId);
        // Define credit packages
        const packages = {
            basic: { credits: 500, price: 399 }, // $3.99
            pro: { credits: 1500, price: 999 }, // $9.99
            premium: { credits: 3000, price: 1999 } // $19.99
        };
        const selected = packages[creditsPackage];
        if (!selected) {
            return res.status(400).json({ error: 'Invalid package' });
        }
        const session = yield stripe.checkout.sessions.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Checkout creation failed' });
    }
}));
router.post('/api/webhook', express_1.default.raw({ type: 'application/json' }), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const sig = req.headers['stripe-signature'];
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId;
            const credits = parseInt(((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.credits) || '0');
            // Add credits to user
            const user = yield user_1.User.findById(userId);
            if (user) {
                user.credits += credits;
                yield user.save();
                console.log(`Added ${credits} credits to user ${userId}`);
            }
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).send(`Webhook Error: ${errorMessage}`);
    }
}));
// backend: payment.ts
router.get('/api/confirm-payment', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const sessionId = req.query.session_id;
        if (!sessionId)
            return res.status(400).json({ error: 'Missing session_id' });
        // Retrieve session from Stripe
        const session = yield stripe.checkout.sessions.retrieve(sessionId);
        const userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId;
        const credits = parseInt(((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.credits) || '0');
        if (!userId)
            return res.status(400).json({ error: 'User ID not found in session metadata' });
        // Update DB
        const user = yield user_1.User.findById(userId);
        if (user) {
            user.credits += credits;
            yield user.save();
            console.log(`Added ${credits} credits to user ${userId}`);
        }
        res.json({ creditsAdded: credits });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Payment confirmation failed' });
    }
}));
exports.default = router;
