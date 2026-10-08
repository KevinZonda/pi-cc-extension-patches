type DisplayLoader = {
  kind?: string;
  message: string;
};
type DisplayMethod = (this: DisplayLoader) => void;
export type DisplayPrototype = { updateDisplay: DisplayMethod };
type Patch = { dispose(): void };

// Symbol.for survives Pi's module reload. Dispose only restores our own wrapper.
const PATCH_KEY = Symbol.for("pi.cc-extension-patches.working-verb");

export function replaceWorkingPrefix(message: string, verb: string): string {
  return message.replace(/^Working(?:\.\.\.|…)(?=$|[\s(])/, () => `${verb}…`);
}

/** Decorate the final display, leaving the message stored by the main extension intact. */
export function installWorkingVerb(
  prototype: DisplayPrototype,
  decorate: (message: string) => string,
): () => void {
  const host = prototype as DisplayPrototype & { [PATCH_KEY]?: Patch };
  host[PATCH_KEY]?.dispose();
  const original = prototype.updateDisplay;
  let active = true;
  const wrapped: DisplayMethod = function () {
    // Only the interactive working indicator; leave retries, compaction and dialogs alone.
    if (!active || this.kind !== "working" || typeof this.message !== "string") {
      return original.call(this);
    }
    const storedMessage = this.message;
    this.message = decorate(storedMessage);
    try {
      return original.call(this);
    } finally {
      this.message = storedMessage;
    }
  };
  const patch: Patch = {
    dispose() {
      active = false;
      if (prototype.updateDisplay === wrapped) prototype.updateDisplay = original;
      if (host[PATCH_KEY] === patch) delete host[PATCH_KEY];
    },
  };
  host[PATCH_KEY] = patch;
  prototype.updateDisplay = wrapped;
  return () => patch.dispose();
}
