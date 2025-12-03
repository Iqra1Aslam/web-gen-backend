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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = require("../models/user");
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const passport_github2_1 = require("passport-github2");
const google_auth_library_1 = require("google-auth-library");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "secret";
// SIGNUP
router.post("/signup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: " Name, Email and password required" });
        }
        const existingUser = yield user_1.User.findOne({ email });
        if (existingUser)
            return res.status(400).json({ message: "User already exists" });
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const newUser = new user_1.User({ name, email, password: hashedPassword });
        yield newUser.save();
        res.status(201).json({ message: "User created successfully" });
    }
    catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: "Server error", error: err });
    }
}));
// SIGNIN
router.post("/signin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        const user = yield user_1.User.findOne({ email });
        if (!user)
            return res.status(400).json({ message: "Invalid credentials" });
        if (!user.password) {
            return res.status(400).json({ message: "User has no password set" });
        }
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid credentials" });
        const token = jsonwebtoken_1.default.sign({ id: user._id }, JWT_SECRET, { expiresIn: "2h" });
        res.status(200).json({ token, user: { email: user.email, id: user._id } });
    }
    catch (err) {
        res.status(500).json({ message: "Server error" });
    }
}));
// Google Sign-In Route
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
}, (accessToken, refreshToken, profile, done) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const email = (_b = (_a = profile.emails) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value;
        if (!email)
            return done(new Error("No email found in Google profile"), undefined);
        // Find existing user
        let user = yield user_1.User.findOne({ email });
        if (!user) {
            // Create new user if not exists
            user = yield user_1.User.create({
                email,
                oauthProvider: "google",
                oauthId: profile.id,
            });
        }
        else if (!user.oauthProvider) {
            // Update oauthProvider & oauthId if missing
            user.oauthProvider = "google";
            user.oauthId = profile.id;
            yield user.save();
        }
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
})));
// Serialize/Deserialize
passport_1.default.serializeUser((user, done) => done(null, user._id));
passport_1.default.deserializeUser((id, done) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield user_1.User.findById(id);
        done(null, user);
    }
    catch (err) {
        done(err);
    }
}));
// Step 1: Redirect user to Google login
router.get("/auth/google", (req, res, next) => {
    console.log("Google auth route hit"); // ✅ log when route is called
    next(); // pass to passport
}, passport_1.default.authenticate("google", { scope: ["profile", "email"] }));
// Step 2: Google callback
// router.get(
//   "/auth/google/callback",
//   passport.authenticate("google", { failureRedirect: "/login" }),
//   (req, res) => {
//     // Login success, generate JWT or redirect
//     const user = req.user as any;
//     const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, {
//       expiresIn: "7d",
//     });
//     // Option 1: Redirect to frontend with token
//     res.redirect(`http://localhost:5173/dashboard?token=${jwtToken}`);
//     // Option 2: Send JSON (if called via fetch)
//     // res.status(200).json({ token: jwtToken, user: { id: user._id, email: user.email } });
//   }
// );
router.get("/auth/google/callback", (req, res, next) => {
    console.log("Google callback route hit"); // ✅ log when callback is called
    next();
}, passport_1.default.authenticate("google", { failureRedirect: "/login" }), (req, res) => {
    console.log("Google login successful:", req.user);
    const user = req.user;
    const jwtToken = jsonwebtoken_1.default.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });
    res.redirect(`http://localhost:5173`);
});
// GitHub OAuth
passport_1.default.use(new passport_github2_1.Strategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "/auth/github/callback",
    scope: ["user:email"],
}, (accessToken, refreshToken, profile, done) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log("GitHub Profile:", profile);
        const email = ((_b = (_a = profile.emails) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) || profile.username || "no-email@example.com";
        let user = yield user_1.User.findOne({
            oauthProvider: "github",
            oauthId: profile.id,
        });
        if (!user) {
            user = yield user_1.User.create({
                email,
                oauthProvider: "github",
                oauthId: profile.id,
            });
        }
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
})));
// Step 1: Redirect user to GitHub login
router.get('/auth/github', passport_1.default.authenticate('github'));
// Step 2: GitHub callback
router.get('/auth/github/callback', passport_1.default.authenticate('github', { failureRedirect: '/login' }), (req, res) => {
    const user = req.user;
    const jwtToken = jsonwebtoken_1.default.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    // Redirect to frontend with token
    res.redirect(`http://localhost:5173`);
});
exports.default = router;
