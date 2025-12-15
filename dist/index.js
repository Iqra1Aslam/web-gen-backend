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
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const pexels_1 = require("pexels");
dotenv_1.default.config();
const prompts_js_1 = require("./prompts.js");
const multer = require("multer");
const cors = require("cors");
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const auth_1 = __importDefault(require("./routes/auth"));
const payment_js_1 = __importDefault(require("./routes/payment.js"));
const db_js_1 = require("./utills/db.js");
const user_js_1 = require("./models/user.js");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Initialize Pexels client with validation
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
    throw new Error('PEXELS_API_KEY is not defined in environment variables');
}
const pexelsClient = (0, pexels_1.createClient)(PEXELS_API_KEY);
const ALLOWED_ORIGINS = ((_a = process.env.ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(",")) || [
    "http://localhost:5173",
];
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
// Session middleware
app.use((0, express_session_1.default)({
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
// ✅ IMPORTANT: Order matters!
app.use((0, cookie_parser_1.default)());
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/auto-fix", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
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
        // 🔍 LOG FULL RESPONSE
        console.log("FULL GEMINI RESPONSE:", JSON.stringify(response, null, 2));
        let content = ((_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || "";
        content = content.replace(/```json\s*([\s\S]*?)```/, "$1").trim();
        let fixedFiles;
        try {
            fixedFiles = JSON.parse(content);
        }
        catch (_f) {
            return res.status(500).json({
                error: "AI returned invalid JSON",
                raw: content,
            });
        }
        console.log("Auto-fixed files:", fixedFiles);
        return res.json({ fixedFiles });
    }
    catch (error) {
        console.error("Auto-fix error:", error);
        return res.status(500).json({
            error: "Failed to auto-fix",
            details: error instanceof Error ? error.message : error,
        });
    }
}));
app.get("/", (req, res) => {
    res.send("Server is running! 🚀");
});
app.post("/edit-files", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
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
        const response = yield ai.models.generateContent({
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
        let content = (_f = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) !== null && _f !== void 0 ? _f : "";
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
        }
        catch (err) {
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
    }
    catch (error) {
        console.error("edit-files error:", error);
        return res.status(500).json({ error: "Failed to edit files." });
    }
}));
console.log("Loaded MONGO_URI:", process.env.MONGO_URI);
// Connect to DB
(0, db_js_1.connectDB)();
console.log("connection established");
// Routes
app.use("/", auth_1.default);
app.use("/pay", payment_js_1.default);
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
// Helper function to fetch images from Pexels
function fetchPexelsImages(query_1) {
    return __awaiter(this, arguments, void 0, function* (query, perPage = 5) {
        if (!pexelsClient) {
            console.warn('Pexels client not initialized. Skipping image fetch.');
            return [];
        }
        try {
            const response = yield pexelsClient.photos.search({
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
        }
        catch (error) {
            console.error('Pexels API error:', error);
            return [];
        }
    });
}
// Helper function to extract image queries from user prompt
function extractImageQueries(prompt) {
    const queries = [];
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
// Simplified function - just cleans and validates the prompt for image search
function prepareImageQuery(prompt) {
    console.log('Preparing image query from prompt:', prompt);
    // Remove common non-visual words to get better image results
    const cleanedQuery = prompt
        .toLowerCase()
        .replace(/\b(create|build|make|design|develop|generate|website|landing page|page|app|site|portal|platform|for|a|an|the|with|using)\b/gi, '')
        .trim()
        .replace(/\s+/g, ' '); // Remove extra spaces
    console.log('Cleaned image query:', cleanedQuery);
    // Return original prompt if cleaning resulted in empty string
    return cleanedQuery || prompt;
}
app.post("/api/generates", upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const { prompt: userprompt, userId, fetchImages = true } = req.body;
        if (!userprompt)
            return res.status(400).json({ error: "Prompt is required" });
        const user = yield user_js_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ error: "User not found" });
        resetMonthlyCreditsIfNeeded(user);
        if (user.credits <= 0)
            return res.status(403).json({ error: "Not enough credits" });
        // Dynamically fetch images based on user prompt (enabled by default)
        let pexelsImages = [];
        let searchQuery = '';
        console.log('User query:', userprompt);
        if (fetchImages === true) {
            // Use manual imageQuery if provided, otherwise use the user's prompt
            searchQuery = prepareImageQuery(userprompt);
            console.log('Fetching images for query:', searchQuery);
            // Fetch images based on the query
            pexelsImages = yield fetchPexelsImages(searchQuery, 3); // Fetch 5 images
            console.log(`Fetched ${pexelsImages.length} images from Pexels`);
        }
        // Build final prompt for AI
        let finalPrompt = userprompt;
        // Add Pexels images to prompt if available
        if (pexelsImages.length > 0) {
            finalPrompt += `\n\n[Available high-quality stock images from Pexels:\n${pexelsImages.map((img, idx) => `${idx + 1}. ${img.url} (Photo by ${img.photographer})`).join('\n')}]\n\nIMPORTANT: Use these stock photo URLs in your generated HTML code. Include proper attribution as HTML comments: <!-- Photo by [photographer name] from Pexels -->`;
        }
        // if (fetchImages === true) { // Explicitly check for true
        //   const imageQueries = extractImageQueries(userprompt);
        //   if (imageQueries.length > 0) {
        //     console.log('Fetching images for queries:', imageQueries);
        //     // Fetch images for each query (limit to first 2 queries to avoid too many requests)
        //     const imagePromises = imageQueries.slice(0, 2).map(query => 
        //       fetchPexelsImages(query, 3)
        //     );
        //     const imageResults = await Promise.all(imagePromises);
        //     pexelsImages = imageResults.flat();
        //     console.log(`Fetched ${pexelsImages.length} images from Pexels`);
        //   }
        // }
        // Include image as base64 in the prompt (optional)
        // let finalPrompt = userprompt;
        // // Add Pexels images to prompt if available
        // if (pexelsImages.length > 0) {
        //   finalPrompt += `\n\n[Available stock images from Pexels:\n${pexelsImages.map((img, idx) => 
        //     `${idx + 1}. ${img.url} (Photo by ${img.photographer})`
        //   ).join('\n')}]\n\nIMPORTANT: Use these high-quality stock photo URLs in your generated website HTML. Include proper attribution as HTML comments near each image: <!-- Photo by ${pexelsImages[0].photographer} from Pexels -->`;
        // }
        if (req.file) {
            const base64Image = req.file.buffer.toString("base64");
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
        const TOKENS_PER_CREDIT = 70000;
        //   // --- Credit calculation ---
        const inputTokens = (_h = (_g = response.usageMetadata) === null || _g === void 0 ? void 0 : _g.promptTokenCount) !== null && _h !== void 0 ? _h : 0;
        const outputTokens = (_k = (_j = response.usageMetadata) === null || _j === void 0 ? void 0 : _j.candidatesTokenCount) !== null && _k !== void 0 ? _k : 0;
        const totalTokens = inputTokens + outputTokens;
        const inputCost = (inputTokens / 1000000) * INPUT_PRICE;
        const outputCost = (outputTokens / 1000000) * OUTPUT_PRICE;
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
        yield user.save();
        return res.json({
            steps: generatedText,
            images: pexelsImages,
            tokens: { inputTokens, outputTokens, totalTokens },
            costUSD: totalCostUSD,
            creditsUsed: creditUsage,
            creditsRemaining: user.credits,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Generation failed" });
    }
}));
