// import { Schema, model, Document } from "mongoose";

// export interface IUser extends Document {
//  name?: string;
//   email?: string;
//   password?: string;
//   oauthProvider?: string;
//   oauthId?: string;
// }

// const userSchema = new Schema<IUser>({
//   name: { type: String },
//   email: { type: String, required: true, unique: true },
//   password: { type: String },
//   oauthProvider: { type: String },
//   oauthId: { type: String },
// });

// export const User = model<IUser>("User", userSchema);
import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  name?: string;
  email: string;
  password?: string;
  oauthProvider?: string;
  oauthId?: string;

  otp?: string | null;
  otpExpire?: Date | null;
  otpAttempts?: number; // optional – use for security

  credits: number;               // Current available credits
  lastCreditReset: Date;         // Last reset date
  
}

const userSchema = new Schema<IUser>({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },

  oauthProvider: { type: String },
  oauthId: { type: String },

  // ⭐ Added for OTP login
  otp: { type: String, default: null },
  otpExpire: { type: Date, default: null },

  // (Optional) Prevent brute force attacks
  otpAttempts: { type: Number, default: 0 },
  credits: { type: Number, default: 5 },          // e.g., 5 free credits per month
  lastCreditReset: { type: Date, default: new Date() },
});

export const User = model<IUser>("User", userSchema);
