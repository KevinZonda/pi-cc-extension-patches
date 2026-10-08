import { spinnerFrames } from "./spinner.ts";

type Indicator = { frames?: string[]; intervalMs?: number };
type NativeLoader = {
  currentFrame: number;
  intervalId: unknown;
  spinnerColorFn(frame: string): string;
  stop(): void;
};
export type LoaderPrototype = {
  setIndicator(this: NativeLoader, options?: Indicator): void;
  getRenderedIndicator(this: NativeLoader): string;
};
const PATCH_KEY = Symbol.for("pi.cc-extension-patches.native-spinners");

/** Change default indicators using Pi's timer implementation; preserve explicitly supplied indicators. */
export function installNativeSpinners(prototype: LoaderPrototype, intervalMs: number): () => void {
  const host = prototype as LoaderPrototype & { [PATCH_KEY]?: { dispose(): void } };
  host[PATCH_KEY]?.dispose();
  const originalSet = prototype.setIndicator;
  const originalRender = prototype.getRenderedIndicator;
  const managed = new WeakSet<NativeLoader>();
  const seen = new WeakSet<NativeLoader>();
  const loaders = new Set<WeakRef<NativeLoader>>();
  const frames = spinnerFrames(frame => frame);
  let active = true;

  const set: LoaderPrototype["setIndicator"] = function (options) {
    if (active && options === undefined) {
      managed.add(this);
      if (!seen.has(this)) {
        seen.add(this);
        loaders.add(new WeakRef(this));
      }
      return originalSet.call(this, { frames, intervalMs });
    }
    managed.delete(this);
    return originalSet.call(this, options);
  };
  const render: LoaderPrototype["getRenderedIndicator"] = function () {
    return active && managed.has(this)
      ? this.spinnerColorFn(frames[this.currentFrame % frames.length])
      : originalRender.call(this);
  };
  const patch = {
    dispose() {
      if (!active) return;
      active = false;
      if (prototype.setIndicator === set) prototype.setIndicator = originalSet;
      if (prototype.getRenderedIndicator === render) prototype.getRenderedIndicator = originalRender;
      if (host[PATCH_KEY] === patch) delete host[PATCH_KEY];
      for (const ref of loaders) {
        const loader = ref.deref();
        if (!loader || !managed.has(loader)) continue;
        const running = loader.intervalId != null;
        managed.delete(loader);
        // Restore existing instances as well as future ones, without restarting stopped loaders.
        originalSet.call(loader, undefined);
        if (!running) loader.stop();
      }
      loaders.clear();
    },
  };
  host[PATCH_KEY] = patch;
  prototype.setIndicator = set;
  prototype.getRenderedIndicator = render;
  return () => patch.dispose();
}
