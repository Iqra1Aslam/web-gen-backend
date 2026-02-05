import express, { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { createClient } from 'pexels';

import path from "path";

dotenv.config();
import { defaultPrompt, getSystemPrompt } from "./prompts.js";
const multer = require("multer");
const cors = require("cors");
import axios from "axios";

import session from "express-session";
import passport from "passport";
import helmet from "helmet";

import authRoutes from "./routes/auth";
import payRoutes from "./routes/payment.js";
import { connectDB } from "./utills/db.js";

import { User } from "./models/user.js";

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Initialize Pexels client with validation
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
  throw new Error('PEXELS_API_KEY is not defined in environment variables');
}
const pexelsClient = createClient(PEXELS_API_KEY);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:5173",
];
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
// Session middleware
app.use(
  session({
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
  })
);
// app.use(helmet());
// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
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
  })
);

app.use(express.json());
// ✅ IMPORTANT: Order matters!
app.use(cookieParser());
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY as string });

const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/auto-fix", async (req: Request, res: Response): Promise<any> => {
  try {
    const { errorLog, projectFiles } = req.body;

    if (!errorLog || !projectFiles) {
      return res
        .status(400)
        .json({ error: "errorLog and projectFiles are required" });
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

No markdown. No explanations.
`;

    const finalPrompt = `
The website failed after generation.

ERROR LOG:
${errorLog}

PROJECT FILES:
${JSON.stringify(projectFiles)}
`;

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
   // 🔍 LOG FULL RESPONSE
console.log(
  "FULL GEMINI RESPONSE:",
  JSON.stringify(response, null, 2)
);
   let content = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    content = content.replace(/```json\s*([\s\S]*?)```/, "$1").trim();
    let fixedFiles;
    try {
      fixedFiles = JSON.parse(content);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: content,
      });
    }

    console.log("Auto-fixed files:", fixedFiles);
    return res.json({ fixedFiles });
  } catch (error) {
    console.error("Auto-fix error:", error);
    return res.status(500).json({
      error: "Failed to auto-fix",
      details: error instanceof Error ? error.message : error,
    });
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

    console.log("Prompt:", prompt);
    console.log("Files count:", files.length);

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

    const finalPrompt = `
User Request:
${prompt}

Project Files:
${JSON.stringify(files)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: systemMessage }],
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
   
    // 🔍 Log the full Gemini response
    console.log("FULL GEMINI RESPONSE:", JSON.stringify(response, null, 2));

    let content = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
     console.log("GEMINI TEXT OUTPUT:\n", content);
  content = content.replace(/```json\s*([\s\S]*?)```/, "$1").trim();

// Extract JSON array just in case Gemini added extra text
const match = content.match(/\[[\s\S]*\]/);
if (!match) {
  return res.status(500).json({
    error: "Gemini did not return valid JSON array",
    raw: content,
  });
}

let updatedFiles;
try {
  updatedFiles = JSON.parse(match[0]);
} catch (err) {
  return res.status(500).json({
    error: "Failed to parse JSON",
    raw: match[0],
  });
}

console.log("Generated updated files:", updatedFiles);
return res.json({ updatedFiles });

    // if (!content) {
    //   return res.status(500).json({
    //     error: "Empty response from Gemini",
    //     raw: response,
    //   });
    // }

    // let updatedFiles;
    // try {
    //   updatedFiles = JSON.parse(content);
    // } catch {
    //   return res.status(500).json({
    //     error: "AI returned invalid JSON",
    //     raw: content,
    //   });
    // }

    // console.log("Generated updated files:", updatedFiles);
    // return res.json({ updatedFiles });
  } catch (error) {
    console.error("edit-files error:", error);
    return res.status(500).json({ error: "Failed to edit files." });
  }
});

console.log("Loaded MONGO_URI:", process.env.MONGO_URI);

// Connect to DB
connectDB();
console.log("connection established");
// Routes
app.use("/", authRoutes);
app.use("/pay", payRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// const MONTHLY_CREDITS = 5;

// Pricing per 1M tokens
const INPUT_PRICE = 0.1;
const OUTPUT_PRICE = 0.4;
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

// Helper function to fetch images from Pexels
async function fetchPexelsImages(query: string, perPage: number = 5) {
  if (!pexelsClient) {
    console.warn('Pexels client not initialized. Skipping image fetch.');
    return [];
  }
  
  try {
    const response = await pexelsClient.photos.search({
      query,
      per_page: perPage,
      orientation: 'landscape'
    });
    
    if ('photos' in response) {
      return response.photos.map(photo => ({
        id: photo.id,
        url: photo.src.large,
        thumbnail: photo.src.medium,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url
      }));
    }
    return [];
  } catch (error) {
    console.error('Pexels API error:', error);
    return [];
  }
}

// Helper function to extract image queries from user prompt
function extractImageQueries(prompt: string): string[] {
  const queries: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  console.log('Analyzing prompt for image queries:', prompt);
  
  // Look for patterns like "with images of X" or "showing X" or "photos of X"
  const patterns = [
    /with images of ([^,.]+)/gi,
    /showing ([^,.]+)/gi,
    /photos of ([^,.]+)/gi,
    /pictures of ([^,.]+)/gi,
    /image of ([^,.]+)/gi,
    /include images of ([^,.]+)/gi,
  ];
  
  patterns.forEach(pattern => {
    const matches = prompt.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        queries.push(match[1].trim());
      }
    }
  });
  
  // If no specific patterns found, try to extract main subject
  if (queries.length === 0) {
    // Extract keywords like "coffee shop", "gym", "restaurant", etc.
    const subjectPatterns = [
      /(?:for a|about a|of a|create a|build a|make a|design a|develop a)\s+([a-z\s]+?)(?:\s+website|\s+landing page|\s+page|\s+app|\s+site|\s+portal|\s+platform)/i,
      /(?:website|landing page|page|site)\s+(?:for|about)\s+(?:a\s+)?([a-z\s]+)/i,
    ];
    
    for (const pattern of subjectPatterns) {
      const match = prompt.match(pattern);
      if (match && match[1]) {
        queries.push(match[1].trim());
        break;
      }
    }
  }
  
  // Fallback: Look for common website types
  if (queries.length === 0) {
    const websiteTypes = [
    "Landing Page",
    "Portfolio",
    "E-commerce",
    "Blog",
    "Dashboard",
    "Corporate Website",
    "Restaurant Menu",
    "Photography Gallery",
    "Music Player",
    "Social Media App",
    "News Portal",
    "Travel Blog",
    "Fashion Store",
    "Tech Startup",
    "Real Estate",
    "Educational Platform",
    "Fitness Tracker",
    "Recipe Blog",
    "Art Gallery",
    "Event Planning",
    "Medical Clinic",
    "Law Firm",
    "Gaming Website",
    "Crypto Exchange",
    "Streaming Platform",
    "Job Board",
    "Wedding Planner",
    "Pet Care",
    "Interior Design",
    "Car Dealership",
    "Food Delivery",
    "Banking App",
    "Weather App",
    "Calendar App",
    "Chat Application",
    "Video Conference",
  ];
    for (const type of websiteTypes) {
      if (lowerPrompt.includes(type)) {
        queries.push(type);
        break;
      }
    }
  }
  
  console.log('Extracted image queries:', queries);
  return queries;
}

app.post(
  "/api/generates",
  upload.single("image"),
  async (req, res): Promise<any> => {
    try {
      const { prompt: userprompt, userId,fetchImages = true  } = req.body;

      if (!userprompt)
        return res.status(400).json({ error: "Prompt is required" });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      resetMonthlyCreditsIfNeeded(user);

      if (user.credits <= 0)
        return res.status(403).json({ error: "Not enough credits" });
      // Dynamically fetch images based on user prompt (enabled by default)
      let pexelsImages: any[] = [];
      
      if (fetchImages === true) { // Explicitly check for true
        const imageQueries = extractImageQueries(userprompt);
        
        if (imageQueries.length > 0) {
          console.log('Fetching images for queries:', imageQueries);
          
          // Fetch images for each query (limit to first 2 queries to avoid too many requests)
          const imagePromises = imageQueries.slice(0, 2).map(query => 
            fetchPexelsImages(query, 3)
          );
            
          const imageResults = await Promise.all(imagePromises);
          pexelsImages = imageResults.flat();
          
          console.log(`Fetched ${pexelsImages.length} images from Pexels`);
        }
      }
      // Include image as base64 in the prompt (optional)
      let finalPrompt = userprompt;
      // Add Pexels images to prompt if available
      if (pexelsImages.length > 0) {
        finalPrompt += `\n\n[Available stock images from Pexels:\n${pexelsImages.map((img, idx) => 
          `${idx + 1}. ${img.url} (Photo by ${img.photographer})`
        ).join('\n')}]\n\nIMPORTANT: Use these high-quality stock photo URLs in your generated website HTML. Include proper attribution as HTML comments near each image: <!-- Photo by ${pexelsImages[0].photographer} from Pexels -->`;
      }
      if (req.file) {
        const base64Image = req.file.buffer.toString("base64");
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
      console.log("total Cost USD", totalCostUSD);
      const creditUsages = totalCostUSD / CREDIT_VALUE;
      console.log("credit usage per USD", creditUsages);
      const creditUsage = totalTokens / TOKENS_PER_CREDIT;
      console.log("credit usage", creditUsage);
      if (user.credits < creditUsage)
        return res.status(403).json({ error: "Not enough credits" });
      user.totalInputTokens += inputTokens;
      user.totalOutputTokens += outputTokens;
      user.totalTokens += totalTokens;
      user.credits -= creditUsage;
      await user.save();
      
      return res.json({
        steps: generatedText,
        images: pexelsImages,
        tokens: { inputTokens, outputTokens, totalTokens },
        costUSD: totalCostUSD,
        creditsUsed: creditUsage,
        creditsRemaining: user.credits,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Generation failed" });
    }
  }
);
app.post(
  "/api/generate",
  upload.single("image"),
  async (req, res): Promise<any> => {
    console.log("🔥 /api/generates hit");

    try {
      console.log("➡️ Request body:", req.body);
      console.log("➡️ File received:", req.file ? "YES" : "NO");

      const { prompt: userprompt, userId, fetchImages = true } = req.body;

      if (!userprompt) {
        console.error("❌ Prompt missing");
        return res.status(400).json({ error: "Prompt is required" });
      }

      console.log("➡️ Finding user:", userId);
      const user = await User.findById(userId);

      if (!user) {
        console.error("❌ User not found:", userId);
        return res.status(404).json({ error: "User not found" });
      }

      console.log("✅ User found, credits:", user.credits);

      resetMonthlyCreditsIfNeeded(user);

      if (user.credits <= 0) {
        console.error("❌ Insufficient credits");
        return res.status(403).json({ error: "Not enough credits" });
      }

      // ---------------- IMAGES ----------------
      let pexelsImages: any[] = [];

      console.log("➡️ fetchImages flag:", fetchImages, typeof fetchImages);

      if (fetchImages === true || fetchImages === "true") {
        console.log("➡️ Extracting image queries from prompt");

        const imageQueries = extractImageQueries(userprompt);
        console.log("➡️ Image queries:", imageQueries);

        if (imageQueries.length > 0) {
          console.log("➡️ Fetching images from Pexels...");

          const imagePromises = imageQueries
            .slice(0, 2)
            .map(query => fetchPexelsImages(query, 3));

          const imageResults = await Promise.all(imagePromises);
          pexelsImages = imageResults.flat();

          console.log("✅ Images fetched:", pexelsImages.length);
        }
      }

      // ---------------- PROMPT ----------------
      let finalPrompt = userprompt;

      if (pexelsImages.length > 0) {
        console.log("➡️ Appending Pexels images to prompt");

        finalPrompt += `\n\n[Available stock images from Pexels:\n${pexelsImages
          .map(
            (img, idx) =>
              `${idx + 1}. ${img.url} (Photo by ${img.photographer})`
          )
          .join("\n")}]\n\nIMPORTANT: Include attribution comments.`;
      }

      if (req.file) {
        console.log("➡️ Converting uploaded image to base64");

        const base64Image = req.file.buffer.toString("base64");
        finalPrompt += `\n[Attached image: data:${req.file.mimetype};base64,${base64Image}]`;
      }

      // ---------------- AI CALL ----------------
      console.log("➡️ Initializing Gemini AI");

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const systemPrompt = getSystemPrompt();

      console.log("➡️ Sending prompt to Gemini");
      console.log("📤 Prompt length:", finalPrompt.length);

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "user", parts: [{ text: finalPrompt }] },
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: 8000,
        },
      });

      console.log("✅ Gemini response received");

      const generatedText =
        response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      console.log("📝 Generated text length:", generatedText.length);

      // ---------------- TOKENS & CREDITS ----------------
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = inputTokens + outputTokens;

      console.log("🔢 Tokens:", {
        inputTokens,
        outputTokens,
        totalTokens,
      });

      const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE;
      const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE;
      const totalCostUSD = inputCost + outputCost;

      console.log("💰 Cost USD:", totalCostUSD);

      const TOKENS_PER_CREDIT = 70000;
      const creditUsage = totalTokens / TOKENS_PER_CREDIT;

      console.log("💳 Credit usage:", creditUsage);

      if (user.credits < creditUsage) {
        console.error("❌ Credits not sufficient AFTER generation");
        return res.status(403).json({ error: "Not enough credits" });
      }

      user.totalInputTokens += inputTokens;
      user.totalOutputTokens += outputTokens;
      user.totalTokens += totalTokens;
      user.credits -= creditUsage;

      await user.save();
      console.log("✅ User credits updated");

      return res.json({
        steps: generatedText,
        images: pexelsImages,
        tokens: { inputTokens, outputTokens, totalTokens },
        costUSD: totalCostUSD,
        creditsUsed: creditUsage,
        creditsRemaining: user.credits,
      });
    } catch (error: any) {
      console.error("🔥🔥 GENERATION ERROR 🔥🔥");
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      console.error("Full error:", error);

      return res.status(500).json({
        error: "Generation failed",
        message: error?.message,
      });
    }
  }
);

