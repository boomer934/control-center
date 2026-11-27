import type { AppUpdateStatus } from '@control-center/ipc-contract';
import { Switch } from '../ui/primitives';

export function UpdateSettings({
  status,
  notice,
  onChange,
}: {
  status: AppUpdateStatus | null;
  notice: string;
  onChange(enabled: boolean): void;
}) {
  const available = status && status.phase !== 'unavailable';
  return (
    <div className="view-body" data-testid="view-settings">
      <h1 className="shell-title">Settings</h1>
      <div className="check-row">
        <div className="tx">
          <b>Automatic app updates</b>
          <span>
            {available
              ? 'Download stable releases from GitHub and install them when you close the app.'
              : status
                ? 'Available in the Windows installer build.'
                : 'Loading update settings…'}
          </span>
        </div>
        {available && (
          <Switch
            label="Automatic app updates"
            checked={status.phase !== 'disabled'}
            disabled={status.phase === 'installing'}
            onChange={onChange}
          />
        )}
      </div>
      {(notice || status?.phase === 'error') && (
        <p className="shell-error" role="status">
          {notice || 'The update could not be completed. The app will check again automatically.'}
        </p>
      )}
    </div>
  );
}
