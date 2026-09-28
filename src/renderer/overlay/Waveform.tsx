import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

interface WaveformProps {
  mode: 'idle' | 'listening' | 'processing' | 'alert';
  stream: MediaStream | null;
  scale?: number;
}

const BASE_BAR_WIDTH = 2;
const BASE_BAR_GAP = 2;
const BASE_MAX_HEIGHT = 16;
const BASE_MIN_HEIGHT = 2;
const BASE_CANVAS_GUTTER = 4;
const BASE_DEFAULT_CANVAS_WIDTH = 120;
const LISTENING_ATTACK = 0.32;
const LISTENING_RELEASE = 0.12;
const LISTENING_TRAIL_RELEASE = 0.075;
const PROCESSING_SCAN_PERIOD_MS = 2600;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type RgbTuple = readonly [number, number, number];

interface WaveformPalette {
  accent: RgbTuple;
  muted: RgbTuple;
  alert: RgbTuple;
}

interface WaveformMetrics {
  barWidth: number;
  barGap: number;
  maxHeight: number;
  minHeight: number;
  canvasHeight: number;
  defaultCanvasWidth: number;
  radius: number;
}

const getWaveformMetrics = (scale: number): WaveformMetrics => {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    barWidth: Math.max(1, BASE_BAR_WIDTH * safeScale),
    barGap: Math.max(1, BASE_BAR_GAP * safeScale),
    maxHeight: Math.max(4, BASE_MAX_HEIGHT * safeScale),
    minHeight: Math.max(1, BASE_MIN_HEIGHT * safeScale),
    canvasHeight: Math.max(6, Math.round((BASE_MAX_HEIGHT + BASE_CANVAS_GUTTER) * safeScale)),
    defaultCanvasWidth: Math.max(60, Math.round(BASE_DEFAULT_CANVAS_WIDTH * safeScale)),
    radius: Math.max(0.75, 1.5 * safeScale)
  };
};

const getBarCount = (width: number, metrics: WaveformMetrics): number => {
  const safeWidth = Math.max(metrics.defaultCanvasWidth, width);
  return Math.max(20, Math.floor((safeWidth + metrics.barGap) / (metrics.barWidth + metrics.barGap)));
};

const createIdlePattern = (barCount: number, metrics: WaveformMetrics): number[] =>
  Array.from({ length: barCount }, (_, index) => {
    const center = Math.max(1, (barCount - 1) / 2);
    const dist = Math.abs(index - center) / center;
    const editorialLift = 0.7 + Math.cos(index * 0.82) * 0.22;
    return metrics.minHeight + Math.max(0, 1 - dist * dist) * editorialLift * (metrics.maxHeight / BASE_MAX_HEIGHT);
  });

const emptyBars = (barCount: number, metrics: WaveformMetrics): number[] =>
  Array.from({ length: barCount }, () => metrics.minHeight);

const normalizeBarMemory = (
  bars: number[],
  barCount: number,
  metrics: WaveformMetrics
): number[] => {
  if (bars.length === barCount) {
    return bars;
  }

  return emptyBars(barCount, metrics);
};

const readRgbTuple = (element: HTMLElement, property: string, fallback: RgbTuple): RgbTuple => {
  const raw = getComputedStyle(element).getPropertyValue(property).trim();
  const values = raw
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length < 3) {
    return fallback;
  }

  return [
    Math.max(0, Math.min(255, values[0])),
    Math.max(0, Math.min(255, values[1])),
    Math.max(0, Math.min(255, values[2]))
  ];
};

const getWaveformPalette = (canvas: HTMLCanvasElement): WaveformPalette => ({
  accent: readRgbTuple(canvas, '--hud-accent-rgb', [216, 161, 74]),
  muted: readRgbTuple(canvas, '--hud-muted-rgb', [214, 197, 169]),
  alert: readRgbTuple(canvas, '--hud-alert-rgb', [201, 96, 47])
});

const rgba = ([red, green, blue]: RgbTuple, alpha: number): string =>
  `rgba(${red}, ${green}, ${blue}, ${alpha})`;

const drawBars = (
  ctx: CanvasRenderingContext2D,
  values: number[],
  color: string | CanvasGradient,
  width: number,
  height: number,
  metrics: WaveformMetrics,
  alpha = 1
): void => {
  const barCount = values.length;
  const totalWidth = barCount * metrics.barWidth + Math.max(0, barCount - 1) * metrics.barGap;
  const startX = (width - totalWidth) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = alpha;

  for (let index = 0; index < barCount; index += 1) {
    const barHeight = values[index] ?? metrics.minHeight;
    const x = startX + index * (metrics.barWidth + metrics.barGap);
    const y = (height - barHeight) / 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, metrics.barWidth, barHeight, metrics.radius);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
};

const makeListeningGradient = (
  ctx: CanvasRenderingContext2D,
  height: number,
  palette: WaveformPalette
): CanvasGradient => {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, rgba(palette.muted, 0.84));
  grad.addColorStop(0.48, rgba(palette.accent, 0.96));
  grad.addColorStop(1, rgba(palette.accent, 0.58));
  return grad;
};

const makeProcessingGradient = (
  ctx: CanvasRenderingContext2D,
  height: number,
  palette: WaveformPalette
): CanvasGradient => {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, rgba(palette.muted, 0.34));
  grad.addColorStop(0.52, rgba(palette.accent, 0.68));
  grad.addColorStop(1, rgba(palette.accent, 0.30));
  return grad;
};

const Waveform = ({ mode, stream, scale = 1 }: WaveformProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const listeningBarsRef = useRef<number[]>([]);
  const listeningTrailRef = useRef<number[]>([]);
  const processingPhaseRef = useRef(0);
  const metrics = useMemo(() => getWaveformMetrics(scale), [scale]);
  const [canvasWidth, setCanvasWidth] = useState(metrics.defaultCanvasWidth);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) {
      return;
    }
    const syncPreference = () => setReducedMotion(query.matches);
    syncPreference();
    query.addEventListener?.('change', syncPreference);
    return () => query.removeEventListener?.('change', syncPreference);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) {
      return;
    }

    const syncWidth = () => {
      const nextWidth = Math.max(metrics.defaultCanvasWidth, Math.floor(parent.clientWidth));
      setCanvasWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    syncWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncWidth);
      observer.observe(parent);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', syncWidth);
    return () => window.removeEventListener('resize', syncWidth);
  }, [metrics.defaultCanvasWidth]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return;
    }

    const barCount = getBarCount(canvas.width, metrics);
    const palette = getWaveformPalette(canvas);

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const renderIdle = () => {
      listeningBarsRef.current = [];
      listeningTrailRef.current = [];
      const color =
        mode === 'alert'
          ? rgba(palette.alert, 0.58)
          : rgba(palette.muted, 0.18);
      drawBars(ctx, createIdlePattern(barCount, metrics), color, canvas.width, canvas.height, metrics);
    };

    if (reducedMotion && (mode === 'listening' || mode === 'processing')) {
      const color =
        mode === 'listening'
          ? rgba(palette.accent, 0.88)
          : rgba(palette.accent, 0.5);
      drawBars(
        ctx,
        createIdlePattern(barCount, metrics),
        color,
        canvas.width,
        canvas.height,
        metrics
      );
      return undefined;
    }

    if (mode === 'listening' && stream) {
      let isDisposed = false;
      let ownedAudioContext: AudioContext | null = null;
      let ownedAnalyser: AnalyserNode | null = null;

      const startAudioCapture = async () => {
        const audioContext = new AudioContext();
        ownedAudioContext = audioContext;
        if (isDisposed) {
          void audioContext.close();
          return;
        }

        audioContextRef.current = audioContext;
        await audioContext.resume();

        if (isDisposed) {
          if (audioContextRef.current === audioContext) {
            audioContextRef.current = null;
          }
          void audioContext.close();
          return;
        }

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.9;
        ownedAnalyser = analyser;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const brassGrad = makeListeningGradient(ctx, canvas.height, palette);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          const activeAnalyser = analyserRef.current;
          if (!activeAnalyser) {
            return;
          }

          activeAnalyser.getByteFrequencyData(dataArray);

          // Use lower/mid bins where speech energy lives, then smooth hard so it
          // feels like a signal warming up instead of a graphic EQ.
          const usableBins = Math.floor(dataArray.length * 0.56);
          const step = Math.max(1, Math.floor(usableBins / barCount));
          const previous = normalizeBarMemory(listeningBarsRef.current, barCount, metrics);
          const trail = normalizeBarMemory(listeningTrailRef.current, barCount, metrics);
          const center = Math.max(1, (barCount - 1) / 2);

          const bars = Array.from({ length: barCount }, (_, index) => {
            let sum = 0;
            for (let inner = 0; inner < step; inner += 1) {
              sum += dataArray[index * step + inner] || 0;
            }
            const previousLeft = previous[Math.max(0, index - 1)] ?? metrics.minHeight;
            const previousCenter = previous[index] ?? metrics.minHeight;
            const previousRight = previous[Math.min(barCount - 1, index + 1)] ?? metrics.minHeight;
            const value = sum / step / 255;
            const centerWarmth = 0.78 + 0.24 * (1 - Math.abs(index - center) / center);
            const softened = Math.pow(clamp((value - 0.04) / 0.72, 0, 1), 0.58);
            const target =
              metrics.minHeight +
              softened * (metrics.maxHeight - metrics.minHeight) * centerWarmth;
            const neighborBlend = previousCenter * 0.64 + (previousLeft + previousRight) * 0.18;
            const smoothedTarget = target * 0.74 + neighborBlend * 0.26;
            const amount = smoothedTarget > previousCenter ? LISTENING_ATTACK : LISTENING_RELEASE;
            const next = previousCenter + (smoothedTarget - previousCenter) * amount;
            const nextTrail = Math.max(
              next,
              (trail[index] ?? metrics.minHeight) -
                (metrics.maxHeight - metrics.minHeight) * LISTENING_TRAIL_RELEASE
            );
            trail[index] = nextTrail;
            return clamp(next * 0.82 + nextTrail * 0.18, metrics.minHeight, metrics.maxHeight);
          });

          listeningBarsRef.current = bars;
          listeningTrailRef.current = trail;
          drawBars(ctx, bars, brassGrad, canvas.width, canvas.height, metrics, 0.94);
          animationRef.current = requestAnimationFrame(tick);
        };

        tick();
      };

      void startAudioCapture().catch(() => {
        if (ownedAudioContext && audioContextRef.current === ownedAudioContext) {
          void ownedAudioContext.close();
          audioContextRef.current = null;
        }
        if (ownedAnalyser && analyserRef.current === ownedAnalyser) {
          analyserRef.current = null;
        }
        if (isDisposed) {
          return;
        }
        renderIdle();
      });

      return () => {
        isDisposed = true;
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        if (ownedAudioContext && audioContextRef.current === ownedAudioContext) {
          void ownedAudioContext.close();
          audioContextRef.current = null;
        }
        if (ownedAnalyser && analyserRef.current === ownedAnalyser) {
          analyserRef.current = null;
        }
      };
    }

    if (mode === 'processing') {
      listeningBarsRef.current = [];
      listeningTrailRef.current = [];
      const procGrad = makeProcessingGradient(ctx, canvas.height, palette);
      const startedAt = performance.now() - processingPhaseRef.current * PROCESSING_SCAN_PERIOD_MS;

      const tick = () => {
        const elapsed = performance.now() - startedAt;
        const phase = elapsed / PROCESSING_SCAN_PERIOD_MS;
        processingPhaseRef.current = phase % 1;

        const bars = Array.from({ length: barCount }, (_, index) => {
          const position = index / Math.max(1, barCount - 1);
          const scan = phase % 1;
          const distance = Math.abs(position - scan);
          const wrappedDistance = Math.min(distance, 1 - distance);
          const scanLift = Math.max(0, 1 - wrappedDistance / 0.18) ** 2;
          const cadence = 0.5 + Math.sin(phase * Math.PI * 2 + index * 0.46) * 0.5;
          const tickMark = index % 6 === 0 ? 0.08 : 0;
          const heightRatio = 0.16 + cadence * 0.05 + scanLift * 0.32 + tickMark;
          return metrics.minHeight + heightRatio * (metrics.maxHeight - metrics.minHeight);
        });

        drawBars(ctx, bars, procGrad, canvas.width, canvas.height, metrics, 0.64);
        animationRef.current = requestAnimationFrame(tick);
      };

      tick();

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }

    renderIdle();
    return undefined;
  }, [mode, stream, canvasWidth, metrics, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      width={canvasWidth}
      height={metrics.canvasHeight}
      style={{ display: 'block', width: '100%', height: `${metrics.canvasHeight}px` }}
    />
  );
};

export default Waveform;
