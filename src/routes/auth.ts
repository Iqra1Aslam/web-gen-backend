import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from 'passport-github2';
import { resend } from "../utills/resend";


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

    const user = new User({name, email, password: hashedPassword });
    await user.save();
    // --------------------------
    // 🔥 Generate OTP
    // --------------------------
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expireTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    user.otp = otp;
    user.otpExpire = expireTime;
    await user.save();

    // --------------------------
    // 🔥 Send OTP via Resend
    // --------------------------
    await resend.emails.send({
      from: process.env.SENDER_EMAIL!,
      to: user.email,
      subject: "Your Login OTP Code",
      html: `
        <h2>Your OTP Code</h2>
        <p style="font-size:24px; font-weight:bold;">${otp}</p>
        <p>This OTP will expire in 5 minutes.</p>
      `,
    });
   res.status(201).json({
  otpRequired: true,
  id: user._id,
  message: "OTP sent to your email",
  user: {
    id: user._id,
    email: user.email,
    name: user.name
  }
});

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

// SIGNIN (Step 1 - send OTP)
router.post("/signin", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password }: SignInRequest = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.password) {
      return res.status(400).json({ message: "User has no password set" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    
   

    return res.status(200).json({
      name:user.name,
      email: user.email,
       id: user._id
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify-signin-otp", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ message: "Email & OTP required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (!user.otpExpire || Date.now() > user.otpExpire.getTime())
      return res.status(400).json({ message: "OTP expired" });

    // Clear OTP after success
    user.otp = null;
    user.otpExpire = null;
    await user.save();

    // Issue JWT Token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: "2h",
    });

    res.status(200).json({
      success: true,
      message: "OTP Verified. Login successful.",
      token,
      user: { email: user.email, id: user._id },
    });

  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Google Sign-In Route

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
      proxy: true, // Important for tunnels
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
            name: profile.displayName,
            email,
            oauthProvider: "google",
            oauthId: profile.id,
          });
        } else if (!user.oauthProvider) {
          // Update oauthProvider & oauthId if missing
          user.name = profile.displayName;
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
      expiresIn: "10m",
    });
    
    
   const session = req.session as any;
session.userId = user._id;
 session.name=user.name,
session.email=user.email,
// session.jwt = jwtToken;
   console.log("Session after login:", req.session); // ✅ check it

    res.redirect(`${process.env.FRONTEND_URL}`); // Redirect with token
  }
);
// GitHub OAuth



passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/auth/github/callback`, // ✅ Updated
      scope: ["user:email"],
      proxy: true, // ✅ Important for dev tunnels
    
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
            name: profile.displayName || profile.username,
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
    const session = req.session as any;
    session.userId = user._id;
    session.jwt = jwtToken;
    session.name=user.name,
    session.email=user.email,
    console.log("Session after GitHub login:", req.session);
     res.redirect(
  `${process.env.FRONTEND_URL}`
);

    // Redirect to frontend with token
    // res.redirect(`https://k9182qsm-5173.asse.devtunnels.ms`);
  }
);
router.get("/me", async (req: Request, res: Response): Promise<any> => {
  const session = req.session as any; // ✅ cast to any
console.log("GET /api/me called, session:", req.session);
 console.log("SESSION:", req.session);
  console.log("USER:", req.user);

  if (!req.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  // if (!session.userId) return res.status(401).json({ error: "Not logged in" });

  // if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  // ✅ Make sure this line exists and executes
  return res.json({ 
    userId: session.userId,
   name:session.name,
email:session.email
  });
});
router.post("/forgot-password", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expireTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    user.otp = otp;
    user.otpExpire = expireTime;
    await user.save();

    // Send OTP email
    await resend.emails.send({
      from: process.env.SENDER_EMAIL!,
      to: user.email,
      subject: "Reset Your Password - OTP",
      html: `
        <h2>Password Reset OTP</h2>
        <p style="font-size:24px; font-weight:bold;">${otp}</p>
        <p>This OTP will expire in 5 minutes.</p>
      `,
    });

    res.status(200).json({
      otpRequired: true,
      message: "Password reset OTP sent to your email",
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/reset-password", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        message: "Email, OTP, and new password are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (!user.otpExpire || user.otpExpire < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpire = undefined;

    await user.save();

    res.status(200).json({
      message: "Password reset successfully",
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



export default router;
