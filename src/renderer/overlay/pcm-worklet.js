// Fixed 16 kHz mono PCM16. Flush returns the unpadded final packet before ack.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Int16Array(2048); this.count = 0; this.total = 0; this.stopped = false;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        this.stopped = true; this.emit(); this.port.postMessage({ flushed: true });
      }
    };
  }
  emit() {
    if (!this.count) return;
    const packet = this.samples.slice(0, this.count).buffer;
    this.port.postMessage(packet, [packet]); this.count = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (this.total++ >= 4800000) { this.stopped = true; this.emit(); return false; }
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      value = Math.max(-1, Math.min(1, value));
      this.samples[this.count++] = Math.round(value < 0 ? value * 32768 : value * 32767);
      if (this.count === this.samples.length) this.emit();
    }
    return true;
  }
}
registerProcessor('speakeasy-pcm', PcmCapture);
