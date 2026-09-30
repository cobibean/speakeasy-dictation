export interface StreamingPcmCapture { finish(): Promise<void>; cancel(): void; }
export async function createStreamingPcm(stream: MediaStream, captureId: string, onLimit: () => void): Promise<StreamingPcmCapture | null> {
  const api = window.speakeasy;
  if (!api || !await api.beginStreamingCapture(captureId)) return null;
  const context = new AudioContext({ sampleRate: 16000 });
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let pending = Promise.resolve();
  let pendingBytes = 0, stopped = false;
  let error: unknown;
  let flushed!: () => void;
  const flush = new Promise<void>(resolve => { flushed = resolve; });
  const close = () => { source?.disconnect(); node?.disconnect(); void context.close(); };
  try {
    if (context.sampleRate !== 16000) throw new Error('Unsupported capture sample rate.');
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js?no-inline', import.meta.url).href);
    node = new AudioWorkletNode(context, 'speakeasy-pcm');
    node.port.onmessage = event => {
      if (event.data?.flushed) { flushed(); return; }
      const packet = event.data;
      if (!(packet instanceof ArrayBuffer) || stopped || error) return;
      pendingBytes += packet.byteLength;
      if (pendingBytes > 256000) { error = new Error('Live audio buffer overflow.'); api.cancelStreamingCapture(captureId); return; }
      pending = pending.then(async () => { if (await api.appendStreamingCapture(captureId, packet)) onLimit(); })
        .catch(cause => { error = cause; }).finally(() => { pendingBytes -= packet.byteLength; });
    };
    source = context.createMediaStreamSource(stream); source.connect(node);
    // Worklet must be pulled; its output is silence, never microphone monitoring.
    node.connect(context.destination); await context.resume();
    return {
      async finish() {
        if (stopped) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          node!.port.postMessage('flush');
          await Promise.race([flush, new Promise<never>((_, reject) => { timer=setTimeout(() => reject(new Error('Audio drain timed out.')), 1000); })]);
          await pending;
          if (error) throw error;
        } finally { clearTimeout(timer); stopped=true; close(); }
      },
      cancel() { stopped=true; close(); api.cancelStreamingCapture(captureId); }
    };
  } catch (cause) { close(); api.cancelStreamingCapture(captureId); throw cause; }
}
