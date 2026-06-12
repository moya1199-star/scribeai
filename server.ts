import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: [".env.local", ".env"] });

console.log("DEBUG GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "CARGADA" : "VACIA");
console.log("DEBUG GROQ_API_KEY:", process.env.GROQ_API_KEY ? "CARGADA" : "VACIA");
console.log("DEBUG CWD:", process.cwd());

const app = express();
app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); res.header("Access-Control-Allow-Headers", "*"); if (req.method === "OPTIONS") return res.sendStatus(200); next(); });
app.use((req, res, next) => { res.setTimeout(300000); next(); });

const PORT = 3000;

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(process.cwd(), "notes_db.json");

function readNotes(): any[] {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading notes_db.json:", err);
  }
  return [];
}

function writeNotes(notes: any[]) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(notes, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing notes_db.json:", err);
  }
}

app.use("/uploads", express.static(UPLOADS_DIR));

app.use((req, res, next) => {
  console.log(`[Express] Routing request: ${req.method} ${req.url} (NODE_ENV: ${process.env.NODE_ENV})`);
  next();
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(express.json({ limit: "50mb" }));

// Gemini client (usado solo para el chat)
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY no está definida");
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiClient;
}

// GET notas
app.get("/api/notes", (req, res) => {
  try {
    res.json(readNotes());
  } catch (err) {
    res.status(500).json({ error: "No se pudieron obtener las notas." });
  }
});

// POST notas
app.post("/api/notes", (req, res) => {
  try {
    const notesArray = req.body;
    if (!Array.isArray(notesArray)) {
      return res.status(400).json({ error: "Se esperaba una lista." });
    }
    writeNotes(notesArray);
    res.json({ success: true, count: notesArray.length });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron guardar las notas." });
  }
});

// POST guardar audio
app.post("/api/save-audio", upload.single("audio"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se proporcionó audio." });
    const safeName = (req.file.originalname || "recording.webm").replace(/[^a-zA-Z0-9.]/g, "_");
    const filename = `${Date.now()}-${safeName}`;
    const destination = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(destination, req.file.buffer);
    res.json({ audioUrl: `/uploads/${filename}` });
  } catch (err: any) {
    console.error("Error saving audio:", err);
    res.status(500).json({ error: "No se pudo guardar el audio." });
  }
});

// POST transcripción con Groq Whisper
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se proporcionó audio." });

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) return res.status(500).json({ error: "GROQ_API_KEY no está configurada." });

    // Guardar audio en disco
    let savedAudioUrl: string | undefined = undefined;
    try {
      const safeName = (req.file.originalname || "grabacion.webm").replace(/[^a-zA-Z0-9.]/g, "_");
      const filename = `${Date.now()}-${safeName}`;
      const destination = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(destination, req.file.buffer);
      savedAudioUrl = `/uploads/${filename}`;
    } catch (saveErr) {
      console.error("No se pudo guardar copia de audio:", saveErr);
    }

    // Determinar mimeType
    let mimeType = req.file.mimetype;
    if (mimeType === "application/octet-stream") {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (ext === ".wav") mimeType = "audio/wav";
      else if (ext === ".mp3") mimeType = "audio/mp3";
      else if (ext === ".m4a") mimeType = "audio/m4a";
      else mimeType = "audio/webm";
    }

    // Llamar a Groq Whisper via fetch
    const formData = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: mimeType });
    const fileName = req.file.originalname || "audio.webm";
    formData.append("file", audioBlob, fileName);
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    formData.append("language", "es");

    const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqApiKey}` },
      body: formData,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      throw new Error(`Groq error (${groqResponse.status}): ${errText}`);
    }

    const groqData: any = await groqResponse.json();

    // Construir segmentos desde los chunks de Groq
    const segments = (groqData.segments || []).map((s: any, i: number) => ({
      id: `seg-${i}`,
      speaker: `Hablante ${(i % 2) + 1}`,
      text: s.text?.trim() || "",
      startTime: Math.round(s.start || 0),
      endTime: Math.round(s.end || 0),
      sentiment: "neutral" as const,
    }));

    // Generar resumen básico desde el texto completo
    const fullText = groqData.text || "";
    const wordCount = fullText.split(" ").length;
    const summary = fullText.length > 300
      ? fullText.substring(0, 300) + "..."
      : fullText || "Transcripción completada.";

    const result = {
      language: groqData.language || "Español",
      summary,
      keyPoints: [
        `Transcripción con ${segments.length} segmentos detectados.`,
        `Duración aproximada: ${Math.round((groqData.duration || 0))} segundos.`,
        `Total de palabras: ${wordCount}.`,
      ],
      speakers: ["Hablante 1", "Hablante 2"],
      segments,
      audioUrl: savedAudioUrl,
    };

    return res.json(result);

  } catch (error: any) {
    console.error("Transcription error:", error);
    return res.status(500).json({ error: error.message || "Error al procesar el audio." });
  }
});

// POST chat con Gemini
app.post("/api/chat", async (req, res) => {
  try {
    const { message, summary, segments } = req.body;
    if (!message) return res.status(400).json({ error: "Se requiere un mensaje." });

    const client = getGeminiClient();

    const parsedSegments = Array.isArray(segments)
      ? segments.slice(0, 40).map((s: any) => `${s.speaker || "Hablante"}: ${s.text || ""}`).join("\n")
      : "";

    const prompt = `Eres ScribeAI Assistant, un consultor de IA especializado en actas de reuniones.

--- CONTEXTO ---
Resumen: ${summary || "No disponible."}
Diálogos: ${parsedSegments || "No disponibles."}
---

Pregunta: "${message}"

Responde de forma directa y profesional en español. Usa markdown si es necesario.`;

    const result = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const reply = result.text;
    if (!reply) throw new Error("No se pudo obtener respuesta del asistente.");
    return res.json({ reply: reply.trim() });

  } catch (error: any) {
    console.error("Chat error:", error);
    return res.status(500).json({ error: error.message || "Error en el asistente." });
  }
});
app.post("/api/summarize", async (req, res) => {
  try {
    const { prompt } = req.body;

app.post("/api/summarize", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt requerido" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Eres un asistente especializado en análisis de reuniones. Generas resúmenes ejecutivos extensos y formales en español. Responde ÚNICAMENTE con el contenido solicitado, sin preámbulos.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2048,
    });

    const summary = completion.choices[0]?.message?.content || "";
    return res.json({ summary });

  } catch (err) {
    console.error("[/api/summarize] Error:", err);
    return res.status(500).json({ error: "Error generando resumen extendido" });
  }
});

// Error handler global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Handler:", err);
  res.status(err.status || 500).json({ error: err.message || "Error interno del servidor." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});
