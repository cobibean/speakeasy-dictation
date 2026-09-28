export interface ClipboardWriter {
  writeText(text: string): void | Promise<void>;
  readText?(): string | Promise<string>;
}

export type PasteExecutor = (command: string, args: readonly string[]) => Promise<unknown>;
export type PastePlatform = 'darwin' | 'win32';

export interface PasteCommand {
  command: string;
  args: readonly string[];
}

const MACOS_PASTE_SCRIPT =
  'tell application "System Events" to keystroke "v" using command down';

// SendInput reports how many events were inserted. A lower-integrity process
// cannot inject into an elevated target; in that case it returns fewer than all
// four events and PowerShell exits non-zero. Never synthesize Enter.
const WINDOWS_PASTE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class SpeakeasyPasteInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion input;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)]
    public KEYBDINPUT keyboard;

    // INPUT's union must be sized for its largest native member. On x64,
    // MOUSEINPUT is 32 bytes while KEYBDINPUT is only 24 bytes; omitting this
    // member incorrectly marshals INPUT as 32 rather than 40 bytes.
    [FieldOffset(0)]
    public MOUSEINPUT mouse;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort virtualKey;
    public ushort scanCode;
    public uint flags;
    public uint time;
    public IntPtr extraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint flags;
    public uint time;
    public IntPtr extraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint SendInput(uint count, INPUT[] inputs, int size);

  private static INPUT Key(ushort virtualKey, uint flags) {
    return new INPUT {
      type = 1,
      input = new InputUnion {
        keyboard = new KEYBDINPUT {
          virtualKey = virtualKey,
          flags = flags
        }
      }
    };
  }

  public static void Paste() {
    const uint keyUp = 0x0002;
    int expectedInputSize = IntPtr.Size == 8 ? 40 : 28;
    int inputSize = Marshal.SizeOf(typeof(INPUT));
    if (inputSize != expectedInputSize) {
      throw new InvalidOperationException(
        "Unexpected INPUT size " + inputSize + "; expected " + expectedInputSize + "."
      );
    }

    INPUT[] inputs = {
      Key(0x11, 0),
      Key(0x56, 0),
      Key(0x56, keyUp),
      Key(0x11, keyUp)
    };

    uint inserted = SendInput((uint)inputs.Length, inputs, inputSize);
    if (inserted != inputs.Length) {
      throw new Win32Exception(Marshal.GetLastWin32Error(), "Ctrl+V injection was blocked.");
    }
  }
}
'@

Add-Type -TypeDefinition $source
[SpeakeasyPasteInput]::Paste()
`.trim();

export class ClipboardOnlyPasteError extends Error {
  readonly clipboardWritten = true;

  constructor(public readonly cause: unknown) {
    super('Paste was blocked. The dictated text is still available on the clipboard.');
    this.name = 'ClipboardOnlyPasteError';
  }
}

export const getPasteCommand = (platform: PastePlatform): PasteCommand => {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: ['-e', MACOS_PASTE_SCRIPT]
    };
  }

  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      WINDOWS_PASTE_SCRIPT
    ]
  };
};

export const pasteTextWithExecutor = async (
  text: string,
  clipboardWriter: ClipboardWriter,
  execute: PasteExecutor,
  platform: PastePlatform = 'darwin'
): Promise<void> => {
  // Electron 44 writes asynchronously. Never send Command-V before completion,
  // or claim recovery while the clipboard still contains an older value.
  await clipboardWriter.writeText(text);
  if (clipboardWriter.readText && await clipboardWriter.readText() !== text) {
    throw new Error('The dictated text could not be verified on the clipboard.');
  }

  const pasteCommand = getPasteCommand(platform);
  try {
    await execute(pasteCommand.command, pasteCommand.args);
  } catch (error) {
    throw new ClipboardOnlyPasteError(error);
  }
};
