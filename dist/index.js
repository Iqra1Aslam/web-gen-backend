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
const db_js_1 = require("./utills/db.js");
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
// Endpoint to generate website based on prompt
app.post('/api/generate', upload.single('image'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userprompt = req.body.prompt;
        if (!userprompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }
        const systemPrompt = (0, prompts_js_1.getSystemPrompt)();
        let baseImage = null;
        let mimeType = null;
        // Check if an image uploaded
        if (req.file) {
            const imageBuffer = req.file.buffer;
            mimeType = req.file.mimetype;
            baseImage = imageBuffer.toString("base64");
        }
        // Construct the user message
        const userMessage = `Here is an artifact that contains all files of the project visible to you.
Consider the contents of ALL files in the project.


${prompts_js_1.defaultPrompt}

Here is a list of files that exist on the file system but are not being shown to you:

  - .gitignore
  - package-lock.json
User prompt: ${userprompt}`;
        // Build messages array
        const messages = [
            {
                role: "system",
                content: systemPrompt,
            }
        ];
        // Add user message with or without image
        if (baseImage && mimeType) {
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: userMessage },
                    {
                        type: "image",
                        image: `data:${mimeType};base64,${baseImage}`
                    }
                ]
            });
        }
        else {
            messages.push({
                role: "user",
                content: userMessage
            });
        }
        const response = yield openai.chat.completions.create({
            model: "x-ai/grok-code-fast-1",
            messages,
            temperature: 0.1,
            top_p: 0.95,
            max_tokens: 6000,
        });
        const generatedText = ((_a = response.choices[0].message) === null || _a === void 0 ? void 0 : _a.content) || '';
        console.log("Generated text:", generatedText);
        res.status(200).json({
            steps: generatedText, basefiles: prompts_js_1.defaultPrompt
        });
    }
    catch (error) {
        console.error('Error generating website:', error);
        res.status(500).json({
            error: 'Failed to generate website',
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
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
        const response = yield openai.chat.completions.create({
            model: "x-ai/grok-code-fast-1",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            temperature: 0.1,
            max_tokens: 6000
        });
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
        const response = yield openai.chat.completions.create({
            model: "x-ai/grok-code-fast-1",
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
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
