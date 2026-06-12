import EnhancedSummaryPanel from "./EnhancedSummaryPanel";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  CheckCircle2, 
  Circle, 
  Sparkles, 
  ChevronRight, 
  Play, 
  Pause, 
  Volume2, 
  Copy, 
  Download, 
  Trash2, 
  User, 
  Search, 
  Clock, 
  Users, 
  BrainCircuit, 
  FileText, 
  Send, 
  Activity, 
  AlertCircle,
  FolderOpen,
  Calendar,
  Layers,
  ArrowRight
} from "lucide-react";
import { 
  Speaker, 
  Segment, 
  ActionItem, 
  Decision, 
  Chapter, 
  ConversationMetrics, 
  TranscriptionDetail 
} from "../types";
import { generateExecutivePdf } from "../utils/pdfGenerator";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, getDocs, doc, setDoc } from "firebase/firestore";

// Tipos locales robustos para modelar la experiencia reimaginada
interface VoiceNotePremium {
  id: string;
  title: string;
  createdAt: string;
  duration: number;
  audioUrl?: string;
  transcription: TranscriptionDetail;
  isLocalFallback?: boolean;
}

interface ScribeWorkspaceProps {
  selectedNote: VoiceNotePremium;
  onUpdateNote: (note: VoiceNotePremium) => void;
  onDeleteNote?: (id: string) => void;
  notesList: VoiceNotePremium[];
  onSelectNote: (note: VoiceNotePremium) => void;
  isProcessing: boolean;
  user?: any;
}

export default function ScribeWorkspace({
  selectedNote,
  onUpdateNote,
  notesList,
  onSelectNote,
  isProcessing,
  user
}: ScribeWorkspaceProps) {
  // Estados para Búsqueda Semántica & Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  
  // Estado para el visor interactivo de resúmenes (SaaS Zoom Level)
  const [summaryZoom, setSummaryZoom] = useState<"tweet" | "executive" | "deep">("executive");

  // Estado del chat semántico de IA de ScribeAI
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "Hola. Soy ScribeAI Assistant. Puedes consultarme cualquier detalle del audio, planes de acción acordados, o pedirme redactar un correo con el resumen técnico de esta conversación."
    }
  ]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Synchronize chat messages from secure sub-collection in Firestore on selected note change
  useEffect(() => {
    if (!user || !selectedNote?.id) {
      // Graceful local memory fallback
      setChatHistory([
        {
          sender: "ai",
          text: "Hola. Soy ScribeAI Assistant. Puedes consultarme cualquier detalle del audio, planes de acción acordados, o pedirme redactar un correo con el resumen técnico de esta conversación."
        }
      ]);
      return;
    }

    const loadChatHistory = async () => {
      try {
        const messagesColRef = collection(db, "users", user.uid, "conversations", selectedNote.id, "messages");
        const q = query(messagesColRef, orderBy("timestamp", "asc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setChatHistory([
            {
              sender: "ai",
              text: "Hola. Soy ScribeAI Assistant. He analizado con éxito tu nota de voz y consolidado los acuerdos. ¿En qué puedo ayudarte hoy?"
            }
          ]);
          return;
        }

        const msgs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            sender: data.role === "user" ? "user" as const : "ai" as const,
            text: data.content || ""
          };
        });
        setChatHistory(msgs);
      } catch (error) {
        console.warn("Error leyendo mensajes de Firestore:", error);
        setChatHistory([
          {
            sender: "ai",
            text: "Hola. Soy ScribeAI Assistant. Puedes consultarme cualquier detalle del audio, planes de acción acordados, o pedirme redactar un correo con el resumen técnico de esta conversación."
          }
        ]);
      }
    };

    loadChatHistory();
  }, [user, selectedNote?.id]);

  // Estados del Reproductor de Audio
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Crear elementos de audio real síncronos
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
    }
    
    if (selectedNote.audioUrl) {
      audioRef.current = new Audio(selectedNote.audioUrl);
      audioRef.current.volume = volume;
      
      const updateTime = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audioRef.current.addEventListener("timeupdate", updateTime);
      audioRef.current.addEventListener("ended", handleEnded);

      return () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener("timeupdate", updateTime);
          audioRef.current.removeEventListener("ended", handleEnded);
          audioRef.current.pause();
        }
      };
    }
  }, [selectedNote.audioUrl]);

  // Manejo de Volumen
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  // Toggle Reproducción
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn("No se pudo reproducir el archivo de audio:", err);
      });
    }
  };

  // Saltar a segundo de audio específico (Scrub interactivo)
  const jumpToTime = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      if (!isPlaying) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        });
      }
    }
  };

  // Dibujar Espectrómetro de Energía Híbrido en Tiempo Real
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let localFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barCount = 120;
      const barWidth = width / barCount;

      // Dibujar fondo de cuadrícula sutil
      ctx.strokeStyle = "rgba(30, 41, 59, 0.4)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }

      // Dibujar espectro simulado Reactivo a la reproducción
      for (let i = 0; i < barCount; i++) {
        // Generamos un modulador físico realista
        let amplitude = 4;
        if (isPlaying) {
          const waveSpeed = Date.now() * 0.003;
          amplitude = Math.abs(
            Math.sin(i * 0.15 + waveSpeed) * 22 + 
            Math.cos(i * 0.05 - waveSpeed * 1.5) * 12
          );
        } else {
          // Curva estática de energía silente
          amplitude = Math.abs(Math.sin(i * 0.1) * 8) + 4;
        }

        const x = i * barWidth;
        const barHeight = (amplitude / 40) * height * 0.85;
        const y = (height - barHeight) / 2;

        const isPastPlayhead = (i / barCount) < (currentTime / (selectedNote.duration || 60));

        // Gradiente premium
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isPastPlayhead) {
          grad.addColorStop(0, "#F5A623"); // Royal Gold
          grad.addColorStop(1, "#CA8A04");
        } else {
          grad.addColorStop(0, "#334155"); // Obsidian Slate
          grad.addColorStop(1, "#1E293B");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x + 2, y, barWidth - 4, barHeight, 3);
          ctx.fill();
        } else {
          ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        }
      }

      // Línea de Línea de tiempo / Cursor físico actual
      const playheadRatio = currentTime / (selectedNote.duration || 60);
      const px = playheadRatio * width;
      
      ctx.strokeStyle = "#F5A623";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(245, 166, 35, 0.45)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadows

      localFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(localFrameId);
    };
  }, [isPlaying, currentTime, selectedNote.duration]);

  // Edición Inline de Segmentos de Orador
  const handleSegmentTextChange = (segmentId: string, newText: string) => {
    const updatedSegments = selectedNote.transcription.segments?.map(seg => {
      if (seg.id === segmentId) {
        return { ...seg, text: newText };
      }
      return seg;
    }) || [];

    const updatedNote: VoiceNotePremium = {
      ...selectedNote,
      transcription: {
        ...selectedNote.transcription,
        segments: updatedSegments
      }
    };
    onUpdateNote(updatedNote);
  };

  // Renombrado Global de Hablantes
  const handleRenameSpeakerGlobal = (oldName: string, newName: string) => {
    if (!newName.trim()) return;
    const updatedSegments = selectedNote.transcription.segments?.map(seg => {
      if (seg.speaker === oldName) {
        return { ...seg, speaker: newName };
      }
      return seg;
    }) || [];

    const updatedNote: VoiceNotePremium = {
      ...selectedNote,
      transcription: {
        ...selectedNote.transcription,
        segments: updatedSegments
      }
    };
    onUpdateNote(updatedNote);
  };

  // Modificar Tareas en tiempo real
  const handleToggleActionItem = (itemId: string) => {
    const updatedActions = selectedNote.transcription.actionItems?.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    }) || [];

    const updatedNote: VoiceNotePremium = {
      ...selectedNote,
      transcription: {
        ...selectedNote.transcription,
        actionItems: updatedActions
      }
    };
    onUpdateNote(updatedNote);
  };

  // Copiar sección al Portapapeles
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("¡Copiado al portapapeles exitosamente!");
  };

  // Exportar a Formato Minuta Markdown Ejecutiva
  const handleExportMarkdown = () => {
    const { title, createdAt, transcription } = selectedNote;
    let mdContent = `# ScribeAI Minuta Ejecutiva: ${title}\n`;
    mdContent += `*Fecha de Análisis: ${createdAt}*\n\n`;
    mdContent += `## 1. Resumen de Alto Nivel\n${transcription.summary || "No disponible."}\n\n`;
    
    mdContent += `## 2. Decisiones Estratégicas\n`;
    if (transcription.decisions && transcription.decisions.length > 0) {
      transcription.decisions.forEach((dec, idx) => {
        mdContent += `### ${idx + 1}. ${dec.title}\n`;
        mdContent += `- **Justificación:** ${dec.rationale}\n`;
        mdContent += `- **Participantes:** ${dec.approvedBy?.join(", ") || "Todos"}\n\n`;
      });
    } else {
      mdContent += `*No se registraron decisiones estratégicas.*\n\n`;
    }

    mdContent += `## 3. Planes de Acción & Tareas\n`;
    if (transcription.actionItems && transcription.actionItems.length > 0) {
      transcription.actionItems.forEach((act) => {
        mdContent += `- [${act.completed ? "x" : " "}] **${act.text}** ${act.assignee ? `(Asignado a: *${act.assignee}*)` : ""}\n`;
      });
    } else {
      mdContent += `*No se registraron tareas pendientes.*\n\n`;
    }

    mdContent += `\n---\n*Generado automáticamente por ScribeAI Cognitive Workspace. Real Intelligence Engine.*`;

    const blob = new Blob([mdContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\s+/g, "_")}-minuta.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Integración del Asistente IA Grounded (Motor cognitivo interactivo)
  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");

    // 1. Render optimista del mensaje del usuario
    setChatHistory(prev => [...prev, { sender: "user", text: userMsg }]);
    setIsAiThinking(true);

    // If user is not authenticated or there is no selected note id, fallback to local heuristic engine
    if (!user || !selectedNote?.id) {
      setTimeout(() => {
        let aiResponseText = "Procesando transcripción con el motor ScribeAI...";
        const normInput = userMsg.toLowerCase();

        if (normInput.includes("tarea") || normInput.includes("acción") || normInput.includes("acuerdo")) {
          const pending = selectedNote.transcription.actionItems?.filter(i => !i.completed) || [];
          if (pending.length > 0) {
            aiResponseText = `De acuerdo al análisis semántico, hay ${pending.length} tareas pendientes clave: \n\n` + 
              pending.map(p => `• **${p.text}**${p.assignee ? ` asignada directamente a ${p.assignee}` : ""}`).join("\n") +
              ` \n\n¿Quieres que redacte un correo electrónico y se lo asigne a sus correos institucionales?`;
          } else {
            aiResponseText = `No he detectado tareas pendientes por completar en esta sesión. Todo el flujo inicial se marca como completado.`;
          }
        } else if (normInput.includes("correo") || normInput.includes("escribe") || normInput.includes("enviar")) {
          aiResponseText = `He redactado para ti el borrador de minuta técnica listo para enviar:\n\n` +
            `**Asunto:** Minuta Ejecutiva ScribeAI - ${selectedNote.title}\n\n` +
            `*Estimado equipo, consolidamos los acuerdos del audio del ${selectedNote.createdAt}:*\n\n` +
            `• **Core:** ${selectedNote.transcription.summary.slice(0, 150)}...\n` +
            `• **Tareas Clave:** ${selectedNote.transcription.actionItems?.map(a => a.text).join(", ") || ""}\n\n` +
            `*Saludos cordiales,\nScribeAI Intelligent Assistant*`;
        } else if (normInput.includes("resumen") || normInput.includes("conclusión")) {
          aiResponseText = `Aquí tienes el extracto concluyente con la mayor densidad analítica:\n\n "${selectedNote.transcription.summary}"`;
        } else {
          aiResponseText = `Entendido. Basado en el contexto de "${selectedNote.title}" y segmentando a los oradores, se identificaron debates sobre optimización técnica y objetivos del cuatrimestre. Te sugiero revisar las decisiones críticas registradas en la pestaña de la derecha de tu Cockpit.`;
        }

        setChatHistory(prev => [...prev, { sender: "ai", text: aiResponseText }]);
        setIsAiThinking(false);
      }, 1100);
      return;
    }

    let aiReply = "";

    try {
      // 2. Llamada directa a Claude API (sin backend)
      const segmentsContext = Array.isArray(selectedNote.transcription.segments)
        ? selectedNote.transcription.segments.slice(0, 40)
            .map((s: any) => `${s.speaker || "Hablante"}: ${s.text || ""}`)
            .join("\n")
        : "";

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Eres ScribeAI Assistant, un consultor de IA especializado en análisis de notas de voz y reuniones.

--- CONTEXTO DE LA NOTA DE VOZ ---
Resumen: ${selectedNote.transcription.summary || "No disponible."}

Diálogos transcritos:
${segmentsContext || "No hay segmentos disponibles."}
---------------------------------

Pregunta del usuario: "${userMsg}"

Responde de forma directa, profesional y en español. Usa markdown para estructurar si es necesario.`
          }]
        })
      });

      if (!claudeResponse.ok) {
        const errJson = await claudeResponse.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Error Claude API (${claudeResponse.status})`);
      }

      const claudeData = await claudeResponse.json();
      aiReply = claudeData.content.map((b: any) => b.text || "").join("").trim()
        || "No se pudo obtener respuesta del asistente.";

    } catch (err: any) {
      console.error("Error al procesar consulta de chat ScribeAI:", err);
      aiReply = `⚠️ Error al consultar Claude: ${err.message || err}`;
    } finally {
      // 3. Render de respuesta de forma inmediata en la UI
      setChatHistory(prev => [...prev, { sender: "ai", text: aiReply }]);
      setIsAiThinking(false);
    }

    // 4. Guardado asíncrono secundario no bloqueante en el fondo
    const saveMessagesToFirestore = async () => {
      try {
        const messagesColRef = collection(db, "users", user.uid, "conversations", selectedNote.id, "messages");
        
        // Registrar mensaje de usuario
        const userMsgId = `msg-${Date.now()}`;
        await setDoc(doc(messagesColRef, userMsgId), {
          messageId: userMsgId,
          conversationId: selectedNote.id,
          role: "user",
          content: userMsg,
          timestamp: new Date().toISOString()
        });

        // Registrar respuesta del asistente
        const aiMsgId = `ai-${Date.now() + 10}`;
        await setDoc(doc(messagesColRef, aiMsgId), {
          messageId: aiMsgId,
          conversationId: selectedNote.id,
          role: "assistant",
          content: aiReply,
          timestamp: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn("Advertencia: No se pudo guardar el historial asíncronamente en Firestore:", dbErr);
      }
    };

    saveMessagesToFirestore();
  };

  // Computado del Segmento de transcripción filtrado por buscador y capítulos
  const filteredSegments = useMemo(() => {
    let result = selectedNote.transcription.segments || [];
    
    if (selectedChapterId) {
      const activeChapter = selectedNote.transcription.chapters?.find(c => c.id === selectedChapterId);
      if (activeChapter) {
        result = result.filter(seg => seg.startTime >= activeChapter.startTime && seg.startTime <= activeChapter.endTime);
      }
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(seg => seg.text.toLowerCase().includes(q) || seg.speaker.toLowerCase().includes(q));
    }

    return result;
  }, [selectedNote, searchTerm, selectedChapterId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0C10] text-[#E0E0E0] font-sans antialiased">
      
      {/* 1. SECCIÓN DE CAPÍTULOS DE REUNIÓN (Top Index) */}
      {selectedNote.transcription.chapters && selectedNote.transcription.chapters.length > 0 && (
        <div className="bg-slate-950/70 border-b border-slate-800/80 px-4 py-2 mt-1">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none py-1">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
              Capítulos
            </span>
            <button
              onClick={() => setSelectedChapterId(null)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer transition ${
                !selectedChapterId 
                  ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-400 font-bold" 
                  : "bg-slate-900/60 border-slate-800/50 text-slate-400 hover:bg-slate-850 hover:text-white"
              }`}
            >
              Todos ({selectedNote.transcription.chapters.length})
            </button>
            {selectedNote.transcription.chapters.map((chap, idx) => {
              const isSelected = selectedChapterId === chap.id;
              return (
                <button
                  key={chap.id || `chap-${idx}`}
                  onClick={() => {
                    setSelectedChapterId(chap.id);
                    jumpToTime(chap.startTime);
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 cursor-pointer transition ${
                    isSelected 
                      ? "bg-[#F5A623]/10 border-[#F5A623]/40 text-[#F5A623] font-bold" 
                      : "bg-slate-900/60 border-slate-800/50 text-slate-400 hover:bg-slate-850 hover:text-white"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  <span>{chap.title}</span>
                  <span className="text-[9px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-500">
                    {Math.floor(chap.startTime)}s
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. MAQUETA MAESTRA: DOS COLUMNAS */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-y-auto">
        
        {/* COLUMNA IZQUIERDA (8 Columnas): TIMELINE INTERACTIVO */}
        <div className="lg:col-span-8 flex flex-col gap-4 min-h-0">
          
          {/* BARRA DE ACCIÓN Y BÚSQUEDA */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-lg">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar coincidencia exacta u orador en la nota..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-slate-500"
              />
            </div>
            
            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Filtro activo:</span>
              <span className="text-[10px] font-mono bg-slate-950 text-slate-300 font-extrabold border border-slate-805 px-2.5 py-1 rounded">
                {filteredSegments.length} de {selectedNote.transcription.segments?.length || 0} Segmentos
              </span>
              <button
                onClick={() => generateExecutivePdf(selectedNote as any)}
                className="bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer hover:shadow-md transition active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Exportar PDF Ejecutivo</span>
              </button>
              <button
                onClick={handleExportMarkdown}
                className="bg-slate-800 hover:bg-slate-705 border border-slate-700 text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer hover:shadow-md transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar MD</span>
              </button>
            </div>
          </div>

          {/* TIMELINE DE TRANSCRIPCIÓN CON DIARIZACIÓN INTEGRADA */}
          <div className="flex-1 bg-slate-900/40 border border-slate-800/40 rounded-2xl p-4 overflow-y-auto space-y-4 max-h-[520px] scrollbar-thin scrollbar-thumb-slate-800">
            {filteredSegments.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-500 gap-2">
                <BrainCircuit className="w-8 h-8 opacity-40 text-slate-400" />
                <p className="text-xs">No se encontraron segmentos con el criterio de búsqueda actual.</p>
              </div>
            ) : (
              filteredSegments.map((seg, idx) => {
                // Verificar si este segmento coincide aproximadamente con la reproducción en curso
                const isSegmentActive = currentTime >= seg.startTime && currentTime <= seg.endTime;
                
                return (
                  <div 
                    key={seg.id || `seg-${idx}`}
                    className={`p-4 rounded-xl border transition-all duration-300 relative group text-left ${
                      isSegmentActive 
                        ? "bg-[#141822] border-[#F5A623]/30 shadow-[#F5A623]/5 shadow-md"
                        : "bg-slate-950/40 border-slate-800/40 hover:bg-slate-950/80 hover:border-slate-800"
                    }`}
                  >
                    {/* Indicador de progreso del audio */}
                    {isSegmentActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F5A623] to-amber-700 rounded-l-xl" />
                    )}

                    {/* Fila del Orador */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300">
                          <User className="w-3 h-3 text-indigo-400" />
                        </div>
                        
                        {/* Selector/Input de Orador para Renombrado Global */}
                        <input
                          type="text"
                          value={seg.speaker}
                          placeholder="Hablante"
                          onChange={(e) => handleRenameSpeakerGlobal(seg.speaker, e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 text-xs font-bold text-white w-28 focus:outline-none focus:ring-0 transition py-0.5 px-1 rounded"
                          title="Haz clic para renombrar este orador globalmente"
                        />
                        
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                          {Math.floor(seg.startTime)}s - {Math.floor(seg.endTime)}s
                        </span>
                      </div>

                      {/* Botón rápido para saltar el audio a este instante */}
                      <button
                        onClick={() => jumpToTime(seg.startTime)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                        title="Escuchar este segmento"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Bloque Editable del Texto de la Transcripción */}
                    <textarea
                      value={seg.text}
                      onChange={(e) => handleSegmentTextChange(seg.id, e.target.value)}
                      rows={2}
                      className="w-full bg-transparent border-0 text-xs text-slate-200 focus:outline-none focus:ring-0 resize-none hover:bg-slate-900/30 p-1 rounded focus:bg-slate-900/60 leading-relaxed transition"
                      title="Haz clic y edita el texto directamente"
                    />

                    {/* Tag de sentimiento o intensidad */}
                    {seg.sentiment && (
                      <div className="mt-1.5 flex justify-end">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          seg.sentiment === "critical" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                          seg.sentiment === "positive" ? "bg-emerald-505/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-slate-900 text-slate-400 border border-slate-800"
                        }`}>
                          Enfoque: {seg.sentiment}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* CHAT SEMÁNTICO CON LA TRANSCRIPCIÓN (Floating / Bottom Integrated AI Workspace) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-200">Asistente ScribeAI - Consulta Contextual</h4>
              </div>
              <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded border border-indigo-500/20">
                Respaldo Grounded con Gemini 3.5
              </span>
            </div>

            {/* Historial del Chat */}
            <div className="space-y-3 h-64 overflow-y-auto p-3 rounded-xl bg-slate-950/60 text-left scrollbar-thin scrollbar-thumb-slate-850">
              {chatHistory.map((chat, idx) => (
                <div key={idx} className={`flex gap-2.5 ${chat.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                    chat.sender === "user" 
                      ? "bg-indigo-650 text-white rounded-br-none text-left" 
                      : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none text-left"
                  }`}>
                    {chat.text}
                  </div>
                </div>
              ))}
              {isAiThinking && (
                <div className="flex justify-start items-center gap-2 text-[11px] text-slate-500 italic pl-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse">●</span>
                  <span>ScribeAI está analizando los segmentos del audio...</span>
                </div>
              )}
            </div>

            {/* Input Campo de Envío */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej. Escribe correo corporativo con los acuerdos o pregunta ¿quién dijo qué?"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendChatMessage}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl cursor-pointer transition shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA (4 Columnas): INTELLIGENCE COCKPIT PANEL */}
        <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
          
          {/* ZOOM DE RESUMEN INTELIGENTE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-left">
            <div className="flex items-center justify-between border-b border-slate-805 pb-3.5 mb-3.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-emerald-400" />
                Resumen Ejecutivo Ajustable
              </span>
              
              {/* Controles de Nivel de Zoom Slider */}
              <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-805 flex">
                {(["tweet", "executive", "deep"] as const).map(zoom => (
                  <button
                    key={zoom}
                    onClick={() => setSummaryZoom(zoom)}
                    className={`text-[9px] uppercase font-bold px-2 py-1 rounded-md cursor-pointer transition ${
                      summaryZoom === zoom 
                        ? "bg-slate-800 text-white" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {zoom}
                  </button>
                ))}
              </div>
            </div>

            {/* Vista dinámica de acuerdo al Zoom */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
              {summaryZoom === "tweet" && (
                <p className="text-xs text-slate-300 italic leading-relaxed">
                  📢 <strong>En Corto:</strong> Transmisión técnica sobre la optimización del backend, coordinando entregas clave dirigidas a la migración estable previa al viernes.
                </p>
              )}
              {summaryZoom === "executive" && (
  <EnhancedSummaryPanel
    note={selectedNote}
    apiUrl={import.meta.env.VITE_API_URL}
  />
)}
              {summaryZoom === "deep" && (
                <div className="space-y-2 text-xs text-slate-350 font-sans leading-relaxed">
                  <p>
                    Reunión enfocada al desarrollo colaborativo. Se analizan de forma prioritaria los cuellos de botella del servidor actual.
                  </p>
                  <p>
                    El equipo concluye que las limitaciones en el iframe de prueba se evitan abriendo en pestaña independiente para asegurar cookies seguras sin fallas técnicas.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* PANEL DE DECISIONES CRÍTICAS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-left">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3.5 mb-3.5">
              <CheckCircle2 className="w-4 h-4 text-[#F5A623]" />
              <h4 className="text-xs font-bold text-slate-200">Decisiones Estratégicas</h4>
            </div>

            <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
              {selectedNote.transcription.decisions && selectedNote.transcription.decisions.length > 0 ? (
                selectedNote.transcription.decisions.map((dec, idx) => (
                  <div key={dec.id || `dec-${idx}`} className="p-3 bg-slate-950 border border-slate-850 rounded-xl hover:border-[#F5A623]/30 transition group">
                    <span className="text-[9px] uppercase tracking-wider text-amber-400 font-extrabold block">Acuerdo Aprobado</span>
                    <h5 className="text-xs font-bold text-white mt-1 group-hover:text-[#F5A623] transition">{dec.title}</h5>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed leading-normal">{dec.rationale}</p>
                    {dec.approvedBy && (
                      <div className="mt-2 text-[9px] text-slate-500 font-medium">
                        Aprobado por: {dec.approvedBy.join(", ")}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-left text-slate-500 py-3 text-xs italic">
                  Ninguna decisión clasificada en esta nota.
                </div>
              )}
            </div>
          </div>

          {/* PLANES DE ACCIÓN Y COMPROMISOS TASK INTEGRATED */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-left flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3.5 mb-3.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Tareas y Planes de Acción
              </span>
              <span className="text-[9px] font-bold bg-slate-950 text-indigo-400 border border-indigo-500/15 px-2 py-0.5 rounded-full">
                {selectedNote.transcription.actionItems?.filter(i => !i.completed).length || 0} pendientes
              </span>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 pr-1 max-h-[220px]">
              {selectedNote.transcription.actionItems && selectedNote.transcription.actionItems.length > 0 ? (
                selectedNote.transcription.actionItems.map((item, idx) => (
                  <div 
                    key={item.id || `act-${idx}`} 
                    onClick={() => handleToggleActionItem(item.id)}
                    className="p-2.5 bg-slate-950/60 border border-slate-850 hover:border-slate-800 rounded-xl flex items-start gap-2.5 cursor-pointer transition text-left"
                  >
                    <button className="text-slate-500 hover:text-white shrink-0 mt-0.5 cursor-pointer">
                      {item.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${item.completed ? "line-through text-slate-550 italic" : "text-slate-200"}`}>
                        {item.text}
                      </p>
                      
                      {item.assignee && (
                        <span className="inline-block mt-1 text-[9px] font-bold bg-slate-900 border border-slate-850 text-slate-400 px-1.5 py-0.5 rounded">
                          @ {item.assignee}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-550 text-xs italic py-4">
                  No se identificaron planes de acción en la nota técnica.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* 3. COCKPIT DE AUDIO INFERIOR ANCLADO (Fixed Navigation Control Bar & Spectral Scrubber) */}
      <footer className="sticky bottom-0 bg-slate-950 border-t border-slate-850 px-6 py-4 z-40 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-4">
          
          {/* Controles de Reproducción Core */}
          <div className="flex items-center gap-3.5">
            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white flex items-center justify-center cursor-pointer transition-transform transform active:scale-95 shadow-md shadow-indigo-600/25 shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 translate-x-0.5" />
              )}
            </button>
            
            <div className="text-left select-none">
              <h4 className="text-[11px] font-bold text-slate-200 truncate max-w-[140px] md:max-w-xs">
                {selectedNote.title}
              </h4>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 mt-0.5">
                <span className="text-white">
                  {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60) < 10 ? "0" : "") + Math.floor(currentTime % 60)}
                </span>
                <span>/</span>
                <span>
                  {Math.floor((selectedNote.duration || 12) / 60)}:{(Math.floor((selectedNote.duration || 12) % 65) < 10 ? "0" : "") + Math.floor((selectedNote.duration || 12) % 60)}
                </span>
              </div>
            </div>
          </div>

          {/* VISUALIZADOR DE ONDA HÍBRIDA EN CANVAS (Área central interactiva para scrubbing) */}
          <div 
            className="flex-1 h-14 bg-[#0F1116] rounded-xl border border-slate-900 overflow-hidden relative cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = clickX / rect.width;
              if (selectedNote.duration) {
                jumpToTime(ratio * selectedNote.duration);
              }
            }}
            title="Haz clic para saltar a este instante del análisis de voz"
          >
            <canvas 
              ref={canvasRef} 
              width={700} 
              height={56} 
              className="w-full h-full block"
            />
            {/* Texto de ayuda dinámico */}
            <div className="absolute top-1 right-2 pointer-events-none text-[8px] font-mono tracking-widest text-slate-500 uppercase bg-slate-950/80 px-1 rounded">
              Binaural Waveform Scrubber
            </div>
          </div>

          {/* Controladores de Volumen Finos */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Volume2 className="w-4 h-4 text-slate-500" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-16 md:w-24 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

        </div>
      </footer>

    </div>
  );
}
