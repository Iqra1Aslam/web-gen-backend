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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepo = void 0;
const axios_1 = __importDefault(require("axios"));
const createRepo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { repoName, files } = req.body;
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
        if (!repoName || !files) {
            return res.status(400).json({ error: "repoName and files are required" });
        }
        // 1. Create GitHub repo
        const repo = yield axios_1.default.post("https://api.github.com/user/repos", { name: repoName, private: false }, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json"
            }
        });
        const repoUrl = repo.data.html_url;
        // 2. Upload files
        for (const file of files) {
            yield axios_1.default.put(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/${file.path}`, {
                message: `Add ${file.path}`,
                content: Buffer.from(file.content).toString("base64"),
            }, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github+json"
                }
            });
        }
        res.json({ success: true, repoUrl });
    }
    catch (err) {
        if (axios_1.default.isAxiosError(err)) {
            console.error("GitHub Error:", ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message);
            return res.status(500).json({ error: "Failed to create GitHub repo", details: ((_b = err.response) === null || _b === void 0 ? void 0 : _b.data) || err.message });
        }
        else {
            console.error("Unknown Error:", err);
            return res.status(500).json({ error: "Failed to create GitHub repo", details: String(err) });
        }
    }
});
exports.createRepo = createRepo;
