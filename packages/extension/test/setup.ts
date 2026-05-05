// jsdom returns a 0×0 rect for every element, which trips the extractor's visibility
// guard. Patch it to return a small visible box unless the element opts out via
// __rect (used by tests that exercise position heuristics).
import { beforeEach } from 'vitest';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    const stub = (this as { __rect?: DOMRect }).__rect;
    if (stub) return stub;
    return new DOMRect(0, 0, 80, 24);
  };
});
