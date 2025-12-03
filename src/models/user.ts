import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
 name?: string;
  email?: string;
  password?: string;
  oauthProvider?: string;
  oauthId?: string;
}

const userSchema = new Schema<IUser>({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  oauthProvider: { type: String },
  oauthId: { type: String },
});

export const User = model<IUser>("User", userSchema);
