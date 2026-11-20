// PostCSS plugin for the LG TV build only.
//
// webOS 6 renders the UI with Chromium 79 on a weak SoC. That engine drops
// whole rules that use :is(), :where() or :focus-visible, ignores flex `gap`
// (Chrome 84+), and struggles with blur and constant transitions. Rather than
// patching individual components in tv.css, rewrite the compiled CSS once:
//
// - drop media queries that can never match the fixed 1280x720 TV surface,
//   and unwrap those that always match;
// - expand :is()/:where() and turn :focus-visible into :focus (remote focus is
//   always keyboard focus);
// - add margin fallbacks for flex gaps, scoped to html.no-flex-gap so newer
//   TVs with native flex gap are not double-spaced;
// - remove blur, backdrop filters, transitions and decorative animations.

export const TV_VIEWPORT = {width: 1280, height: 720};
export const NO_FLEX_GAP_CLASS = 'no-flex-gap';
// Loading spinners stay animated: they are tiny and signal progress.
const KEPT_ANIMATIONS = /\bspin\b/;

function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0, quote = '', start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === separator && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** Expand the first :is()/:where() in a selector, recursively. */
export function expandSelector(selector) {
  const match = /:(is|where)\(/.exec(selector);
  if (!match) return [selector];
  let depth = 1, end = match.index + match[0].length;
  for (; end < selector.length && depth; end++) {
    if (selector[end] === '(') depth++;
    else if (selector[end] === ')') depth--;
  }
  const inner = selector.slice(match.index + match[0].length, end - 1);
  const before = selector.slice(0, match.index), after = selector.slice(end);
  return splitTopLevel(inner).flatMap(option => expandSelector(before + option + after));
}

export function rewriteSelectors(selectorList) {
  const expanded = splitTopLevel(selectorList)
    .map(selector => selector.replace(/:focus-visible\b/g, ':focus'))
    .flatMap(expandSelector);
  return [...new Set(expanded)].join(',');
}

/** true: always matches the TV, false: never matches, undefined: unknown. */
export function evaluateMedia(params, viewport = TV_VIEWPORT) {
  const queries = splitTopLevel(params);
  let anyUnknown = false;
  for (const query of queries) {
    if (/^\s*not\b/i.test(query) || /\bprint\b/i.test(query)) { anyUnknown = true; continue; }
    const features = query.match(/\([^()]*\)/g) || [];
    let result = true;
    for (const feature of features) {
      const range = /^\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)$/i.exec(feature);
      if (!range) { result = undefined; continue; }
      const value = viewport[range[2].toLowerCase()], limit = Number(range[3]);
      const ok = range[1].toLowerCase() === 'min' ? value >= limit : value <= limit;
      if (!ok) { result = false; break; }
    }
    if (result === true) return true;
    if (result === undefined) anyUnknown = true;
  }
  return anyUnknown ? undefined : false;
}

const flexKey = selector => selector.replace(/^(html)?\.hasimio-tv\s+/, '').trim();

function scopeToNoFlexGap(selector) {
  const scoped = '.' + NO_FLEX_GAP_CLASS;
  if (/^(html)?\.hasimio-tv\b/.test(selector)) return selector.replace(/^(html)?\.hasimio-tv/, (all, html) => (html || '') + scoped + '.hasimio-tv');
  if (/^html\b/.test(selector)) return selector.replace(/^html/, 'html' + scoped);
  if (/^:root\b/.test(selector)) return selector.replace(/^:root/, ':root' + scoped);
  return 'html' + scoped + ' ' + selector;
}

function parseGap(rule) {
  let row, column;
  rule.walkDecls(/^(gap|row-gap|column-gap|grid-gap)$/, decl => {
    if (decl.parent !== rule) return;
    const values = splitTopLevel(decl.value, ' ');
    if (decl.prop === 'gap' || decl.prop === 'grid-gap') { row = values[0]; column = values[1] || values[0]; }
    else if (decl.prop === 'row-gap') row = decl.value;
    else column = decl.value;
  });
  return {row, column};
}

const isZero = value => !value || /^0(px|rem|em|%)?$/.test(value) || value === 'normal';
const half = value => { const match = /^(\d*\.?\d+)(px|rem|em)$/.exec(value); return match ? Number(match[1]) / 2 + match[2] : 'calc(' + value + ' / 2)'; };

function ownLayout(rule) {
  const layout = {};
  for (const node of rule.nodes || []) {
    if (node.type !== 'decl') continue;
    if (node.prop === 'display') layout.display = node.value;
    else if (node.prop === 'flex-direction') layout.direction = node.value;
    else if (node.prop === 'flex-wrap') layout.wrap = node.value;
    else if (node.prop === 'flex-flow') {
      for (const part of node.value.split(/\s+/)) {
        if (/^(row|column)/.test(part)) layout.direction = part;
        else if (/wrap/.test(part)) layout.wrap = part;
      }
    }
  }
  return layout;
}

const insideKeyframes = node => { for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true; return false; };

export function tvLegacyCss() {
  return {
    postcssPlugin: 'tv-legacy-css',
    OnceExit(root) {
      // 1. Media queries resolved against the fixed TV viewport.
      root.walkAtRules('media', atRule => {
        const result = evaluateMedia(atRule.params);
        if (result === false) atRule.remove();
        else if (result === true) atRule.replaceWith((atRule.nodes || []).slice());
      });

      // 2. Declarations: viewport units, inset, and costly effects.
      root.walkDecls(decl => {
        decl.value = decl.value.replace(/\b(\d*\.?\d+)[dsl]vh\b/g, '$1vh');
        if (decl.prop === 'inset' && !decl.value.includes('(')) {
          const values = decl.value.trim().split(/\s+/);
          if (values.length >= 1 && values.length <= 4) {
            const [top, right = top, bottom = top, left = right] = values;
            for (const [prop, value] of Object.entries({top, right, bottom, left})) decl.cloneBefore({prop, value});
            decl.remove();
          }
          return;
        }
        if (/^(-webkit-)?backdrop-filter$/.test(decl.prop)) { decl.remove(); return; }
        if (decl.prop === 'filter' && /blur\(/.test(decl.value)) { decl.remove(); return; }
        if (/^transition(-|$)/.test(decl.prop)) { decl.remove(); return; }
        if (/^animation(-name)?$/.test(decl.prop) && !insideKeyframes(decl) && !KEPT_ANIMATIONS.test(decl.value)) decl.remove();
      });

      // 2b. Chromium 79 cannot make a <button> a grid container (Chrome 83+),
      //     so "display:grid;place-items:center" leaves icons off-centre.
      //     A centring-only grid is equivalent to a centred flex column.
      //     Selectors given grid tracks by any other rule are left alone.
      const tracked = new Set();
      root.walkDecls(/^grid(-template|-auto-flow|-auto-columns|-column|-row|-area|$)/, decl => {
        if (decl.parent && decl.parent.type === 'rule') for (const selector of splitTopLevel(decl.parent.selector)) tracked.add(flexKey(selector));
      });
      root.walkRules(rule => {
        if (insideKeyframes(rule)) return;
        if (splitTopLevel(rule.selector).some(selector => tracked.has(flexKey(selector)))) return;
        const decls = (rule.nodes || []).filter(node => node.type === 'decl');
        const display = decls.find(decl => decl.prop === 'display' && /^(inline-)?grid$/.test(decl.value));
        if (!display) return;
        if (decls.some(decl => /^grid-(template|auto-flow|auto-columns|column|row|area)/.test(decl.prop) || decl.prop === 'grid')) return;
        const place = decls.find(decl => decl.prop === 'place-items' && /^center( center)?$/.test(decl.value));
        const align = decls.find(decl => decl.prop === 'align-items' && decl.value === 'center');
        const justify = decls.find(decl => decl.prop === 'justify-items' && decl.value === 'center');
        if (!place && !(align && justify)) return;
        display.value = display.value.replace('grid', 'flex');
        display.cloneAfter({prop: 'flex-direction', value: 'column'});
        (place || justify).replaceWith({prop: 'align-items', value: 'center'});
        if (place) place.remove(); else if (align) align.remove();
        rule.append({prop: 'justify-content', value: 'center'});
      });

      // 3. Selectors Chromium 79 would reject wholesale.
      root.walkRules(rule => {
        if (insideKeyframes(rule)) return;
        if (/:(is|where)\(|:focus-visible/.test(rule.selector)) rule.selector = rewriteSelectors(rule.selector);
      });

      // 4. Flex gap fallbacks. Later rules for the same selector win, as in
      //    the cascade; the TV class prefix is ignored when matching.
      const layouts = new Map();
      root.walkRules(rule => {
        if (insideKeyframes(rule)) return;
        const layout = ownLayout(rule);
        if (!Object.keys(layout).length) return;
        for (const selector of splitTopLevel(rule.selector)) {
          const key = flexKey(selector);
          layouts.set(key, Object.assign({}, layouts.get(key), layout));
        }
      });
      const additions = [];
      root.walkRules(rule => {
        if (insideKeyframes(rule) || rule.selector.includes(NO_FLEX_GAP_CLASS)) return;
        const {row, column} = parseGap(rule);
        if (isZero(row) && isZero(column)) return;
        const own = ownLayout(rule);
        const groups = new Map();
        for (const selector of splitTopLevel(rule.selector)) {
          if (/::?(before|after|placeholder|selection)/.test(selector)) continue;
          const layout = Object.assign({}, layouts.get(flexKey(selector)), own);
          if (!/^(inline-)?flex$/.test(layout.display || '')) continue;
          const direction = layout.direction || 'row';
          const vertical = direction.startsWith('column'), reverse = direction.endsWith('reverse');
          const wraps = layout.wrap && layout.wrap !== 'nowrap';
          const add = (child, prop, value) => {
            if (isZero(value)) return;
            const declaration = prop + ':' + value;
            groups.set(declaration, (groups.get(declaration) || []).concat(scopeToNoFlexGap(selector) + ' > ' + child));
          };
          // Label text is not an element, so ":not(:last-child)" cannot space
          // it from a neighbouring icon or badge ("(i) Details", "Top 100 [82]").
          // bootstrap.ts marks elements that sit directly before or after
          // label text with data-before-text / data-after-text.
          if (vertical) {
            add(':not(:last-child)', reverse ? 'margin-top' : 'margin-bottom', row);
            add('[data-before-text]', reverse ? 'margin-top' : 'margin-bottom', row);
            add('[data-after-text]', reverse ? 'margin-bottom' : 'margin-top', row);
          } else {
            add(':not(:last-child)', reverse ? 'margin-left' : 'margin-right', column);
            add('[data-before-text]', reverse ? 'margin-left' : 'margin-right', column);
            add('[data-after-text]', reverse ? 'margin-right' : 'margin-left', column);
            // Split the row gap above and below each item, so a single-line
            // row stays vertically centred.
            if (wraps && !isZero(row)) { add('*', 'margin-top', half(row)); add('*', 'margin-bottom', half(row)); }
          }
        }
        for (const [declaration, selectors] of groups) {
          const separator = declaration.indexOf(':');
          additions.push({after: rule, selector: selectors.join(','), prop: declaration.slice(0, separator), value: declaration.slice(separator + 1)});
        }
      });
      for (const {after, selector, prop, value} of additions.reverse()) {
        const fallback = after.clone({selector, nodes: []});
        fallback.append({prop, value});
        after.after(fallback);
      }
    }
  };
}
tvLegacyCss.postcss = true;
