interface PracticeField extends EventTarget {
  value: string;
}

export const confirmPracticePaste = async (
  field: PracticeField,
  text: string,
  paste: () => Promise<void>,
  timeoutMs = 1500
): Promise<boolean> => {
  // macOS can deliver the input event after the paste IPC has returned. Observe
  // the field before dispatch, rather than treating one rendered frame as proof.
  const expected = text.replace(/\r\n?/gu, '\n');
  const matches = () => field.value === expected;
  let observe: () => void = () => undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const inserted = new Promise<boolean>((resolve) => {
    observe = () => { if (matches()) resolve(true); };
    field.addEventListener('input', observe);
    timeout = setTimeout(() => resolve(matches()), timeoutMs);
  });
  try {
    await paste();
    return matches() || await inserted;
  } finally {
    clearTimeout(timeout);
    field.removeEventListener('input', observe);
  }
};
