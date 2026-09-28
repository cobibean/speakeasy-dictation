export const inferAudioExtension = (mimeType: string): string => {
  if (mimeType.includes('webm')) {
    return 'webm';
  }

  if (mimeType.includes('wav')) {
    return 'wav';
  }

  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    return 'mp3';
  }

  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    return 'm4a';
  }

  if (mimeType.includes('ogg') || mimeType.includes('opus')) {
    return 'ogg';
  }

  return 'audio';
};

export const audioFilenameForMimeType = (mimeType: string): string =>
  `utterance.${inferAudioExtension(mimeType)}`;
