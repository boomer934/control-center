// Layout worker of the map (phase 5b): ELK runs here, off the interface thread. One request in,
// one response out; the page keeps only the answer to its latest request.
import type { PackRequest, PackResponse } from './layout';
import { packBoxes } from './pack';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PackRequest>) => void) | null;
  postMessage(message: PackResponse | { id: number; error: true }): void;
};

scope.onmessage = (event) => {
  const request = event.data;
  packBoxes(request).then(
    (response) => scope.postMessage(response),
    () => scope.postMessage({ id: request.id, error: true }),
  );
};
