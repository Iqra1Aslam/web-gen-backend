import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from 'passport-github2';

import { OAuth2Client } from 'google-auth-library';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

interface SignInRequest {
  name:string;
  email: string;
  password: string;
}

// SIGNUP
router.post("/signup", async (req: Request, res: Response): Promise<any> => {
  try {
    const { name,email, password }: SignInRequest = req.body;
       if ( !name|| !email || !password) {
      return res.status(400).json({ message: " Name, Email and password required" });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({name, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

// SIGNIN
router.post("/signin", async (req: Request, res: Response) : Promise<any> => {
  try {
    const { email, password }: SignInRequest = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (!user.password) {
  return res.status(400).json({ message: "User has no password set" });
}

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "2h" });

    res.status(200).json({ token, user: { email: user.email, id: user._id } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Google Sign-In Route

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: "/auth/google/callback",
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        // This function runs after Google sends back the user's info
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email found in Google profile"), undefined);

        // Find existing user
        let user = await User.findOne({ email });

        if (!user) {
          // Create new user if not exists
          user = await User.create({
            email,
            oauthProvider: "google",
            oauthId: profile.id,
          });
        } else if (!user.oauthProvider) {
          // Update oauthProvider & oauthId if missing
          user.oauthProvider = "google";
          user.oauthId = profile.id;
          await user.save();
        }
        // tells Passport authentication succeeded.
        return done(null, user);
      } catch (err) {
        return done(err as any);
      }
    }
  )
);

// Serialize/Deserialize
passport.serializeUser((user: any, done) => done(null, user._id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});
// Step 1: Redirect user to Google login
router.get(
  "/auth/google",
  (req, res, next) => {
    console.log("Google auth route hit"); // ✅ log when route is called
    next(); // pass to passport
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);


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
router.get(
  "/auth/google/callback",
  (req, res, next) => {
    console.log("Google callback route hit"); // ✅ log when callback is called
    next();
  },
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    console.log("Google login successful:", req.user);
    const user = req.user as any;
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });
    res.redirect(`http://localhost:5173`);
  }
);
// GitHub OAuth
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: "/auth/github/callback",
      scope: ["user:email"],
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        console.log("GitHub Profile:", profile);

        const email = profile.emails?.[0]?.value || profile.username || "no-email@example.com";

        let user = await User.findOne({
          oauthProvider: "github",
          oauthId: profile.id,
        });

        if (!user) {
          user = await User.create({
            email,
            oauthProvider: "github",
            oauthId: profile.id,
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);
// Step 1: Redirect user to GitHub login
router.get('/auth/github', passport.authenticate('github'));

// Step 2: GitHub callback
router.get(
  '/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as any;
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    // Redirect to frontend with token
    res.redirect(`http://localhost:5173`);
  }
);


export default router;
