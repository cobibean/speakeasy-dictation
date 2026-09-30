import { SpeakeasyError } from './errors.js';
import type { ProductTranscriptionResponse } from '../shared/product-api.js';
import { HOSTED_CONTRACT_VERSION } from './hosted-product-client.js';

export interface StreamingStart {
  operationId: string; deviceId: string; polishBeforePaste: boolean;
  cleanupStrength: 'minimal' | 'balanced' | 'strong';
}
export class StreamingTransport {
  private socket: WebSocket | undefined;
  private queue: ArrayBuffer[] = [];
  private queuedBytes = 0;
  private ready = false;
  private finished = false;
  private terminal = false;
  private totalBytes = 0;
  private sentBytes = 0;
  private maximumBytes = 9600000;
  private limitReached = false;
  private timer: ReturnType<typeof setTimeout>;
  private resolve!: (value: ProductTranscriptionResponse) => void;
  private reject!: (error: Error) => void;
  readonly result: Promise<ProductTranscriptionResponse>;
  onPolishing?: () => void;

  constructor(url: string, getToken: () => Promise<string>, private start: StreamingStart,
    socketFactory: (url: string) => WebSocket = url => new WebSocket(url)) {
    this.result = new Promise((resolve,reject) => { this.resolve=resolve; this.reject=reject; });
    void this.result.catch(() => undefined);
    this.timer = setTimeout(() => this.fail(), 9000);
    void (async () => {
      const token = await getToken();
      if (this.terminal) return;
      const socket = this.socket = socketFactory(url);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'start', ...start,
        contractVersion: HOSTED_CONTRACT_VERSION, accessToken: token })));
      socket.addEventListener('message', event => {
        if (this.terminal) return;
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'error') { this.fail(message.code); return; }
          if (message.type === 'ready') {
            if (this.ready || message.operationId !== start.operationId || message.provider !== 'deepgram' || !['nova-3','nova-2'].includes(message.model)
              || !Number.isSafeInteger(message.maxDurationSeconds) || message.maxDurationSeconds < 1 || message.maxDurationSeconds > 300) { this.fail(); return; }
            this.maximumBytes = message.maxDurationSeconds * 32000;
            this.ready = true; clearTimeout(this.timer);
            this.timer = setTimeout(() => this.fail(), 320000);
            for (const chunk of this.queue) this.sendAudio(chunk);
            this.queue=[]; this.queuedBytes=0;
            if (this.finished) this.sendFinish();
          } else if (message.type === 'polishing') this.onPolishing?.();
          else if (message.type === 'result') {
            if (!this.finished || message.operationId !== start.operationId || message.contractVersion !== HOSTED_CONTRACT_VERSION
              || typeof message.text !== 'string' || message.text.length > 32000 || !message.usage
              || !['transcribed','released'].includes(message.operationStatus)) { this.fail(); return; }
            this.terminal=true; clearTimeout(this.timer); this.queue=[];
            this.resolve(message); socket.close();
          }
        } catch { this.fail(); }
      });
      socket.addEventListener('error', () => this.fail());
      socket.addEventListener('close', () => { if (!this.terminal) this.fail(); });
    })().catch(error => { this.fail(error instanceof SpeakeasyError ? error.code : 'transcription-failed'); });
  }
  append(chunk: ArrayBuffer): boolean {
    if (this.limitReached) return true;
    if (this.terminal) return false;
    if (this.finished || chunk.byteLength < 2 || chunk.byteLength % 2 || chunk.byteLength > 65536 || this.totalBytes + chunk.byteLength > 9600000) { this.fail(); return false; }
    this.totalBytes += chunk.byteLength;
    if (!this.ready) {
      if (this.queuedBytes + chunk.byteLength > 256000) { this.fail(); return false; }
      this.queue.push(chunk); this.queuedBytes += chunk.byteLength;
    } else {
      this.sendAudio(chunk);
      if (this.limitReached) { this.finished = true; this.sendFinish(); }
    }
    return this.limitReached;
  }
  private sendAudio(chunk: ArrayBuffer): void {
    if (this.limitReached || this.terminal) return;
    if (!this.socket || this.socket.bufferedAmount > 256000) { this.fail(); return; }
    const remaining = this.maximumBytes - this.sentBytes;
    const packet = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    this.socket.send(packet); this.sentBytes += packet.byteLength;
    if (this.sentBytes === this.maximumBytes) { this.limitReached = true; this.finished = true; }
  }
  finish(): Promise<ProductTranscriptionResponse> {
    if (!this.finished && !this.terminal) {
      this.finished = true;
      if (!this.totalBytes) this.fail();
      else if (this.ready) this.sendFinish();
    }
    return this.result;
  }
  private sendFinish(): void {
    if (this.terminal) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.fail(), 20000);
    this.socket!.send(JSON.stringify({ type: 'finish' }));
  }
  cancel(): void { this.fail('transcription-failed'); }
  private fail(code = 'transcription-failed'): void {
    if (this.terminal) return;
    this.terminal=true; clearTimeout(this.timer); this.queue=[]; this.queuedBytes=0;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel' }));
    this.socket?.close();
    const allowed = ['auth-required','consent-required','usage-limit-reached','provider-budget-paused'] as const;
    const safeCode = allowed.find(c => c === code) ?? 'transcription-failed';
    this.reject(new SpeakeasyError(safeCode, 'Live transcription did not complete. Try the dictation again.'));
  }
}
