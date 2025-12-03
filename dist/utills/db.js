"use strict";
// import { MongoClient, Db, Collection } from "mongodb";
// import dotenv from "dotenv";
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
exports.connectDB = void 0;
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
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const conn = yield mongoose_1.default.connect(process.env.MONGO_URI || '');
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
});
exports.connectDB = connectDB;
