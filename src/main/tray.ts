import { Menu, Tray, nativeImage } from 'electron';

type TrayHandlers = {
  appName: string;
  openLabel?: string;
  onOpenSettings: () => void;
  onQuit: () => void;
};

let tray: Tray | null = null;

const iconDataUrl =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAVFBMVEUAAABycnJyc3Nzc3N1dXV2dnZ3d3d6enp7e3t9fX1/f3+AgICBgYGCgoKDg4OFhYWHh4eIiIiJiYmKioqLi4uysrK5ubm8vLy9vb1XqXjqAAAAHXRSTlMAAQIDBAUGBwgJDA0ODxAREhMUFRYXGBkaGxwuSKwAAABPSURBVBjTY2CAAQYGBmZgYIABiwqCkYGBgQFGBiYmRgYWBlYGBgZWBhYGRgZGBoYGTgZGBkYmFgYmJhZGBmYAAAx0QH36lGgJQAAAABJRU5ErkJggg==';

export const createTray = ({
  appName,
  openLabel = 'Settings',
  onOpenSettings,
  onQuit
}: TrayHandlers): Tray => {
  if (tray) {
    return tray;
  }

  const image = nativeImage.createFromDataURL(iconDataUrl);
  image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip(appName);

  const menu = Menu.buildFromTemplate([
    {
      label: openLabel,
      click: onOpenSettings
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: onQuit
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', onOpenSettings);

  return tray;
};
