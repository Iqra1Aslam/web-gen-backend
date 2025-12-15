import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import path from "path";

dotenv.config();
import {defaultPrompt, getSystemPrompt } from './prompts.js';
const multer = require('multer');
const cors = require('cors');
import axios from "axios";
import { TextServiceClient} from "@google-ai/generativelanguage";

import { createRepo } from './controllers/githubContrller.js';

import { generateText } from 'ai';
import OpenAI from "openai";
import session from "express-session";
import passport from "passport";
import helmet from "helmet";



import authRoutes from "./routes/auth";
import payRoutes from "./routes/payment.js"
import { connectDB} from './utills/db.js';
import Groq from 'groq-sdk';
import { User } from './models/user.js';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});
const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "mysecret",
  resave: false,
  saveUninitialized: false,
  // cookie: { secure: false } // set true if using HTTPS
   cookie: {
     secure: false, // only HTTPS in prod
      maxAge: 10 * 60 * 1000, // 10 minutes
      httpOnly: true,
      sameSite: "lax",
    },
}));
// app.use(helmet());
// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
    origin: function (origin: any, callback: any) {
        // Allow all origins if env says "*"
    if (process.env.ALLOWED_ORIGINS === "*") {
      return callback(null, true);
    }
    if (!origin) return callback(null, true); // allow tools like Postman

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS blocked"));
  },
  credentials: true,
}));

app.use(express.json());
// ✅ IMPORTANT: Order matters!
app.use(cookieParser());
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY as string });

const upload = multer({ storage: multer.memoryStorage() });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
// app.post('/api/generate', upload.single('image'), async (req, res) => {
//   try {
//     const userprompt = req.body.prompt;
    
//     if (!userprompt) {
//       res.status(400).json({ error: 'Prompt is required' });
//       return;
//     }
    
//     const systemPrompt = getSystemPrompt();
    
//     let baseImage = null;
//     let mimeType = null;

//     // Check if an image uploaded
//     if (req.file) {
//       const imageBuffer = req.file.buffer;
//       mimeType = req.file.mimetype;
//       baseImage = imageBuffer.toString("base64");
//     }

//     // Construct the user message
//     const userMessage = `Here is an artifact that contains all files of the project visible to you.
// Consider the contents of ALL files in the project.

// ${defaultPrompt}

// Here is a list of files that exist on the file system but are not being shown to you:

//   - .gitignore
//   - package-lock.json
  
// User prompt: ${userprompt}`;

//     // Build messages array
//     const messages: any[] = [
//       {
//         role: "system",
//         content: systemPrompt,
//       }
//     ];

//     // Groq API currently supports vision with llama-3.2-90b-vision-preview
//     // For text-only, use other models like llama-3.1-70b-versatile
    
//     if (baseImage && mimeType) {
//       // Use vision model for images
//       messages.push({
//         role: "user",
//         content: [
//           { 
//             type: "text", 
//             text: userMessage 
//           },
//           {
//             type: "image_url",
//             image_url: {
//               url: `data:${mimeType};base64,${baseImage}`
//             }
//           }
//         ]
//       });

//       // Use vision-capable model
//       const response = await groq.chat.completions.create({
//         model: "llama-3.3-70b-specdec", // Vision model
//         messages,
//         temperature: 0.1,
//         top_p: 0.95,
//         max_tokens: 8000,
//       });

//       const generatedText = response.choices[0].message?.content || '';
//       const tokensUsed = response.usage?.total_tokens || 0;

//       console.log("Generated text:", generatedText);
//       console.log("Generated text tokens:", tokensUsed);

//       res.status(200).json({
//         steps: generatedText,
//         basefiles: defaultPrompt,
//         tokensUsed,
//         model: "llama-3.2-90b-code"
//       });

//     } else {
//       // Text-only request - use faster, more capable text model
//       messages.push({
//         role: "user",
//         content: userMessage
//       });

//       const response = await groq.chat.completions.create({
//         model: "llama-3.3-70b-versatile", // Fast text model (or use llama-3.1-70b-versatile)
//         messages,
//         temperature: 0.1,
//         top_p: 0.95,
//         max_tokens: 6000,
//       });

//       const generatedText = response.choices[0].message?.content || '';
//       const tokensUsed = response.usage?.total_tokens || 0;
      
//       console.log("Generated text:", generatedText);
//       console.log("Generated text tokens:", tokensUsed);

//       res.status(200).json({
//         steps: generatedText,
//         basefiles: defaultPrompt,
//         tokensUsed,
//         model: "llama-3.3-70b-versatile"
//       });
//     }
    
//   } catch (error) {
//     console.error('Error generating website:', error);
//     res.status(500).json({ 
//       error: 'Failed to generate website',
//       details: error instanceof Error ? error.message : String(error)
//     });
//   }
// });

app.post("/api/auto-fix", async (req: Request, res: Response): Promise<any> => {
  try {
    const { errorLog, projectFiles } = req.body;

    if (!errorLog || !projectFiles) {
      return res.status(400).json({ error: "errorLog and projectFiles are required" });
    }

    const systemPrompt = `
You are an expert automated code fixer.
Your job:
- Read the user's project files
- Analyze the error log
- Fix ONLY the required files
- Return full updated file content

Output ONLY JSON:
[
  { "name": "filename", "path": "/full/path", "content": "FULL UPDATED CODE" }
]
`;

    const userMessage = `
The website failed after generation.

Here is the ERROR LOG:
${errorLog}

Here are the PROJECT FILES:
${JSON.stringify(projectFiles)}
`;
// Build messages array
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt,
      }
    ];
      const response = await groq.chat.completions.create({
        model: "llama-3.2-90b-code", // Vision model
        messages,
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: 6000,
      });
    // const response = await openai.chat.completions.create({
    //   model: "x-ai/grok-code-fast-1",
    //   messages: [
    //     { role: "system", content: systemPrompt },
    //     { role: "user", content: userMessage }
    //   ],
    //   temperature: 0.1,
    //   max_tokens: 6000
    // });

    const aiOutput = response.choices[0].message?.content || "";
    let fixedFiles;

    try {
      fixedFiles = JSON.parse(aiOutput);
    } catch (err) {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: aiOutput
      });
    }

    res.json({ fixedFiles });

  } catch (error) {
    console.error("Auto-fix error:", error);
    res.status(500).json({ error: "Failed to auto-fix", details: error });
  }
});


app.get("/", (req, res) => {
  res.send("Server is running! 🚀");
});

app.post("/edit-files", async (req: Request, res: Response): Promise<any> => {
  try {
    const { prompt, files } = req.body;

    if (!prompt || !files) {
      return res.status(400).json({ error: "Prompt and files are required" });
    }

   const systemMessage = `
You are a professional code editor.
You receive user's project files and a modification request.
Your job: modify ONLY the files that need to be changed.

IMPORTANT:
Each file has:
- "name"
- "path"
- "content"

You MUST return all three fields in updated files.
Do not invent paths. Copy existing "path" from the provided files.

Output strictly in this JSON format:
[
  { "name": "filename", "path": "/full/path/to/file", "content": "FULL UPDATED FILE CONTENT" }
]

Do not include explanations or comments.
`;


    const messages = [
      { role: "system" as const, content: systemMessage },
      { role: "user" as const, content: `User Request:\n${prompt}` },
      { role: "user" as const, content: `Project Files:\n${JSON.stringify(files)}` }
    ];

  
      const response = await groq.chat.completions.create({
         model: "llama-3.3-70b-versatile", 
        messages,
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: 6000,
      });

    const content = response.choices[0].message?.content || "";

    let updatedFiles;
    try {
      updatedFiles = JSON.parse(content);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: content,
      });
    }
    console.log("Generated updated text:",updatedFiles);
    return res.json({ updatedFiles });

  } catch (error) {
    console.error("edit-files error:", error);
    return res.status(500).json({ error: "Failed to edit files." });
  }
});





console.log("Loaded MONGO_URI:", process.env.MONGO_URI);

// Connect to DB
connectDB();
console.log('connection established');
// Routes
app.use("/", authRoutes);
app.use("/pay",payRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// const MONTHLY_CREDITS = 5;

// export const resetUserCreditsIfNeeded = async (userId: string) => {
//   const user = await User.findById(userId);
//   if (!user) throw new Error("User not found");

//   const now = new Date();
//   const lastReset = new Date(user.lastCreditReset);

//   const isNewMonth =
//     now.getFullYear() > lastReset.getFullYear() ||
//     now.getMonth() > lastReset.getMonth();

//   if (isNewMonth) {
//     user.credits = MONTHLY_CREDITS;       // Reset to monthly allowance
//     user.lastCreditReset = now;           // Update reset date
//     await user.save();
//   }

//   return user.credits;
// };
// export const useUserCredit = async (userId: string) => {
//   const credits = await resetUserCreditsIfNeeded(userId);

//   if (credits <= 0) {
//     throw new Error("No credits left for this month");
//   }

//   const user = await User.findById(userId);
//   if (!user) {
//   throw new Error("User not found");
// }
//   user.credits -= 1;
//   await user.save();

//   return user.credits; // Return remaining credits
// };



// Pricing per 1M tokens
const INPUT_PRICE = 0.10;
const OUTPUT_PRICE = 0.40;
// $0.40 / 1,000,000 * 70,000 = $0.028

// Convert USD → credits
const CREDIT_VALUE = 0.02; // $0.02 = 1 credit
// Reset monthly credits
function resetMonthlyCreditsIfNeeded(user: any) {
  const now = new Date();

  if (!user.lastCreditReset) {
    user.lastCreditReset = now;
    user.credits = 5;
    return;
  }

  const last = new Date(user.lastCreditReset);
  const monthChanged =
    last.getMonth() !== now.getMonth() ||
    last.getFullYear() !== now.getFullYear();

  if (monthChanged) {
    user.credits = 5; // Free 5 every month
    user.lastCreditReset = now;
  }
}
app.post('/api/generates', upload.single('image'),  async (req, res): Promise<any> => {
  try {
    const { prompt: userprompt, userId} = req.body;

    if (!userprompt) return res.status(400).json({ error: 'Prompt is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    resetMonthlyCreditsIfNeeded(user);

    if (user.credits <= 0) return res.status(403).json({ error: 'Not enough credits' });

    // Include image as base64 in the prompt (optional)
    let finalPrompt = userprompt;
    if (req.file) {
      const base64Image = req.file.buffer.toString('base64');
      finalPrompt += `\n[Attached image: data:${req.file.mimetype};base64,${base64Image}]`;
    }
// const generatedText = json.candidates?.[0]?.content?.[0]?.text || "";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const systemPrompt = getSystemPrompt();

const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    {
      role: "user",
      parts: [{ text: finalPrompt }],
    },
  ],
  config: {
    temperature: 0.1,
    maxOutputTokens: 8000,
  },
});

// const response = await ai.models.generateContent({
//   model: "gemini-2.0-flash",
//   contents: [
//     {
//       role: "user",
//        parts: [{ text: finalPrompt }],
//     },
//   ],
// });
console.log(response);

const generatedText =
  response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

console.log("Generated text:", generatedText);

const TOKENS_PER_CREDIT = 70000;

//   // --- Credit calculation ---
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE;
    const totalCostUSD = inputCost + outputCost;
    console.log("total Cost USD",totalCostUSD)
    const creditUsages= totalCostUSD / CREDIT_VALUE;
    console.log("credit usage per USD",creditUsages)
    const creditUsage = totalTokens / TOKENS_PER_CREDIT;
     console.log("credit usage",creditUsage)
    if (user.credits < creditUsage) return res.status(403).json({ error: "Not enough credits" });
    user.totalInputTokens += inputTokens;
    user.totalOutputTokens += outputTokens;
        user.totalTokens += totalTokens;
    user.credits -= creditUsage;
    await user.save();
    return res.json({
      steps: generatedText,
      tokens: { inputTokens, outputTokens,
    totalTokens,},
      costUSD: totalCostUSD,
      creditsUsed: creditUsage,
      creditsRemaining: user.credits
     
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Generation failed" });
  }
});

