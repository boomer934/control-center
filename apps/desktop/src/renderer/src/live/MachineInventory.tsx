import { useEffect, useState } from 'react';
import type { MachineSnapshot } from '@control-center/ipc-contract';

const REFRESH_MS = 15_000;
const gib = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const empty: MachineSnapshot = { docker: null, ports: null, gpu: null, ollama: null };

export function MachineInventory() {
  const [snapshot, setSnapshot] = useState<MachineSnapshot>();

  useEffect(() => {
    let active = true;
    async function refresh() {
      const inventory = await window.api.infra.snapshot().catch(() => empty);
      if (active) setSnapshot(inventory);
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const gpu = snapshot?.gpu;
  const ports = snapshot?.ports;
  const ollama = snapshot?.ollama;
  const docker = snapshot?.docker;
  return (
    <section className="machine-inventory" aria-label="Machine now">
      <h2>Machine now</h2>
      {snapshot ? (
        <ul>
          <li>{docker ? `${docker.running} containers running` : 'Docker unavailable'}</li>
          <li>
            {ports ? `${ports.listening} ports listening` : 'Ports unavailable'}
            {ports && ports.wildcard > 0 && <span> · {ports.wildcard} on all interfaces</span>}
          </li>
          <li>
            {gpu
              ? `${gib.format(gpu.usedMiB / 1024)} / ${gib.format(gpu.totalMiB / 1024)} GiB VRAM`
              : 'NVIDIA VRAM unavailable'}
          </li>
          <li>
            {ollama
              ? ollama.models.length > 0
                ? ollama.models
                    .map(({ name, inVram }) => `${name}${inVram ? ' in VRAM' : ' loaded'}`)
                    .join(', ')
                : 'No Ollama models loaded'
              : 'Ollama unavailable'}
          </li>
        </ul>
      ) : (
        <p>Reading local services…</p>
      )}
    </section>
  );
}
