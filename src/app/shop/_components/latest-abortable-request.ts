export type LatestAbortableRequestTicket = {
  finish: () => void;
  isLatest: () => boolean;
  signal: AbortSignal;
};

/**
 * Coordinates one replaceable browser request. Aborting is the fast path;
 * the identity check is the correctness boundary for transports or test
 * doubles that still resolve after an abort signal.
 */
export class LatestAbortableRequest {
  private activeController: AbortController | null = null;
  private generation = 0;

  cancel() {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = null;
  }

  start(): LatestAbortableRequestTicket {
    this.activeController?.abort();

    const controller = new AbortController();
    const generation = this.generation + 1;

    this.generation = generation;
    this.activeController = controller;

    const isLatest = () =>
      this.generation === generation && this.activeController === controller;

    return {
      finish: () => {
        if (isLatest()) {
          this.activeController = null;
        }
      },
      isLatest,
      signal: controller.signal,
    };
  }
}
