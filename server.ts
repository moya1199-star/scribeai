import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: [".env.local", ".env"] });

console.log("DEBUG GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "CARGADA" : "VACIA");
console.log("DEBUG CWD:", process.cwd());

const app = express();
const PORT = 3000;

// Setup directories for persistence
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(process.cwd(), "notes_db.json");

// Helper to safely read database notes
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

// Helper to safely write database notes
function writeNotes(notes: any[]) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(notes, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing notes_db.json:", err);
  }
}

// Serves the saved audio recordings statically so they are permanent across restarts/refreshes
app.use("/uploads", express.static(UPLOADS_DIR));

// Logging middleware to inspect incoming requests
app.use((req, res, next) => {
  console.log(`[Express] Routing request: ${req.method} ${req.url} (NODE_ENV: ${process.env.NODE_ENV})`);
  next();
});

// Set up in-memory storage for file uploading
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
});

app.use(express.json({ limit: "50mb" }));

// Helper to lazy-init Gemini client to avoid crashes if the key isn't set yet during container startup
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY no está definida en .env.local o .env");
}
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// GET saved notes database
app.get("/api/notes", (req, res) => {
  try {
    const notes = readNotes();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: "No se pudieron obtener las notas desde el servidor." });
  }
});

// POST save entire notes database
app.post("/api/notes", (req, res) => {
  try {
    const notesArray = req.body;
    if (!Array.isArray(notesArray)) {
      return res.status(400).json({ error: "Datos inválidos. Se esperaba una lista." });
    }
    writeNotes(notesArray);
    res.json({ success: true, count: notesArray.length });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron guardar las notas en el servidor." });
  }
});

// POST endpoint to save an audio recording manually (used as fallback or pre-upload)
app.post("/api/save-audio", upload.single("audio"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó ningún archivo de audio." });
    }

    const safeName = (req.file.originalname || "recording.webm")
      .replace(/[^a-zA-Z0-9.]/g, "_");
    const filename = `${Date.now()}-${safeName}`;
    const destination = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(destination, req.file.buffer);

    res.json({ audioUrl: `/uploads/${filename}` });
  } catch (err: any) {
    console.error("Error saving static audio:", err);
    res.status(500).json({ error: "No se pudo guardar la grabación de audio en el servidor." });
  }
});

// REST route for audio transcription using Gemini Model
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó ningún archivo de audio." });
    }

    // Save audio statically so it is durable and playable after restarts/browser refeshes
    let savedAudioUrl: string | undefined = undefined;
    try {
      const safeName = (req.file.originalname || "grabacion.webm")
        .replace(/[^a-zA-Z0-9.]/g, "_");
      const filename = `${Date.now()}-${safeName}`;
      const destination = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(destination, req.file.buffer);
      savedAudioUrl = `/uploads/${filename}`;
    } catch (saveErr) {
      console.error("Advertencia: No se pudo escribir copia de audio en disco:", saveErr);
    }

    const client = getGeminiClient();

    // Reconstruct audio inline data
    let mimeType = req.file.mimetype;
    // Map some common recordings from browser which might be audio/webm, application/octet-stream, audio/wav
    if (mimeType === "application/octet-stream") {
      // Guess from file extension if possible, else default to webm or wav
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (ext === ".wav") mimeType = "audio/wav";
      else if (ext === ".mp3") mimeType = "audio/mp3";
      else if (ext === ".m4a") mimeType = "audio/m4a";
      else mimeType = "audio/webm";
    }

    const base64Audio = req.file.buffer.toString("base64");

    const audioPart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Audio,
      },
    };

    const promptText = `Eres un transcriptor experto con inteligencia artificial enfocado en análisis de grabaciones de voz, reuniones y notas de audio.
Analiza detenidamente esta grabación y realiza lo siguiente de manera multilingüe y nativa:
1. Detecta automáticamente el idioma principal o los idiomas hablados en la grabación (ej: "Español", "Inglés", "Español e Inglés", "Portugués", etc.).
2. Genera una transcripción organizada de la conversación discriminando con precisión las voces participantes (Speaker Diarization).
3. Utiliza etiquetas consistentes para cada participante, por ejemplo: "Hablante 1", "Hablante 2", etc. Si en la conversación un hablante revela su nombre explícitamente (ej: "Hola, soy Carlos" o "dime María"), siéntete libre de etiquetarlo con su nombre para una experiencia más humana (ej: "Carlos (Hablante 1)").
4. Elabora un "summary" (resumen) estructurado de forma ejecutiva con un tono profesional, claro y amigable en español.
5. Desarrolla una lista de "keyPoints" (puntos clave, decisiones u objetivos acordados).

Si por algún motivo el audio está vacío, contiene solo ruido indescifrable o no es posible extraer voz, documenta de igual forma en un JSON válido explicando que no se detectó contenido verbal nítido.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          audioPart,
          { text: promptText }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            language: {
              type: Type.STRING,
              description: "Idioma detectado automáticamente de la nota de voz (p. ej. 'Español', 'Multilingüe')."
            },
            summary: {
              type: Type.STRING,
              description: "Resumen ejecutivo comprensivo del contenido o discusión en español."
            },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Puntos clave, conclusiones principales, tareas asignadas o acuerdos destacados."
            },
            speakers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Lista de todos los hablantes participantes identificados de manera única."
            },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: {
                    type: Type.STRING,
                    description: "Hablante asignado a esta intervención (ej. 'Hablante 1', 'María')."
                  },
                  text: {
                    type: Type.STRING,
                    description: "Texto exacto transcrito de la intervención de este hablante."
                  }
                },
                required: ["speaker", "text"]
              },
              description: "Arreglo secuencial y cronológico de cada fragmento hablado."
            }
          },
          required: ["language", "summary", "keyPoints", "speakers", "segments"]
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No se pudo obtener una respuesta legible de parte de la Inteligencia Artificial.");
    }

    const transcriptionResult = JSON.parse(outputText.trim());
    
    // Inject permanent server audio url directly into result for seamless frontend load
    if (savedAudioUrl) {
      transcriptionResult.audioUrl = savedAudioUrl;
    }

    return res.json(transcriptionResult);

  } catch (error: any) {
    console.error("Transcription error on server:", error);
    return res.status(500).json({
      error: error.message || "Ocurrió un error inesperado al procesar el audio."
    });
  }
});

// Real-time AI chat query route using Gemini 3.5 Grounding on the transcribed meeting
app.post("/api/chat", async (req, res) => {
  try {
    const { message, summary, segments } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Se requiere un mensaje para consultar al asistente de ScribeAI." });
    }

    const client = getGeminiClient();

    // Map segments text for context
    const parsedSegments = Array.isArray(segments)
      ? segments.slice(0, 40).map((s: any) => `${s.speaker || "Hablante"}: ${s.text || ""}`).join("\n")
      : "";

    const userContextPrompt = `Eres ScribeAI Assistant, un consultor de IA de nivel ejecutivo especializado en actas de reuniones y notas estratégicas de voz.
Estás dando soporte interactivo a un usuario sobre su nota de voz grabada/analizada.

--- CONTEXTO DE LA NOTA DE VOZ ---
Resumen Ejecutivo:
"""
${summary || "No hay resumen de reunión disponible."}
"""

Diálogos Transcritos (Muestra cronológica de intervenciones y hablantes):
"""
${parsedSegments || "No hay segmentos hablados disponibles para esta grabación."}
"""
---------------------------------

Pregunta o requerimiento del usuario:
"${message}"

Instrucciones de respuesta:
1. Responde de forma directa, sumamente profesional, con un tono analítico, amigable y fluido en español.
2. Basate prioritariamente en el Resumen y Diálogos proporcionados arriba.
3. Si la pregunta busca que redactes un entregable (como un correo, minuta formal, resumen adaptado, mensaje de Slack), hazlo con una plantilla elegante y bien estructurada.
4. Usa negritas y Markdown limpio para que el texto sea escaneable y estético en la ventana de chat del Cockpit. ¿Estás listo?`;

    const result = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userContextPrompt,
    });

    const reply = result.text;
    if (!reply) {
      throw new Error("No se pudo obtener una respuesta legible de ScribeAI Assistant.");
    }

    return res.json({ reply: reply.trim() });
  } catch (error: any) {
    console.error("Chat companion error on server:", error);
    return res.status(500).json({
      error: error.message || "El asistente cognitivo de ScribeAI no pudo procesar tu solicitud."
    });
  }
});


// Error handling middleware to catch any Express/multer errors and return clean JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Express Error Handler:", err);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || "Ocurrió un error interno en el servidor."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});
