import { useState, useEffect } from "react";
import { Download, Globe, Sparkles, User, FileText, CheckCircle2, ChevronRight, Volume2, Plus, Trash2 } from "lucide-react";
import { VoiceNote, DialogueSegment } from "../types";
import { generateExecutivePdf } from "../utils/pdfGenerator";

interface TranscriptionViewProps {
  note: VoiceNote;
  onUpdateNote: (updatedNote: VoiceNote) => void;
}

export function TranscriptionView({ note, onUpdateNote }: TranscriptionViewProps) {
  const data = note.transcription;
  const audioUrl = note.audioUrl;

  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Auto-save inline edits states
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState("");

  const [editingKeyPointIndex, setEditingKeyPointIndex] = useState<number | null>(null);
  const [keyPointText, setKeyPointText] = useState("");
  const [newKeyPointText, setNewKeyPointText] = useState("");
  const [isAddingKeyPoint, setIsAddingKeyPoint] = useState(false);

  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [segmentText, setSegmentText] = useState("");
  const [editingSpeakerIndex, setEditingSpeakerIndex] = useState<number | null>(null);
  const [speakerText, setSpeakerText] = useState("");

  useEffect(() => {
    setSummaryText(note.transcription.summary);
    setIsEditingSummary(false);
    setEditingKeyPointIndex(null);
    setNewKeyPointText("");
    setIsAddingKeyPoint(false);
    setEditingSegmentIndex(null);
    setEditingSpeakerIndex(null);
  }, [note.id]);

  const handleSaveSummary = () => {
    if (summaryText.trim() && summaryText.trim() !== note.transcription.summary) {
      onUpdateNote({
        ...note,
        transcription: {
          ...note.transcription,
          summary: summaryText.trim()
        }
      });
    }
    setIsEditingSummary(false);
  };

  const handleSaveKeyPoint = (index: number) => {
    if (keyPointText.trim() !== note.transcription.keyPoints[index]) {
      const updatedList = [...note.transcription.keyPoints];
      if (keyPointText.trim() === "") {
        updatedList.splice(index, 1);
      } else {
        updatedList[index] = keyPointText.trim();
      }
      onUpdateNote({
        ...note,
        transcription: {
          ...note.transcription,
          keyPoints: updatedList
        }
      });
    }
    setEditingKeyPointIndex(null);
  };

  const handleDeleteKeyPoint = (index: number) => {
    const updatedList = [...note.transcription.keyPoints];
    updatedList.splice(index, 1);
    onUpdateNote({
      ...note,
      transcription: {
        ...note.transcription,
        keyPoints: updatedList
      }
    });
  };

  const handleAddKeyPoint = () => {
    if (newKeyPointText.trim()) {
      const updatedList = [...note.transcription.keyPoints, newKeyPointText.trim()];
      onUpdateNote({
        ...note,
        transcription: {
          ...note.transcription,
          keyPoints: updatedList
        }
      });
      setNewKeyPointText("");
      setIsAddingKeyPoint(false);
    }
  };

  const handleSaveSegmentText = (index: number) => {
    if (segmentText.trim() && segmentText.trim() !== note.transcription.segments[index].text) {
      const updatedSegments = [...note.transcription.segments];
      updatedSegments[index] = {
        ...updatedSegments[index],
        text: segmentText.trim()
      };
      onUpdateNote({
        ...note,
        transcription: {
          ...note.transcription,
          segments: updatedSegments
        }
      });
    }
    setEditingSegmentIndex(null);
  };

  const handleSaveSpeakerName = (index: number) => {
    const oldName = note.transcription.segments[index].speaker;
    const newName = speakerText.trim();
    if (newName && newName !== oldName) {
      const updatedSegments = [...note.transcription.segments];
      updatedSegments.forEach((seg, sIdx) => {
        if (seg.speaker === oldName) {
          updatedSegments[sIdx] = {
            ...seg,
            speaker: newName
          };
        }
      });
      const uniqueSpeakers = Array.from(new Set(updatedSegments.map((s) => s.speaker)));
      onUpdateNote({
        ...note,
        transcription: {
          ...note.transcription,
          segments: updatedSegments,
          speakers: uniqueSpeakers
        }
      });
    }
    setEditingSpeakerIndex(null);
  };

  const getSpeakerColor = (speaker: string) => {
    // Generate a beautiful pastel color based on speaker name string
    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      { bg: "bg-indigo-500/15 border-indigo-500/30 text-indigo-300", dot: "bg-indigo-500", avatar: "bg-indigo-600 text-indigo-50" },
      { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-500", avatar: "bg-emerald-600 text-emerald-50" },
      { bg: "bg-amber-500/15 border-amber-500/30 text-amber-300", dot: "bg-amber-500", avatar: "bg-amber-600 text-amber-50" },
      { bg: "bg-rose-500/15 border-rose-500/30 text-rose-300", dot: "bg-rose-500", avatar: "bg-rose-600 text-rose-50" },
      { bg: "bg-sky-500/15 border-sky-500/30 text-sky-300", dot: "bg-sky-500", avatar: "bg-sky-600 text-sky-50" },
      { bg: "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300", dot: "bg-fuchsia-500", avatar: "bg-fuchsia-600 text-fuchsia-50" },
    ];
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const getLanguageFlag = (lang: string) => {
    const l = lang.toLowerCase();
    if (l.includes("espa") || l.includes("spanish")) return "🇪🇸";
    if (l.includes("ingl") || l.includes("english")) return "🇺🇸";
    if (l.includes("portu") || l.includes("portuguese")) return "🇧🇷";
    if (l.includes("franc") || l.includes("french")) return "🇫🇷";
    if (l.includes("alem") || l.includes("german")) return "🇩🇪";
    if (l.includes("ital") || l.includes("italian")) return "🇮🇹";
    return "🌐";
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(label);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const downloadText = () => {
    const dialogue = data.segments
      .map((s) => `[${s.speaker}]: ${s.text}`)
      .join("\n\n");
    
    const bulletPoints = data.keyPoints.map((p) => `- ${p}`).join("\n");

    const content = `=========================================
AUDIO TRANSCRIPTION WITH AI DIARIZATION
=========================================
Idioma Detectado: ${data.language}

-----------------------------------------
RESUMEN DE LA GRABACIÓN
-----------------------------------------
${data.summary}

-----------------------------------------
PUNTOS CLAVE & HISTORIA
-----------------------------------------
${bulletPoints}

-----------------------------------------
TRANSCRIPCIÓN COMPLETA POR HABLANTE
-----------------------------------------
${dialogue}
`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ScribeAI-Transcripcion-${data.language.replace(/[^a-zA-Z]/g, "")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" id="transcription-detail-view">
      {/* Overview Block */}
      <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/50 text-blue-400 border border-blue-900/40 rounded-lg">
            <Globe className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
              Idioma de la Nota
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xl">{getLanguageFlag(data.language)}</span>
              <span className="text-sm font-bold text-slate-200">
                {data.language || "Autodetectado"}
              </span>
            </div>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex gap-2 self-start md:self-center flex-wrap">
          <button
            onClick={() => generateExecutivePdf(note)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition active:scale-95 rounded-lg shadow-md cursor-pointer"
            id="download-pdf-btn"
          >
            <FileText className="w-3.5 h-3.5" />
            Descargar PDF Ejecutivo
          </button>
          <button
            onClick={downloadText}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition active:scale-95 rounded-lg shadow-md cursor-pointer"
            id="download-transcription-btn"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar Resumen & Transmisión (.txt)
          </button>
        </div>
      </div>

      {audioUrl && (
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-slate-800 text-slate-300 rounded-full">
            <Volume2 className="w-4 h-4 animate-bounce" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-slate-400 mb-1">Escuchar grabación:</div>
            <audio src={audioUrl} controls className="w-full h-8 outline-none filter invert opacity-90" />
          </div>
        </div>
      )}

      {/* Grid of Summary and Key Points */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IA summary */}
        <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-200">
                <Sparkles className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
                Resumen Inteligente (IA)
              </span>
              <div className="flex gap-2 items-center">
                {isEditingSummary ? (
                  <button
                    onClick={handleSaveSummary}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer font-bold"
                  >
                    Guardar
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSummaryText(note.transcription.summary);
                      setIsEditingSummary(true);
                    }}
                    className="text-xs text-indigo-400 hover:underline cursor-pointer"
                  >
                    Editar
                  </button>
                )}
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => copyToClipboard(data.summary, "summary")}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  {copiedSection === "summary" ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
            {isEditingSummary ? (
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                onBlur={handleSaveSummary}
                className="w-full text-sm leading-relaxed text-slate-300 bg-slate-950/70 p-4 rounded-xl border border-indigo-500/50 outline-none focus:ring-1 focus:ring-indigo-500 min-h-[120px]"
                autoFocus
              />
            ) : (
              <p
                onClick={() => {
                  setSummaryText(note.transcription.summary);
                  setIsEditingSummary(true);
                }}
                className="text-sm leading-relaxed text-slate-300 bg-slate-950/40 p-4 rounded-xl border border-slate-800/50 italic font-normal cursor-pointer hover:border-slate-700 hover:bg-slate-950/60 transition"
                title="Haz clic para editar el resumen"
              >
                "{data.summary}"
              </p>
            )}
          </div>
        </div>

        {/* IA keyPoints */}
        <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Puntos Clave y Decisiones
              </span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setIsAddingKeyPoint(true)}
                  className="text-xs text-emerald-400 hover:underline cursor-pointer"
                >
                  + Añadir
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => copyToClipboard(data.keyPoints.join("\n"), "points")}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  {copiedSection === "points" ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            </div>

            <ul className="space-y-2.5">
              {data.keyPoints.map((point, idx) => (
                <li key={idx} className="flex gap-2 items-start text-sm text-slate-300 group">
                  <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  <div className="flex-1">
                    {editingKeyPointIndex === idx ? (
                      <input
                        type="text"
                        value={keyPointText}
                        onChange={(e) => setKeyPointText(e.target.value)}
                        onBlur={() => handleSaveKeyPoint(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveKeyPoint(idx);
                          if (e.key === "Escape") setEditingKeyPointIndex(null);
                        }}
                        className="w-full text-sm bg-slate-950 border border-indigo-500/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <span
                          onClick={() => {
                            setKeyPointText(point);
                            setEditingKeyPointIndex(idx);
                          }}
                          className="cursor-pointer hover:text-indigo-300 flex-1"
                          title="Haz clic para editar"
                        >
                          {point}
                        </span>
                        <button
                          onClick={() => handleDeleteKeyPoint(idx)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 rounded cursor-pointer transition ml-2"
                          title="Eliminar punto clave"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}

              {isAddingKeyPoint && (
                <li className="flex gap-2 items-center text-sm text-slate-300 bg-slate-950/40 p-2 rounded border border-indigo-500/20">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <input
                    type="text"
                    placeholder="Nuevo punto clave o decisión..."
                    value={newKeyPointText}
                    onChange={(e) => setNewKeyPointText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddKeyPoint();
                      if (e.key === "Escape") setIsAddingKeyPoint(false);
                    }}
                    className="flex-1 text-xs bg-transparent border-none outline-none focus:ring-0 text-slate-200"
                    autoFocus
                  />
                  <button
                    onClick={handleAddKeyPoint}
                    className="text-xs text-emerald-400 font-bold hover:underline cursor-pointer"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setIsAddingKeyPoint(false)}
                    className="text-xs text-rose-400 font-bold hover:underline cursor-pointer ml-1"
                  >
                    Cancelar
                  </button>
                </li>
              )}
              {data.keyPoints.length === 0 && !isAddingKeyPoint && (
                <p className="text-xs text-slate-500 italic">No se han extraído puntos clave explícitos.</p>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Complete Speaker-Diarized transcription lines */}
      <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-800 shadow-xs animate-fadeIn">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-slate-800 text-slate-300 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-200">
              Transcripción por Hablante
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {data.speakers.length} hablante(s) detectado(s)
          </span>
        </div>

        <div className="space-y-4">
          {data.segments.map((segment, idx) => {
            const styles = getSpeakerColor(segment.speaker);
            const isEditingSpeaker = editingSpeakerIndex === idx;
            const isEditingText = editingSegmentIndex === idx;

            return (
              <div
                key={idx}
                className="flex items-start gap-4 p-4 rounded-xl transition-all duration-150 hover:bg-slate-900/40 group/segment"
              >
                <div 
                  onClick={() => {
                    setSpeakerText(segment.speaker);
                    setEditingSpeakerIndex(idx);
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 select-none cursor-pointer hover:opacity-80 transition ${styles.avatar}`}
                  title="Haz clic para renombrar este hablante"
                >
                  {segment.speaker.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {isEditingSpeaker ? (
                      <input
                        type="text"
                        value={speakerText}
                        onChange={(e) => setSpeakerText(e.target.value)}
                        onBlur={() => handleSaveSpeakerName(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveSpeakerName(idx);
                          if (e.key === "Escape") setEditingSpeakerIndex(null);
                        }}
                        className="text-xs font-bold text-slate-200 bg-slate-950 border border-indigo-500/50 rounded px-1.5 py-0.5"
                        autoFocus
                      />
                    ) : (
                      <span 
                        onClick={() => {
                          setSpeakerText(segment.speaker);
                          setEditingSpeakerIndex(idx);
                        }}
                        className="text-sm font-bold text-slate-200 hover:text-indigo-400 cursor-pointer transition flex items-center gap-1.5"
                        title="Haz clic para renombrar en toda la nota"
                      >
                        {segment.speaker}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${styles.bg}`}>
                      Audio
                    </span>
                  </div>

                  {isEditingText ? (
                    <textarea
                      value={segmentText}
                      onChange={(e) => setSegmentText(e.target.value)}
                      onBlur={() => handleSaveSegmentText(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveSegmentText(idx);
                        }
                        if (e.key === "Escape") setEditingSegmentIndex(null);
                      }}
                      className="w-full text-sm text-slate-300 leading-relaxed font-normal bg-slate-950 border border-indigo-500/50 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      rows={2}
                      autoFocus
                    />
                  ) : (
                    <p 
                      onClick={() => {
                        setSegmentText(segment.text);
                        setEditingSegmentIndex(idx);
                      }}
                      className="text-sm text-slate-300 leading-relaxed font-normal cursor-pointer hover:text-white transition"
                      title="Haz clic para editar frase"
                    >
                      {segment.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {data.segments.length === 0 && (
            <div className="text-center py-12 bg-slate-950/20 rounded-xl border border-dashed border-slate-800">
              <p className="text-sm text-slate-500">
                La transcripción no contiene diálogos o partes legibles.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
