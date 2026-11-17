type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper so the UI needs no framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'style') el.setAttribute('style', String(value));
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
