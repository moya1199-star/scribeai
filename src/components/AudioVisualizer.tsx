import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export function AudioVisualizer({ stream, isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isRecording || !stream || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;

      const draw = () => {
        if (!canvasCtx || !canvas) return;
        
        const width = canvas.width;
        const height = canvas.height;
        
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = "rgb(248, 250, 252)"; // Slate 50
        canvasCtx.fillRect(0, 0, width, height);

        // Draw animated beautiful audio waves
        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i];

          // Cool gradient
          const percent = barHeight / 255;
          const r = 59 + percent * 100; // Indigo / Purple spectrum
          const g = 130 + percent * 50;
          const b = 246;

          canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;

          // Draw double-sided mirror bars for premium look
          const roundedHeight = (percent * height * 0.8) + 4;
          const y = (height - roundedHeight) / 2;

          canvasCtx.beginPath();
          canvasCtx.roundRect(x, y, barWidth - 2, roundedHeight, 3);
          canvasCtx.fill();

          x += barWidth;
        }

        animationRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (err) {
      console.error("No se pudo iniciar el visualizador de audio:", err);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stream, isRecording]);

  return (
    <div className="relative w-full rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-3 h-24 overflow-hidden">
      {isRecording ? (
        <canvas
          ref={canvasRef}
          width={400}
          height={80}
          className="w-full h-full block rounded-lg"
          id="audio-canvas-recorder"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="flex gap-1 items-center justify-center">
            <span className="w-1.5 h-3 bg-slate-300 rounded-full animate-pulse"></span>
            <span className="w-1.5 h-5 bg-slate-300 rounded-full animate-pulse delay-75"></span>
            <span className="w-1.5 h-7 bg-slate-300 rounded-full animate-pulse delay-150"></span>
            <span className="w-1.5 h-5 bg-slate-300 rounded-full animate-pulse delay-75"></span>
            <span className="w-1.5 h-3 bg-slate-300 rounded-full animate-pulse"></span>
          </div>
          <p className="text-xs font-medium">Visualizador listo. Presiona Iniciar Grabación</p>
        </div>
      )}
    </div>
  );
}
