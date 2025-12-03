// import { MongoClient, Db, Collection } from "mongodb";
// import dotenv from "dotenv";

// dotenv.config();

// const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
// const DB_NAME = process.env.DB_NAME || "";

// let client: MongoClient;
// let db: Db;

// export let usersCollection: Collection;

// // Connect to MongoDB
// export const connectDB = async () => {
//   try {
//     client = new MongoClient(MONGO_URI);
//     await client.connect();

//     db = client.db(DB_NAME);

//     // Collections
//     usersCollection = db.collection("users");

//     console.log(`📌 MongoDB connected: ${DB_NAME}`);
//   } catch (error) {
//     console.error("❌ MongoDB connection error:", error);
//     process.exit(1);
//   }
// };

import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || '');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};
