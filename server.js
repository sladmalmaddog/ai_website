import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

loadEnv();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method is not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`App is running: http://localhost:${PORT}`);
});

async function handleChat(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 500, { error: "Gemini API key is missing" });
    return;
  }

  let body;

  try {
    body = await readRequestBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid request body" });
    return;
  }

  const message = String(body.message || "").trim();

  if (!message) {
    sendJson(res, 400, { error: "Please enter a message" });
    return;
  }

  let geminiResponse;

  try {
    geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: message }]
          }
        ]
      })
    });
  } catch {
    sendJson(res, 502, { error: "Could not connect to Gemini API" });
    return;
  }

  const data = await geminiResponse.json().catch(() => ({}));

  if (!geminiResponse.ok) {
    const errorText = data.error?.message || "Gemini API error";
    sendJson(res, 502, { error: errorText });
    return;
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    sendJson(res, 502, { error: "Gemini returned an empty answer" });
    return;
  }

  sendJson(res, 200, { answer });
}

async function serveStatic(req, res) {
  const cleanUrl = req.url.split("?")[0];
  const requestedFile = cleanUrl === "/" ? "index.html" : cleanUrl.slice(1);
  const filePath = path.normalize(path.join(publicDir, requestedFile));

  if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || "text/plain; charset=utf-8";

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const [key, ...valueParts] = trimmedLine.split("=");
    const value = valueParts.join("=");

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
