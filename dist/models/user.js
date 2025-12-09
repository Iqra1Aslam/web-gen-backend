"use strict";
// import { Schema, model, Document } from "mongoose";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
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
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
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
    credits: { type: Number, default: 5 }, // e.g., 5 free credits per month
    lastCreditReset: { type: Date, default: new Date() },
});
exports.User = (0, mongoose_1.model)("User", userSchema);
