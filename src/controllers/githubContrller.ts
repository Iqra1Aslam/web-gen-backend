import axios from "axios";
import { Request, Response } from "express";

interface FileData {
  path: string;
  content: string;
}

export const createRepo = async (req: Request, res: Response) => {
  try {
    const { repoName, files }: { repoName: string; files: FileData[] } = req.body;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

    if (!repoName || !files) {
      return res.status(400).json({ error: "repoName and files are required" });
    }

    // 1. Create GitHub repo
    const repo = await axios.post(
      "https://api.github.com/user/repos",
      { name: repoName, private: false },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const repoUrl = repo.data.html_url;

    // 2. Upload files
    for (const file of files) {
      await axios.put(
        `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/${file.path}`,
        {
          message: `Add ${file.path}`,
          content: Buffer.from(file.content).toString("base64"),
        },
        {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json"
          }
        }
      );
    }

    res.json({ success: true, repoUrl });

  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error("GitHub Error:", err.response?.data || err.message);
      return res.status(500).json({ error: "Failed to create GitHub repo", details: err.response?.data || err.message });
    } else {
      console.error("Unknown Error:", err);
      return res.status(500).json({ error: "Failed to create GitHub repo", details: String(err) });
    }
  }
};
