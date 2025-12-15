"use strict";
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
const express_1 = require("express");
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
            basic: { credits: 142, price: 499 }, // $2.50
            pro: { credits: 284, price: 999 },
            premium: { credits: 568, price: 1999 }
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
router.get('/api/confirm-payment', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const sessionId = req.query.session_id;
        if (!sessionId)
            return res.status(400).json({ error: 'Missing session_id' });
        // Retrieve session
        const session = yield stripe.checkout.sessions.retrieve(sessionId);
        console.log("🔥 STRIPE SESSION METADATA:", session.metadata);
        // ❗ Prevent multiple calls
        if (((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.processed) === "true") {
            console.log("⚠️ Payment already processed. No credits added again.");
            const user = yield user_1.User.findById(session.metadata.userId).select("-password -__v -token");
            return res.json({
                message: "Payment already processed",
                creditsAdded: 0,
                user
            });
        }
        const userId = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.userId;
        const credits = parseInt(((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.credits) || "0");
        console.log("➡️ Extracted userId:", userId);
        console.log("➡️ Credits:", credits);
        if (!userId)
            return res.status(400).json({ error: "User ID missing" });
        // Fetch user
        const user = yield user_1.User.findById(userId).select("-password -__v -token");
        console.log("🧪 User found:", user);
        if (user) {
            user.credits += credits;
            yield user.save();
            console.log(`✔️ Credits added. New balance: ${user.credits}`);
        }
        // 🔥 Mark payment as processed in Stripe metadata
        yield stripe.checkout.sessions.update(sessionId, {
            metadata: Object.assign(Object.assign({}, session.metadata), { processed: "true" }),
        });
        res.json({
            message: "Payment processed successfully",
            creditsAdded: credits,
            user
        });
    }
    catch (error) {
        console.error("❌ Error in payment confirm:", error.message);
        res.status(500).json({ error: "Payment confirmation failed" });
    }
}));
exports.default = router;
