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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const genai_1 = require("@google/genai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prompts_js_1 = require("./prompts.js");
const multer = require('multer');
const cors = require('cors');
const openai_1 = __importDefault(require("openai"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const auth_1 = __importDefault(require("./routes/auth"));
const payment_js_1 = __importDefault(require("./routes/payment.js"));
const db_js_1 = require("./utills/db.js");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const user_js_1 = require("./models/user.js");
const openai = new openai_1.default({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_ORIGINS = ((_a = process.env.ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',')) || ['http://localhost:5173'];
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
// Session middleware
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || "mysecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set true if using HTTPS
}));
// Passport middleware
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.use(cors({
    origin: function (origin, callback) {
        // Allow all origins if env says "*"
        if (process.env.ALLOWED_ORIGINS === "*") {
            return callback(null, true);
        }
        if (!origin)
            return callback(null, true); // allow tools like Postman
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("CORS blocked"));
    },
    credentials: true,
}));
app.use(express_1.default.json());
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });
const groq = new groq_sdk_1.default({
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
app.post("/api/auto-fix", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
        const messages = [
            {
                role: "system",
                content: systemPrompt,
            }
        ];
        const response = yield groq.chat.completions.create({
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
        const aiOutput = ((_a = response.choices[0].message) === null || _a === void 0 ? void 0 : _a.content) || "";
        let fixedFiles;
        try {
            fixedFiles = JSON.parse(aiOutput);
        }
        catch (err) {
            return res.status(500).json({
                error: "AI returned invalid JSON",
                raw: aiOutput
            });
        }
        res.json({ fixedFiles });
    }
    catch (error) {
        console.error("Auto-fix error:", error);
        res.status(500).json({ error: "Failed to auto-fix", details: error });
    }
}));
app.get("/", (req, res) => {
    res.send("Server is running! 🚀");
});
app.post("/edit-files", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
            { role: "system", content: systemMessage },
            { role: "user", content: `User Request:\n${prompt}` },
            { role: "user", content: `Project Files:\n${JSON.stringify(files)}` }
        ];
        const response = yield groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: 0.1,
            top_p: 0.95,
            max_tokens: 6000,
        });
        const content = ((_a = response.choices[0].message) === null || _a === void 0 ? void 0 : _a.content) || "";
        let updatedFiles;
        try {
            updatedFiles = JSON.parse(content);
        }
        catch (_b) {
            return res.status(500).json({
                error: "AI returned invalid JSON",
                raw: content,
            });
        }
        console.log("Generated updated text:", updatedFiles);
        return res.json({ updatedFiles });
    }
    catch (error) {
        console.error("edit-files error:", error);
        return res.status(500).json({ error: "Failed to edit files." });
    }
}));
console.log("Loaded MONGO_URI:", process.env.MONGO_URI);
// Connect to DB
(0, db_js_1.connectDB)();
console.log('connection established');
// Routes
app.use("/", auth_1.default);
app.use("/pay", payment_js_1.default);
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
// Convert USD → credits
const CREDIT_VALUE = 0.002; // $0.002 = 1 credit
// Reset monthly credits
function resetMonthlyCreditsIfNeeded(user) {
    const now = new Date();
    if (!user.lastCreditReset) {
        user.lastCreditReset = now;
        user.credits = 5;
        return;
    }
    const last = new Date(user.lastCreditReset);
    const monthChanged = last.getMonth() !== now.getMonth() ||
        last.getFullYear() !== now.getFullYear();
    if (monthChanged) {
        user.credits = 5; // Free 5 every month
        user.lastCreditReset = now;
    }
}
// app.post('/api/generates', upload.single('image'), async (req, res): Promise<any> => {
//   try {
//     const userprompt = req.body.prompt;
//     const userId = req.body.userId;
//     if (!userprompt) {
//       return res.status(400).json({ error: 'Prompt is required' });
//     }
//     console.log("User prompt:", userprompt);
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: "User not found" });
//     resetMonthlyCreditsIfNeeded(user);
//     if (user.credits <= 0) {
//       return res.status(403).json({ error: "Not enough credits" });
//     }
//     const systemPrompt = getSystemPrompt();
//     const userMessage = `
// ${defaultPrompt}
// User prompt: ${userprompt}
// `;
//     const messages: any[] = [
//       { role: "system", content: systemPrompt }
//     ];
//     let model = "llama-3.2-90b-code";
//     // ✅ IMAGE FLOW
//     if (req.file) {
//       const baseImage = req.file.buffer.toString("base64");
//       messages.push({
//         role: "user",
//         content: [
//           { type: "text", text: userMessage },
//           {
//             type: "image_url",
//             image_url: {
//               url: `data:${req.file.mimetype};base64,${baseImage}`
//             }
//           }
//         ]
//       });
//       model = "llama-3.2-90b-vision-preview";
//     } 
//     // ✅ TEXT-ONLY FLOW
//     else {
//       messages.push({
//         role: "user",
//         content: userMessage
//       });
//     }
//     // ✅ CALL GROQ
//     const response = await groq.chat.completions.create({
//       model,
//       messages,
//       temperature: 0.1,
//       top_p: 0.95,
//       max_tokens: 8000
//     });
//     const generatedText = response.choices[0].message?.content || "";
//     const inputTokens = response.usage?.prompt_tokens ?? 0;
//     const outputTokens = response.usage?.completion_tokens ?? 0;
//     const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE;
//     const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE;
//     const totalCostUSD = inputCost + outputCost;
//     const creditUsage = Math.ceil(totalCostUSD / CREDIT_VALUE);
//     if (user.credits < creditUsage) {
//       return res.status(403).json({ error: "Not enough credits" });
//     }
//     user.credits -= creditUsage;
//     await user.save();
//     return res.json({
//       steps: generatedText,
//       tokens: { inputTokens, outputTokens },
//       cost: totalCostUSD,
//       creditsUsed: creditUsage,
//       creditsRemaining: user.credits
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: "Generation failed" });
//   }
// });
app.post('/api/generates', upload.single('image'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const { prompt: userprompt, userId } = req.body;
        if (!userprompt)
            return res.status(400).json({ error: 'Prompt is required' });
        const user = yield user_js_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        resetMonthlyCreditsIfNeeded(user);
        if (user.credits <= 0)
            return res.status(403).json({ error: 'Not enough credits' });
        // Include image as base64 in the prompt (optional)
        let finalPrompt = userprompt;
        if (req.file) {
            const base64Image = req.file.buffer.toString('base64');
            finalPrompt += `\n[Attached image: data:${req.file.mimetype};base64,${base64Image}]`;
        }
        // const generatedText = json.candidates?.[0]?.content?.[0]?.text || "";
        const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const systemPrompt = (0, prompts_js_1.getSystemPrompt)();
        const response = yield ai.models.generateContent({
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
        const generatedText = (_f = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) !== null && _f !== void 0 ? _f : "";
        console.log("Generated text:", generatedText);
        //   // --- Credit calculation ---
        const inputTokens = (_h = (_g = response.usageMetadata) === null || _g === void 0 ? void 0 : _g.promptTokenCount) !== null && _h !== void 0 ? _h : 0;
        const outputTokens = (_k = (_j = response.usageMetadata) === null || _j === void 0 ? void 0 : _j.candidatesTokenCount) !== null && _k !== void 0 ? _k : 0;
        const inputCost = (inputTokens / 1000000) * INPUT_PRICE;
        const outputCost = (outputTokens / 1000000) * OUTPUT_PRICE;
        const totalCostUSD = inputCost + outputCost;
        console.log("total Cost USD", totalCostUSD);
        const creditUsage = Math.ceil(totalCostUSD / CREDIT_VALUE);
        console.log("credit usage", creditUsage);
        if (user.credits < creditUsage)
            return res.status(403).json({ error: "Not enough credits" });
        user.credits -= creditUsage;
        yield user.save();
        return res.json({
            steps: generatedText,
            tokens: { inputTokens, outputTokens },
            costUSD: totalCostUSD,
            creditsUsed: creditUsage,
            creditsRemaining: user.credits
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Generation failed" });
    }
}));
