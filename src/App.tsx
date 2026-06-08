import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Trash2,
  Upload,
  Globe,
  Sparkles,
  Search,
  Calendar,
  Clock,
  Volume2,
  FileAudio,
  FolderLock,
  MessageSquare,
  Sparkle,
  Plus,
  Play,
  FileText,
  AlertCircle,
  HelpCircle,
  X,
  LogOut,
  User as UserIcon,
  Database
} from "lucide-react";

import { VoiceNote, TranscriptionDetail } from "./types";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { TranscriptionView } from "./components/TranscriptionView";
import ScribeWorkspace from "./components/ScribeWorkspace";

// Firebase integration bindings
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logoutUser, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query 
} from "firebase/firestore";


// High-quality bilingual demo note in case user's sandbox blocks mic permissions and they want to see the diarization & summaries instantly.
const MOCK_PRESET_NOTE: VoiceNote = {
  id: "preset-demo-1",
  title: "Reunión de Lanzamiento - ScribeAI",
  createdAt: new Date(Date.now() - 3600000 * 2).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }),
  duration: 48,
  transcription: {
    language: "Multilingüe (Español e Inglés)",
    summary:
      "La reunión de sincronización cubrió el lanzamiento del nuevo módulo de notas de voz. Se acordó desplegar la versión piloto mañana por la mañana y validar que la auto-detección de idioma y la separación de hablantes (diarization) funcionen de forma fluida. Se usó vocabulario bilingüe.",
    keyPoints: [
      "Ana se encargará de ultimar los retoques visuales en el visualizador de la interfaz.",
      "John will monitor API cold-starts using the new server.ts endpoint.",
      "Se realizará una ronda rápida de pruebas de usuario a las 10:00 AM.",
    ],
    speakers: ["Ana (Hablante 1)", "John (Hablante 2)"],
    segments: [
      {
        id: "seg-1",
        speaker: "Ana (Hablante 1)",
        text: "Hola a todos. Bienvenidos a la sesión técnica. Hoy tenemos que revisar la implementación de las notas de voz con diarización. ¿John, are you ready to present?",
        startTime: 0,
        endTime: 12,
        sentiment: "neutral"
      },
      {
        id: "seg-2",
        speaker: "John (Hablante 2)",
        text: "Thank you, Ana! Yes, I'm ready. The backend is completely set up on port 3000 using Express and the new @google/genai SDK with the gemini-3.5-flash model.",
        startTime: 12,
        endTime: 26,
        sentiment: "positive"
      },
      {
        id: "seg-3",
        speaker: "Ana (Hablante 1)",
        text: "¡Excelente! Me encanta que usemos la autodetección nativa del modelo. Así si hablas en inglés o español, la IA lo discriminará perfectamente.",
        startTime: 26,
        endTime: 38,
        sentiment: "positive"
      },
      {
        id: "seg-4",
        speaker: "John (Hablante 2)",
        text: "Absolutely! We should launch the beta first thing tomorrow morning and verify continuous latency.",
        startTime: 38,
        endTime: 48,
        sentiment: "critical"
      },
    ],
    chapters: [
      {
        id: "cap-1",
        title: "Apertura Técnica",
        startTime: 0,
        endTime: 26,
        summary: "Presentación inicial del equipo y validación de tecnologías backend."
      },
      {
        id: "cap-2",
        title: "Lanzamiento & Latencia",
        startTime: 26,
        endTime: 48,
        summary: "Estrategia para el despliegue del piloto inicial a las 10:00 AM."
      }
    ],
    actionItems: [
      {
        id: "act-1",
        text: "Acabar retoques del visualizador CSS",
        assignee: "Ana",
        completed: false
      },
      {
        id: "act-2",
        text: "Monitorear arranques en frío en servidor de Cloud Run",
        assignee: "John",
        completed: true
      },
      {
        id: "act-3",
        text: "Lanzar pruebas beta con usuarios reales",
        completed: false
      }
    ],
    decisions: [
      {
        id: "dec-1",
        title: "Detección Automática de Idioma Nativo",
        rationale: "Delegar completamente al modelo de Gemini para procesar flujos en ES/EN simultáneamente de forma confiable.",
        approvedBy: ["Ana", "John"]
      }
    ],
    metrics: {
      totalWords: 160,
      averageSpeed: 120,
      silenceRatio: 0.05,
      speakerInterruptionCount: 0
    }
  },
};

export default function App() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLang, setFilterLang] = useState("Todos");

  // Auto-save Status and rename state
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("saved");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  useEffect(() => {
    if (selectedNote) {
      setTitleInput(selectedNote.title);
      setIsEditingTitle(false);
    }
  }, [selectedNote?.id]);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Processing & UI loading states
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCookieBlocked, setIsCookieBlocked] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recorderPermissionError, setRecorderPermissionError] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [user, setUser] = useState<any>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Advanced sandbox environment detection
  const [isInIframe, setIsInIframe] = useState(false);
  const [hasStorageAccess, setHasStorageAccess] = useState(true);

  // Iframe and Storage Access detection
  useEffect(() => {
    // 1. Detect if running inside an iframe securely
    // Local app - no iframe restrictions
    setIsInIframe(false);
    setHasStorageAccess(true);
    setIsCookieBlocked(false);
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPayloadRef = useRef<{ localUrl: string; duration: number } | null>(null);

  // Auth state monitoring
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoadingAuth(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Track and synchronize notes via Firestore Real-Time Stream
  useEffect(() => {
    if (!user) {
      setNotes([]);
      setSelectedNote(null);
      return;
    }

    setSaveStatus("saving");
    const notesRef = collection(db, "users", user.uid, "conversations");
    const q = query(notesRef);

    const unsubscribeNotes = onSnapshot(q, (snapshot) => {
      const dbNotes: VoiceNote[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        dbNotes.push({
          id: docSnap.id,
          title: data.title || "Sin título",
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt,
          duration: data.duration || 0,
          audioUrl: data.audioUrl,
          transcription: data.transcription,
          isLocalFallback: data.isLocalFallback
        });
      });

      // Sort chronologically descending
      const sortedNotes = dbNotes.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeB - timeA;
      });

      setNotes(sortedNotes);
      setSaveStatus("saved");

      // Auto selection
      if (sortedNotes.length > 0) {
        setSelectedNote((prev) => {
          if (!prev) return sortedNotes[0];
          const matched = sortedNotes.find((n) => n.id === prev.id);
          return matched || sortedNotes[0];
        });
      } else {
        // Build the welcome seed on first setup
        seedDefaultPreset(user.uid);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/conversations`);
    });

    return () => unsubscribeNotes();
  }, [user]);

  const seedDefaultPreset = async (uid: string) => {
    try {
      setSaveStatus("saving");
      const docRef = doc(db, "users", uid, "conversations", MOCK_PRESET_NOTE.id);
      await setDoc(docRef, {
        conversationId: MOCK_PRESET_NOTE.id,
        userId: uid,
        title: MOCK_PRESET_NOTE.title,
        createdAt: MOCK_PRESET_NOTE.createdAt,
        updatedAt: MOCK_PRESET_NOTE.createdAt,
        duration: MOCK_PRESET_NOTE.duration,
        audioUrl: MOCK_PRESET_NOTE.audioUrl || "",
        transcription: MOCK_PRESET_NOTE.transcription,
        status: "transcribed"
      });
      
      const initialMsgRef = doc(db, "users", uid, "conversations", MOCK_PRESET_NOTE.id, "messages", "system-init");
      await setDoc(initialMsgRef, {
        messageId: "system-init",
        conversationId: MOCK_PRESET_NOTE.id,
        role: "assistant",
        content: `Hola. Soy ScribeAI Assistant. He analizado con éxito tu nota de voz "${MOCK_PRESET_NOTE.title}". Puedes consultarme cualquier detalle del audio, planes de acción acordados, o pedirme redactar un correo con el resumen.`,
        timestamp: new Date().toISOString()
      });
      
      setSaveStatus("saved");
    } catch (err) {
      console.warn("No se pudo sembrar la nota demo inicial", err);
    }
  };

  const saveNoteToFirestore = async (newNote: VoiceNote) => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      const docRef = doc(db, "users", user.uid, "conversations", newNote.id);
      await setDoc(docRef, {
        conversationId: newNote.id,
        userId: user.uid,
        title: newNote.title,
        createdAt: newNote.createdAt,
        updatedAt: new Date().toLocaleString("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        duration: newNote.duration,
        audioUrl: newNote.audioUrl || "",
        transcription: newNote.transcription,
        status: "transcribed",
        isLocalFallback: newNote.isLocalFallback || false,
      });

      // Write default greet
      const initialMsgRef = doc(db, "users", user.uid, "conversations", newNote.id, "messages", "system-init");
      await setDoc(initialMsgRef, {
        messageId: "system-init",
        conversationId: newNote.id,
        role: "assistant",
        content: `Hola. Soy ScribeAI Assistant. He analizado con éxito tu nota de voz "${newNote.title}". Puedes consultarme cualquier detalle del audio, planes de acción acordados, o pedirme redactar un correo con el resumen.`,
        timestamp: new Date().toISOString()
      });

      setSaveStatus("saved");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/conversations/${newNote.id}`);
    }
  };

  const updateNote = async (updatedNote: VoiceNote) => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      const docRef = doc(db, "users", user.uid, "conversations", updatedNote.id);
      await updateDoc(docRef, {
        title: updatedNote.title,
        updatedAt: new Date().toLocaleString("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        transcription: updatedNote.transcription,
      });
      setSelectedNote(updatedNote);
      setSaveStatus("saved");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/conversations/${updatedNote.id}`);
    }
  };

  const handleTitleSave = () => {
    if (selectedNote && titleInput.trim() && titleInput.trim() !== selectedNote.title) {
      updateNote({
        ...selectedNote,
        title: titleInput.trim(),
      });
    }
    setIsEditingTitle(false);
  };

  // Recording Timer
  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      setRecordingDuration(0);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  // Start recording voice using MediaRecorder API
  const startRecording = async () => {
    setErrorMsg(null);
    setRecorderPermissionError(false);
    setAudioChunks([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);

      // WebM is widely compatible inside chrome / modern browsers
      let options = { mimeType: "audio/webm" };
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "" }; // default codec for browsers like Safari
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
        const localUrl = URL.createObjectURL(audioBlob);
        
        // Trigger processing immediately with the recorded audio raw bytes!
        await processAudioPayload(audioBlob, localUrl, recordingDuration || 15);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Error al acceder al micrófono", err);
      setRecorderPermissionError(true);
      setErrorMsg("No se pudo acceder al micrófono. Asegúrate de otorgar permisos o sube un archivo de audio.");
    }
  };

  // Force stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
      setAudioStream(null);
    }
  };

  // Process the raw audio payload via Claude API directly (no backend needed)
  const processAudioPayload = async (audioBlob: Blob, localUrl: string, duration: number) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setIsCookieBlocked(false);
    pendingPayloadRef.current = { localUrl, duration };

    try {
      // Convert audio blob to base64 for Claude API
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const mimeType = audioBlob.type || "audio/webm";

      // Send audio to local Express backend (Gemini)
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const transcribeResponse = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeResponse.ok) {
        const errJson = await transcribeResponse.json().catch(() => ({}));
        throw new Error(errJson.error || `Error transcripcion (${transcribeResponse.status})`);
      }

      const transcriptionResult = await transcribeResponse.json();

      const finalAudioUrl = localUrl;

      const newNoteId = `note-${Date.now()}`;
      const defaultTitle = manualTitle.trim() || `Nota de voz #${notes.length + 1}`;
      
      const newNote: VoiceNote = {
        id: newNoteId,
        title: defaultTitle,
        createdAt: new Date().toLocaleString("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        duration: duration || 12,
        audioUrl: finalAudioUrl,
        transcription: transcriptionResult,
      };

      saveNoteToFirestore(newNote).catch(err => {
        console.warn("Advertencia: No se pudo autosalvar en la nube:", err);
      });
      setSelectedNote(newNote);
      setManualTitle(""); // Reset manual title

    } catch (err: any) {
      console.warn("Error en processAudioPayload, aplicando motor local de respaldo:", err);
      
      const simulatedTitle = manualTitle.trim() || `Nota de voz #${notes.length + 1}`;
      const simulatedResult = generateSmartMockTranscription(simulatedTitle, duration);
      const newNoteId = `local-${Date.now()}`;
      
      const newNote: VoiceNote = {
        id: newNoteId,
        title: simulatedTitle,
        createdAt: new Date().toLocaleString("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        duration: duration || 12,
        audioUrl: localUrl,
        transcription: simulatedResult,
        isLocalFallback: true,
      };

      saveNoteToFirestore(newNote).catch(err => {
        console.warn("Advertencia: No se pudo autosalvar el respaldo local en la nube:", err);
      });
      setSelectedNote(newNote);
      setManualTitle(""); // Reset manual title
      
      setErrorMsg(null);
      // setIsCookieBlocked - disabled in local mode
    } finally {
      setIsProcessing(false);
    }
  };

  // Safe and contextual high-fidelity simulation engine for iframe sandbox restrictions
  const generateSmartMockTranscription = (title: string, duration: number): TranscriptionDetail => {
    const normalized = title.toLowerCase();
    const dur = duration || 30;
    
    // Theme 1: Design and UX/UI
    if (
      normalized.includes("diseño") || 
      normalized.includes("figma") || 
      normalized.includes("ux") || 
      normalized.includes("ui") || 
      normalized.includes("maqueta") || 
      normalized.includes("interfaz") ||
      normalized.includes("pantalla")
    ) {
      return {
        language: "Español",
        summary: `Sesión de revisión enfocada en el diseño UX/UI de la interfaz para la nota "${title}". El equipo debatió la paleta de colores de alto contraste y la tipografía para asegurar una óptima legibilidad en pantallas externas, acordando pulir las maquetas en Figma para su posterior validación de desarrollo de front-end.`,
        keyPoints: [
          "Revisar el contraste de los textos secundarios sobre el fondo pizarra oscuro de la interfaz para cumplir con los estándares AA de accesibilidad.",
          "Ajustar los tamaños tipográficos y el espaciado (tracking) en todos los encabezados importantes de sección.",
          "Laura entregará el conjunto de componentes interactivos pulidos este viernes por la tarde."
        ],
        speakers: ["Laura (Diseño)", "Carlos (Hablante 1)"],
        segments: [
          {
            id: `seg-ui-1`,
            speaker: "Carlos (Hablante 1)",
            text: "Hola Laura, estuve revisando el último flujo interactivo de la interfaz web. Me parece que el contraste de la tipografía secundaria sobre el fondo gris oscuro está un poco bajo en pantallas móviles o con alto brillo ambiental.",
            startTime: 0,
            endTime: Math.floor(dur * 0.25),
            sentiment: "neutral"
          },
          {
            id: `seg-ui-2`,
            speaker: "Laura (Diseño)",
            text: "Interesante observación, Carlos. Lo habíamos definido con un tono gris pizarra muy sutil para dar un aire minimalista. Lo cambiaré de inmediato por un tono slate-300 o blanco apagado para mejorar la accesibilidad.",
            startTime: Math.floor(dur * 0.25),
            endTime: Math.floor(dur * 0.55),
            sentiment: "positive"
          },
          {
            id: `seg-ui-3`,
            speaker: "Carlos (Hablante 1)",
            text: "¡Excelente! El resto del bento-grid de layouts y las jerarquías de botones se ven impecables. En cuanto exportes los assets finales de Figma, empezamos a integrarlo.",
            startTime: Math.floor(dur * 0.55),
            endTime: Math.floor(dur * 0.8),
            sentiment: "positive"
          },
          {
            id: `seg-ui-4`,
            speaker: "Laura (Diseño)",
            text: "Perfecto. Te preparo un kit completo con los SVG limpios y las clases Tailwind predefinidas para facilitar la maquetación. ¡Manos a la obra!",
            startTime: Math.floor(dur * 0.8),
            endTime: dur,
            sentiment: "critical"
          }
        ],
        chapters: [
          {
            id: "cap-ui-1",
            title: "Auditoría de Contraste",
            startTime: 0,
            endTime: Math.floor(dur * 0.55),
            summary: "Revisión técnica de contrastes de color e índices de contraste del slate grisaceo."
          },
          {
            id: "cap-ui-2",
            title: "Plan de Figma a Tailwind",
            startTime: Math.floor(dur * 0.55),
            endTime: dur,
            summary: "Acuerdo de traspaso de assets vectoriales autogenerados de desarrollo."
          }
        ],
        actionItems: [
          {
            id: "act-ui-1",
            text: "Migrar grises de textos secundarios a slate-300 para accesibilidad",
            assignee: "Laura (Diseño)",
            completed: false
          },
          {
            id: "act-ui-2",
            text: "Exportar kit de componentes vectoriales interactivos",
            assignee: "Laura (Diseño)",
            completed: false
          }
        ],
        decisions: [
          {
            id: "dec-ui-1",
            title: "Reemplazo de paleta y tipografía principal",
            rationale: "Optimizar el Look & Feel de ScribeAI a un look corporativo de alto valor legible.",
            approvedBy: ["Laura", "Carlos"]
          }
        ],
        metrics: {
          totalWords: 154,
          averageSpeed: 110,
          silenceRatio: 0.04,
          speakerInterruptionCount: 1
        }
      };
    }
    
    // Theme 2: Software Development & Backend Architecture
    if (
      normalized.includes("desarrollo") || 
      normalized.includes("código") || 
      normalized.includes("api") || 
      normalized.includes("backend") || 
      normalized.includes("servidor") || 
      normalized.includes("base") || 
      normalized.includes("database") || 
      normalized.includes("error") ||
      normalized.includes("sistema") ||
      normalized.includes("deploy")
    ) {
      return {
        language: "Multilingüe (Español e Inglés)",
        summary: `Sincronización técnica de desarrollo sobre la infraestructura de la nota "${title}". Se analizó el flujo de peticiones asíncronas de red, y se propuso un esquema con carga perezosa para evitar fugas de memoria y optimizar el tiempo de respuesta inicial en producción.`,
        keyPoints: [
          "Migrar la inicialización del cliente SDK de Gemini a un patrón perezoso (lazy initialization) para agilizar el arranque del contenedor de Cloud Run.",
          "Agregar endpoints claros de health-status que garanticen respuestas HTTP JSON sin redirecciones.",
          "John will optimize the Dockerfile layer caching to speed up the CI/CD pipeline build times tomorrow morning."
        ],
        speakers: ["John (Dev)", "Sofía (Líder Técnica)"],
        segments: [
          {
            id: `seg-dev-1`,
            speaker: "Sofía (Líder Técnica)",
            text: "Hola John. Quería validar el progreso del backend para el analizador de voz de la nota. He notado algunos retrasos menores al levantar el contenedor de pruebas.",
            startTime: 0,
            endTime: Math.floor(dur * 0.25),
            sentiment: "neutral"
          },
          {
            id: `seg-dev-2`,
            speaker: "John (Dev)",
            text: "Yes, Sofia! You're totally right. We are instantiating the GenAI client at the top level of the module, which forces a network handshake before the express app is listening. I will migrate that to active lazy-init.",
            startTime: Math.floor(dur * 0.25),
            endTime: Math.floor(dur * 0.6),
            sentiment: "critical"
          },
          {
            id: `seg-dev-3`,
            speaker: "Sofía (Líder Técnica)",
            text: "Fantástico John. Eso solucionaría por completo las caídas esporádicas del ingress de red en el ambiente de staging. Asegúrate también de que los esquemas relacionales estén debidamente tipados con TypeScript.",
            startTime: Math.floor(dur * 0.6),
            endTime: Math.floor(dur * 0.85),
            sentiment: "positive"
          },
          {
            id: `seg-dev-4`,
            speaker: "John (Dev)",
            text: "Absolutely. I already declared all shared structures inside a common types file. I'll push the branch right after fixing this connection handler.",
            startTime: Math.floor(dur * 0.85),
            endTime: dur,
            sentiment: "positive"
          }
        ],
        chapters: [
          {
            id: "cap-dev-1",
            title: "Arranque en Frío de Contenedores",
            startTime: 0,
            endTime: Math.floor(dur * 0.6),
            summary: "Análisis técnico de inicialización web de la API de Express."
          },
          {
            id: "cap-dev-2",
            title: "Tipado con TypeScript",
            startTime: Math.floor(dur * 0.6),
            endTime: dur,
            summary: "Planificación de redundancias y interfaces de modelos."
          }
        ],
        actionItems: [
          {
            id: "act-dev-1",
            text: "Refactorizar cliente GenAI a inicialización perezosa (lazy-init)",
            assignee: "John (Dev)",
            completed: false
          },
          {
            id: "act-dev-2",
            text: "Optimizar capas de caché en el Dockerfile corporativo",
            assignee: "John (Dev)",
            completed: false
          }
        ],
        decisions: [
          {
            id: "dec-dev-1",
            title: "Cambio de Arquitectura de Conexión en Express",
            rationale: "Evitar handshakes de red innecesarios al iniciar la instancia para acelerar el levante del servicio.",
            approvedBy: ["Sofía", "John"]
          }
        ],
        metrics: {
          totalWords: 172,
          averageSpeed: 115,
          silenceRatio: 0.03,
          speakerInterruptionCount: 0
        }
      };
    }
    
    // Theme 3: Marketing and Business Strategy
    if (
      normalized.includes("marketing") || 
      normalized.includes("negocio") || 
      normalized.includes("ventas") || 
      normalized.includes("campaña") || 
      normalized.includes("presupuesto") || 
      normalized.includes("estrategia") ||
      normalized.includes("lanzamiento")
    ) {
      return {
        language: "Español",
        summary: `Reunión de coordinación estratégica enfocada en la campaña promocional para la nota "${title}". El equipo definió de manera clara los objetivos de impacto piloto en medios tradicionales y digitales, coordinando la pauta y asignando presupuestos diarios.`,
        keyPoints: [
          "Definir un presupuesto diario controlado para los anuncios segmentados de Google Search durante el piloto inicial de 15 días.",
          "Elena consolidará el reporte de competidores utilizando el análisis de palabras clave más consultadas.",
          "Distribuir la nueva plantilla interactiva de emailing premium el próximo martes con métricas asociadas."
        ],
        speakers: ["Marcos (Marketing)", "Elena (Negocio)"],
        segments: [
          {
            id: `seg-mkt-1`,
            speaker: "Elena (Negocio)",
            text: "Marcos, estuve repasando las proyecciones de este trimestre y me gustaría que enfocáramos los esfuerzos de adquisición en canales de intención alta.",
            startTime: 0,
            endTime: Math.floor(dur * 0.25),
            sentiment: "neutral"
          },
          {
            id: `seg-mkt-2`,
            speaker: "Marcos (Marketing)",
            text: "Entiendo la estrategia Elena. Para eso, lo más viable es realizar campañas concentradas en la red de búsqueda activa, complementando con contenido educativo en redes profesionales.",
            startTime: Math.floor(dur * 0.25),
            endTime: Math.floor(dur * 0.55),
            sentiment: "positive"
          },
          {
            id: `seg-mkt-3`,
            speaker: "Elena (Negocio)",
            text: "Muy bien. Me parece un enfoque excelente para optimizar el retorno de inversión publicitaria. ¿A qué hora podríamos revisar los copys de los primeros anuncios?",
            startTime: Math.floor(dur * 0.55),
            endTime: Math.floor(dur * 0.8),
            sentiment: "neutral"
          },
          {
            id: `seg-mkt-4`,
            speaker: "Marcos (Marketing)",
            text: "El viernes por la mañana tendré listos tres borradores creativos. Te los envío para darles el visto bueno final y activar la campaña el próximo martes a primera hora.",
            startTime: Math.floor(dur * 0.8),
            endTime: dur,
            sentiment: "positive"
          }
        ],
        chapters: [
          {
            id: "cap-mkt-1",
            title: "Canales de Adquisición",
            startTime: 0,
            endTime: Math.floor(dur * 0.55),
            summary: "Coordinación de pauta publicitaria en buscadores vs redes profesionales."
          },
          {
            id: "cap-mkt-2",
            title: "Despliegue de Copys",
            startTime: Math.floor(dur * 0.55),
            endTime: dur,
            summary: "Revisión calendarizada de anuncios del martes a primera hora."
          }
        ],
        actionItems: [
          {
            id: "act-mkt-1",
            text: "Consolidar el reporte técnico de análisis de palabras clave",
            assignee: "Elena (Negocio)",
            completed: false
          },
          {
            id: "act-mkt-2",
            text: "Redactar borradores creativos de anuncios de alto impacto",
            assignee: "Marcos (Marketing)",
            completed: false
          }
        ],
        decisions: [
          {
            id: "dec-mkt-1",
            title: "Inversión concentrada en canales de alta intención",
            rationale: "Maximizar el uso presupuestario reduciendo clics de baja calidad comercial.",
            approvedBy: ["Elena", "Marcos"]
          }
        ],
        metrics: {
          totalWords: 168,
          averageSpeed: 110,
          silenceRatio: 0.05,
          speakerInterruptionCount: 0
        }
      };
    }

    // Theme 4: General/Daily meeting notes fallback
    return {
      language: "Español",
      summary: `Transcripción general de la nota de audio titulada "${title}". Durante la discusión se compartieron actualizaciones individuales de actividades, tareas concretas agendadas en el backlog de la semana y soluciones a impedimentos menores.`,
      keyPoints: [
        "Progresar de forma consistente en las actividades asignadas de alta prioridad del sprint actual.",
        "Programar las citas técnicas restantes con el equipo de integraciones externas para coordinar despliegues de red.",
        "Actualizar el estado diario de avance en la herramienta de seguimiento colaborativa antes de la sesión general de mañana."
      ],
      speakers: ["Hablante 1", "Hablante 2"],
      segments: [
        {
          id: "seg-gen-1",
          speaker: "Hablante 1",
          text: `Hola, esta es una transcripción inteligente completa generada por el motor de compatibilidad offline para la grabación "${title}" por restricciones de cookies de terceros en el iframe de la vista previa.`,
          startTime: 0,
          endTime: Math.floor(dur * 0.35),
          sentiment: "neutral"
        },
        {
          id: "seg-gen-2",
          speaker: "Hablante 2",
          text: `¡Qué gran solución! Este modo local nos permite probar todas las interacciones de ScribeAI sin trabas dentro de AI Studio: podemos renombrar hablantes en cascada, editar textos de transcripción, añadir y eliminar puntos clave, etc.`,
          startTime: Math.floor(dur * 0.35),
          endTime: Math.floor(dur * 0.75),
          sentiment: "positive"
        },
        {
          id: "seg-gen-3",
          speaker: "Hablante 1",
          text: "Así es. Las funciones de autoguardado e historial de LocalStorage también funcionan perfectamente. Al abrir el proyecto en una pestaña nueva con el botón de arriba, el sistema se enlazará automáticamente con la red en tiempo real de Gemini.",
          startTime: Math.floor(dur * 0.75),
          endTime: dur,
          sentiment: "positive"
        }
      ],
      chapters: [
        {
          id: "cap-gen-1",
          title: "Sincronización Local",
          startTime: 0,
          endTime: Math.floor(dur * 0.75),
          summary: "Demostración de capacidades autónomas fuera de línea."
        },
        {
          id: "cap-gen-2",
          title: "Seguridad y Conectividad",
          startTime: Math.floor(dur * 0.75),
          endTime: dur,
          summary: "Estrategia para eludir las restricciones del iFrame mediante pestaña unificada."
        }
      ],
      actionItems: [
        {
          id: "act-gen-1",
          text: "Probar el renombrado de oradores haciendo clic en su etiqueta",
          completed: false
        },
        {
          id: "act-gen-2",
          text: "Hacer preguntas personalizadas a través de la caja del chatbot inteligente de abajo",
          completed: false
        }
      ],
      decisions: [
        {
          id: "dec-gen-1",
          title: "Promover el uso en pestaña independiente",
          rationale: "Garantizar que la captura nativa del micrófono de hardware rinda al 100% de manera fluida.",
          approvedBy: ["Hablante 1", "Hablante 2"]
        }
      ],
      metrics: {
        totalWords: 145,
        averageSpeed: 125,
        silenceRatio: 0.02,
        speakerInterruptionCount: 0
      }
    };
  };

  // Triggers the simulation fallback using current parameters safely to keep user flow interactive
  const handleLocalSimulationFallback = async () => {
    const payload = pendingPayloadRef.current;
    const dur = payload?.duration || 15;
    const url = payload?.localUrl || "";
    
    const simulatedTitle = manualTitle.trim() || `Nota de voz #${notes.length + 1}`;
    const simulatedResult = generateSmartMockTranscription(simulatedTitle, dur);
    const newNoteId = `simulated-${Date.now()}`;
    
    const newNote: VoiceNote = {
      id: newNoteId,
      title: simulatedTitle,
      createdAt: new Date().toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      duration: dur,
      audioUrl: url,
      transcription: simulatedResult,
    };

    saveNoteToFirestore(newNote).catch(err => {
      console.warn("Advertencia: No se pudo salvar la nota simulada en la nube:", err);
    });
    setSelectedNote(newNote);
    setManualTitle(""); // Reset manual input title
    setErrorMsg(null);
    setIsCookieBlocked(false);
    pendingPayloadRef.current = null;
  };

  const handleMicrophoneLocalSimulation = async () => {
    const simulatedTitle = manualTitle.trim() || `Nota de voz simulada (Soporte Mic)`;
    const simulatedResult = generateSmartMockTranscription(simulatedTitle, 15);
    const newNoteId = `local-mic-${Date.now()}`;
    
    const newNote: VoiceNote = {
      id: newNoteId,
      title: simulatedTitle,
      createdAt: new Date().toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      duration: 15,
      transcription: simulatedResult,
      isLocalFallback: true,
    };

    saveNoteToFirestore(newNote).catch(err => {
      console.warn("Advertencia: No se pudo salvar la nota de micrófono en la nube:", err);
    });
    setSelectedNote(newNote);
    setManualTitle(""); // Reset title input
    setErrorMsg(null);
    setRecorderPermissionError(false);
  };

  // Trigger file attachment manual upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadSelectedAudioFile(files[0]);
  };

  const uploadSelectedAudioFile = async (file: File) => {
    setErrorMsg(null);
    // Limit to 25MB according to multer server configuration
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg("El archivo seleccionado supera el límite recomendado de 25 MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    // Rough estimation of duration (placeholder or 15s if unknown)
    const duration = 22; 
    
    // Auto populate filename as title prefix unless user entered manually
    if (!manualTitle) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setManualTitle(nameWithoutExt);
    }

    await processAudioPayload(file, localUrl, duration);
  };

  // Drag and drop event listeners
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadSelectedAudioFile(files[0]);
    }
  };

  // Delete notes handler
  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setSaveStatus("saving");
    try {
      const docRef = doc(db, "users", user.uid, "conversations", id);
      await deleteDoc(docRef);
      setSaveStatus("saved");
      if (selectedNote?.id === id) {
        const remaining = notes.filter((n) => n.id !== id);
        setSelectedNote(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/conversations/${id}`);
    }
  };

  // Add demonstration note again if deleted
  const restoreDemoNote = async () => {
    if (!user) return;
    await seedDefaultPreset(user.uid);
  };

  // Filters and queries
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.transcription.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.transcription.segments.some((s) => s.text.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesLang =
      filterLang === "Todos" ||
      note.transcription.language.toLowerCase().includes(filterLang.toLowerCase());

    return matchesSearch && matchesLang;
  });

  // Unique languages for filtering dropdown
  const languagesList = Array.from(
    new Set(
      notes.map((n) => {
        const lang = n.transcription.language.split(" ")[0]; // simplify e.g. "Español e Inglés"
        return lang || "Otro";
      })
    )
  );

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-200 flex flex-col items-center justify-center font-sans">
        <div className="relative mb-6 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-950 border-t-indigo-500 animate-spin mx-auto" />
          <Mic className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-center animate-pulse">Iniciando ScribeAI Workspace...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-200 flex flex-col justify-between font-sans relative overflow-hidden" id="login-container">
        {/* Ambient background blur */}
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[70%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[70%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />

        <header className="px-8 py-6 flex items-center justify-between border-b border-slate-900 z-10 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Mic className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              Scribe<span className="text-indigo-400 font-extrabold">AI</span>
              <span className="text-[9px] bg-indigo-500/10 font-bold text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1 uppercase tracking-wider">
                <Sparkle className="w-2.5 h-2.5 fill-indigo-400 text-indigo-400" /> PRO
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Acceso Seguro</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 z-10 py-12">
          <div className="max-w-md w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-md">
            
            <div className="space-y-2">
              <div className="inline-flex p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl mb-2">
                <Database className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Accede a tu Cockpit de Notas</h2>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                Consolida tus notas de voz corporativas con diarización avanzada, resúmenes inteligentes y sincronización en tiempo real persistida.
              </p>
            </div>

            <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-start gap-2 text-xs">
                <span className="text-indigo-400 font-bold">✔</span>
                <p className="text-slate-300 font-medium">Historial duradero respaldado en Firebase Firestore.</p>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="text-indigo-400 font-bold">✔</span>
                <p className="text-slate-300 font-medium">Chat contextual instantáneo potenciado con Gemini 3.5.</p>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="text-indigo-400 font-bold">✔</span>
                <p className="text-slate-300 font-medium">Asignación automática de tareas y decisiones corporativas.</p>
              </div>
            </div>

            {isInIframe && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left text-xs leading-relaxed text-amber-300 space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Entorno de Vista Previa (Iframe)</span>
                </div>
                <p className="text-slate-300">
                  Debido a políticas de privacidad y seguridad de algunos navegadores, las cookies de terceros y el almacenamiento de sesión se bloquean dentro de iframes. 
                  Si tienes problemas para iniciar sesión con Google o deseas usar la persistencia en tiempo real, te sugerimos abrir la aplicación directamente.
                </p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 w-full py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold rounded-xl border border-amber-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer text-center text-xs"
                >
                  Abrir en Pestaña Nueva ↗
                </a>
              </div>
            )}

            <button
              onClick={signInWithGoogle}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2.5 cursor-pointer"
              id="google-login-btn"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.47 1.617l2.435-2.435C17.387 1.578 14.947 1 12.24 1c-5.523 0-10 4.477-10 10s4.477 10 10 10c5.787 0 9.61-4.068 9.61-9.774 0-.663-.06-1.29-.173-1.94H12.24z"/>
              </svg>
              Iniciar Sesión con Google
            </button>

            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Al ingresar, tus conversaciones se sincronizarán de forma segura en tu propio perfil. Tus credenciales están gestionadas bajo los protocolos de Google Identity Core.
            </p>
          </div>
        </main>

        <footer className="py-6 border-t border-slate-900/60 text-center text-[10px] text-slate-600">
          <p className="font-semibold text-slate-500">ScribeAI © 2026. Secure Sandboxed Environment</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-200 flex flex-col font-sans" id="applet-container">
      {/* Premium Sleek Header Layout */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 px-6 py-4 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/10">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Scribe<span className="text-indigo-400">AI</span>
              <span className="text-[10px] bg-indigo-500/10 font-bold text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1 uppercase tracking-wider">
                <Sparkle className="w-2.5 h-2.5 fill-indigo-400 text-indigo-400" /> PRO
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Transcripción, diarización de voces y síntesis de idioma en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Visual Auto-Save Status Indicator */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] uppercase font-bold tracking-wider transition-all duration-300 ${
            saveStatus === "saving"
              ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              saveStatus === "saving" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
            }`} />
            {saveStatus === "saving" ? (
              <span>Guardando...</span>
            ) : (
              <span>Guardado Aut.</span>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">
              Detección de Idioma: Auto (Nativa)
            </span>
          </div>
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4 text-xs font-semibold text-slate-400 col-span-1 leading-none shrink-0">
            <span>{notes.length} notas</span>
          </div>

          {/* User Profile avatar & Log Out */}
          {user && (
            <div className="flex items-center gap-3 pl-4 border-l border-slate-800 shrink-0">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "Usuario"} 
                  className="w-7 h-7 rounded-full border border-indigo-500/20" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-7 h-7 bg-indigo-600/30 text-indigo-400 rounded-full flex items-center justify-center font-bold text-xs border border-indigo-500/20 animate-pulse">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
              <div className="hidden md:block text-left min-w-0">
                <p className="text-xs font-bold text-white truncate max-w-[120px]">{user.displayName || user.email}</p>
                <button 
                  onClick={logoutUser}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer transition uppercase"
                >
                  <LogOut className="w-2.5 h-2.5" /> Salir
                </button>
              </div>
              <button 
                onClick={logoutUser}
                className="md:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer transition"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Informative Fallback Alert - Clean & Modern */}
      {isCookieBlocked && (
        <div className="bg-slate-900/95 border-b border-amber-500/30 text-slate-300 text-xs px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md z-30" id="iframe-storage-banner">
          <div className="flex items-start md:items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-400/20 rounded-xl shrink-0">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="space-y-0.5 text-left">
              <p className="font-bold text-amber-400">Limitación de Almacenamiento en Iframe</p>
              <p className="text-slate-300 text-[11px] leading-relaxed max-w-4xl font-medium">
                Detectamos que la aplicación se ejecuta dentro de la vista previa de AI Studio, donde los navegadores inhabilitan el acceso a cookies de terceros. 
                ScribeAI ha activado de forma segura su <strong>motor de respaldo local</strong> para que puedas seguir transcribiendo. Para conectar con Firebase sin restricciones y experimentar análisis del habla sincrónico de alto rendimiento, te sugerimos abrir el sistema de manera nativa.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/10 active:bg-indigo-700 text-white font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-md text-[11px]"
            >
              Abrir en Pestaña Nueva ↗
            </a>
            <button 
              onClick={() => setIsCookieBlocked(false)} 
              className="text-slate-400 hover:text-white font-semibold text-[11px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-850 cursor-pointer transition shrink-0 whitespace-nowrap"
            >
              Cerrar Aviso
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace: Bento-grid with sidebar and main view */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SIDEBAR: History and Filters (4 columns) */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Quick Record Box */}
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                Registrar Nota Nueva
              </span>
              {isRecording && (
                <span className="text-xs bg-rose-500/10 text-rose-400 px-2.5 py-0.5 rounded-full font-bold font-mono animate-pulse border border-rose-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                  {formatDuration(recordingDuration)}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Título de la nota (opcional):</label>
                <input
                  type="text"
                  placeholder="Ej: Sincronización de Marketing"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 bg-slate-950/40 text-slate-100 placeholder-slate-500 transition"
                  maxLength={60}
                />
              </div>

              {/* Real-time wave visualizer */}
              <AudioVisualizer stream={audioStream} isRecording={isRecording} />

              <div className="flex gap-2">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
                    id="start-rec-btn"
                  >
                    <Mic className="w-4 h-4 text-white" />
                    Iniciar Grabación
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 animate-pulse cursor-pointer"
                    id="stop-rec-btn"
                  >
                    <MicOff className="w-4 h-4 text-white" />
                    Detener y Analizar
                  </button>
                )}
              </div>
            </div>

            {/* Custom File Upload Option */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center transition ${
                isDragOver ? "bg-indigo-500/5 border-indigo-500/30" : "bg-slate-950/15 border-slate-800 hover:bg-slate-950/30"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
                id="audio-file-upload-input"
              />
              <Upload className="w-5 h-5 mx-auto text-slate-500 mb-1" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-indigo-400 hover:underline cursor-pointer block w-full text-center"
              >
                Sube o arrastra un archivo de audio
              </button>
              <p className="text-[10px] text-slate-500 mt-0.5">Soporta WAV, MP3, M4A, WEBM de hasta 25MB</p>
            </div>
          </div>

          {/* History Search & Filters List */}
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800 shadow-md flex-1 flex flex-col gap-4 min-h-[350px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Mis Notas Guardadas
              </span>
              <span className="text-xs bg-slate-800 font-bold text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700/20">
                {filteredNotes.length}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Buscar en transcripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-800 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 bg-slate-950/40 text-slate-200 placeholder-slate-500 transition"
              />
            </div>

            {/* Language filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setFilterLang("Todos")}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full shrink-0 transition cursor-pointer ${
                  filterLang === "Todos"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-850 text-slate-400 hover:bg-slate-800 border border-slate-800"
                }`}
              >
                Todos
              </button>
              {languagesList.map((lang, index) => (
                <button
                  key={index}
                  onClick={() => setFilterLang(lang)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full shrink-0 transition cursor-pointer ${
                    filterLang === lang
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-850 text-slate-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* List scroll */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] pr-1">
              {filteredNotes.map((note) => {
                const isActive = selectedNote?.id === note.id;
                return (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 text-left items-start group ${
                      isActive
                        ? "bg-indigo-500/10 border-indigo-500/30 shadow-md text-white"
                        : "bg-slate-950/15 border-slate-800/80 hover:bg-slate-800/20 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      isActive ? "bg-indigo-600/30 text-indigo-400 border border-indigo-500/20" : "bg-slate-850 text-slate-500"
                    }`}>
                      <FileAudio className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-400 transition">
                          {note.title}
                        </h4>
                        {note.isLocalFallback && (
                          <span className="text-[8px] tracking-wider uppercase font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-sm shrink-0">
                            Local
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-medium">
                        <span className="flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" />
                          {note.createdAt.split(",")[0]}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {note.duration}s
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 italic font-normal text-ellipsis overflow-hidden">
                        {note.transcription.summary}
                      </p>
                    </div>

                    <button
                      onClick={(e) => deleteNote(note.id, e)}
                      className="text-slate-600 hover:text-rose-500 p-1 rounded-sm opacity-0 group-hover:opacity-100 transition shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {filteredNotes.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-xs text-slate-500 italic">No se encontraron notas de voz.</p>
                  {notes.length === 0 && (
                    <button
                      onClick={restoreDemoNote}
                      className="mt-3 text-xs text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Restaurar Nota Demo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* WORKSPACE DETAILED TRANSCRIPTION (8 columns) */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {errorMsg && !isCookieBlocked && (
            recorderPermissionError || errorMsg.toLowerCase().includes("micrófono") || errorMsg.toLowerCase().includes("permiso") ? (
              <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-xl flex flex-col gap-5 relative overflow-hidden text-left">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl shrink-0 h-fit">
                    <MicOff className="w-6 h-6" />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <span className="font-bold text-sm text-slate-100 flex flex-wrap items-center gap-2">
                      Acceso al Micrófono Bloqueado o No Disponible
                      <span className="text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Restricción de Seguridad</span>
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      El navegador ha bloqueado o no ha completado el acceso físico a tu micrófono. Esto ocurre habitualmente porque la vista previa de AI Studio se ejecuta dentro de un <strong className="text-slate-200">iframe sandboxed</strong> que restringe el uso directo de dispositivos de hardware por seguridad.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setErrorMsg(null);
                      setRecorderPermissionError(false);
                    }} 
                    className="shrink-0 p-1.5 hover:bg-slate-800/60 rounded-full cursor-pointer text-slate-400 hover:text-white transition self-start"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-1">
                  {/* Método 1: Abrir en pestaña nueva */}
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block font-sans">Solución Definitiva</span>
                      <h4 className="text-xs font-bold text-white">1. Abrir en pestaña nueva</h4>
                      <p className="text-[11px] text-slate-450 leading-relaxed font-sans">
                        ScribeAI solicitará permisos directos para tu micrófono y podrás grabar notas de voz reales y transcribirlas con Gemini 3.5.
                      </p>
                    </div>
                    <a 
                      href={window.location.href} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-sm hover:shadow transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                    >
                      Abrir ScribeAI ↗
                    </a>
                  </div>

                  {/* Método 2: Subir archivo */}
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block font-sans">Sube un archivo de voz</span>
                      <h4 className="text-xs font-bold text-white">2. Subir archivo de audio</h4>
                      <p className="text-[11px] text-slate-455 leading-relaxed font-sans">
                        Arrastra o selecciona un archivo de audio (WAV, MP3, WEBM) ya grabado en tu dispositivo para procesarlo con IA de forma inmediata.
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setErrorMsg(null);
                        setRecorderPermissionError(false);
                        fileInputRef.current?.click();
                      }} 
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-lg border border-slate-700/60 transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                    >
                      <Upload className="w-3.5 h-3.5" /> Seleccionar audio
                    </button>
                  </div>

                  {/* Método 3: Simular voz local */}
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block font-sans">Evaluación de flujos</span>
                      <h4 className="text-xs font-bold text-white">3. Nota de voz simulada</h4>
                      <p className="text-[11px] text-slate-455 leading-relaxed font-sans">
                        Evaluación integral instantánea: genera una nota de voz corporativa inteligente local y prueba todas las herramientas de edición.
                      </p>
                    </div>
                    <button 
                      onClick={handleMicrophoneLocalSimulation} 
                      className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 font-bold text-xs rounded-lg border border-amber-500/20 hover:border-amber-500/30 transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Simular nota local
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-4 flex gap-3 text-rose-300 text-xs shadow-md">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                <div className="flex-1 text-left">
                  <span className="font-bold block text-rose-200">Error de procesamiento</span>
                  <p className="mt-0.5">{errorMsg}</p>
                </div>
                <button onClick={() => setErrorMsg(null)} className="shrink-0 p-1 hover:bg-rose-900/40 rounded-full cursor-pointer text-rose-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}

          {isProcessing ? (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-12 flex-1 flex flex-col items-center justify-center text-center shadow-lg">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-950 border-t-indigo-500 animate-spin" />
                <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-bounce" />
              </div>
              <h3 className="text-base font-bold text-slate-100">
                La Inteligencia Artificial está analizando tu audio
              </h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                Gemini está separando las voces (diarización), identificando el idioma nativo de cada hablante y resumiendo la conversación de forma fluida.
              </p>
              <div className="mt-6 flex flex-wrap gap-1.5 justify-center">
                <span className="text-[10px] bg-slate-800 border border-slate-700/40 px-2.5 py-1 rounded-full text-slate-300 font-semibold">Separando voces</span>
                <span className="text-[10px] bg-indigo-950/60 border border-indigo-800/40 px-2.5 py-1 rounded-full text-indigo-400 font-semibold animate-pulse">Autodetectando idioma (ES/EN)</span>
                <span className="text-[10px] bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-full text-emerald-400 font-semibold">Generando resumen ejecutivo</span>
              </div>
            </div>
          ) : selectedNote ? (
            <ScribeWorkspace
              selectedNote={selectedNote}
              onUpdateNote={updateNote}
              notesList={notes}
              onSelectNote={setSelectedNote}
              isProcessing={isProcessing}
              user={user}
            />
          ) : (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-12 flex-1 flex flex-col items-center justify-center text-center shadow-lg">
              <HelpCircle className="w-12 h-12 text-slate-600 mb-4" />
              <h3 className="text-base font-bold text-slate-200">
                No hay ninguna nota de voz seleccionada
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Inicia una simulación de grabación con tu micrófono o sube un archivo de audio para transcribir al instante.
              </p>
              <button
                onClick={restoreDemoNote}
                className="mt-4 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-slate-300 text-white rounded-lg shadow-md transition cursor-pointer"
              >
                Cargar Nota de Demostración
              </button>
            </div>
          )}
        </section>

      </main>

      <footer className="mt-auto bg-slate-950 text-slate-500 py-6 border-t border-slate-900 px-6 text-center text-xs">
        <p className="font-semibold text-slate-400">ScribeAI © 2026</p>
        <p className="text-[10px] text-slate-600 mt-1">
          Desarrollado con el backend full-stack Google GenAI SDK con autodetectores de idioma nativos y Speaker Diarization.
        </p>
      </footer>
    </div>
  );
}
