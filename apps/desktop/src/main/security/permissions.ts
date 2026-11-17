// Web permissions (camera, microphone, notifications, geolocation, clipboard, devices…) are
// denied by default. A future feature that needs one must allow that single permission here,
// with a test, after a note in docs/memoria/SICUREZZA.md.

/** Permissions the app grants. Empty on purpose. */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set<string>();

export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/** For session.setPermissionRequestHandler. */
export function permissionRequestHandler(
  _webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
): void {
  callback(isPermissionAllowed(permission));
}

/** For session.setPermissionCheckHandler. */
export function permissionCheckHandler(_webContents: unknown, permission: string): boolean {
  return isPermissionAllowed(permission);
}

/** For session.setDevicePermissionHandler (HID, serial, USB): always denied. */
export function devicePermissionHandler(): boolean {
  return false;
}
