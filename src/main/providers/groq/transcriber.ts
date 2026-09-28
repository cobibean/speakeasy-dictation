import { audioFilenameForMimeType } from '../../audio-format.js';
import type { Transcriber, TranscriptionInput } from '../types.js';

const GROQ_STT_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

export class GroqTranscriber implements Transcriber {
  constructor(private readonly apiKey: string) {}

  async transcribe({ audioBuffer, mimeType }: TranscriptionInput): Promise<string> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([audioBuffer], { type: mimeType }),
      audioFilenameForMimeType(mimeType)
    );
    formData.append('model', 'whisper-large-v3-turbo');

    const response = await fetch(GROQ_STT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Groq STT failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { text?: string };
    return payload.text?.trim() ?? '';
  }
}
