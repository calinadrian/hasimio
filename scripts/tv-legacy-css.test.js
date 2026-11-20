import {describe, expect, it} from 'vitest';
import postcss from 'postcss';
import {evaluateMedia, expandSelector, rewriteSelectors, tvLegacyCss} from './tv-legacy-css.mjs';

const run = css => postcss([tvLegacyCss()]).process(css, {from: undefined}).css.replace(/\s+/g, ' ').trim();

describe('TV legacy CSS', () => {
  it('expands :is() and :where() into plain selector lists', () => {
    expect(expandSelector('.a :is(.b,.c) .d')).toEqual(['.a .b .d', '.a .c .d']);
    expect(rewriteSelectors(':where(.a,.b):is(:hover,:focus-visible)')).toBe('.a:hover,.a:focus,.b:hover,.b:focus');
  });

  it('resolves width and height media queries against the 1280x720 surface', () => {
    expect(evaluateMedia('(max-width: 760px)')).toBe(false);
    expect(evaluateMedia('(min-width: 761px)')).toBe(true);
    expect(evaluateMedia('(max-width: 760px), (min-height: 600px)')).toBe(true);
    expect(evaluateMedia('(hover: hover)')).toBeUndefined();
    expect(evaluateMedia('(prefers-reduced-motion: reduce)')).toBeUndefined();
  });

  it('drops impossible media queries and unwraps certain ones', () => {
    expect(run('@media (max-width:760px){.a{color:red}} @media (min-width:700px){.b{color:blue}}')).toBe('.b{color:blue}');
  });

  it('adds flex gap fallbacks only for browsers without flex gap', () => {
    const css = run('.row{display:flex;gap:10px} .col{display:flex;flex-direction:column;gap:4px 8px} .grid{display:grid;gap:9px}');
    expect(css).toContain('html.no-flex-gap .row > :not(:last-child),html.no-flex-gap .row > [data-before-text]{margin-right:10px}');
    expect(css).toContain('html.no-flex-gap .row > [data-after-text]{margin-left:10px}');
    expect(css).toContain('html.no-flex-gap .col > :not(:last-child),html.no-flex-gap .col > [data-before-text]{margin-bottom:4px}');
    expect(css).not.toContain('.grid >');
  });

  it('spaces icons and badges from bare label text on the side the text is on', () => {
    const css = run('.button{display:inline-flex;gap:8px} .stack{display:flex;flex-direction:column;gap:4px}');
    expect(css).toContain('html.no-flex-gap .button > [data-before-text]{margin-right:8px}');
    expect(css).toContain('html.no-flex-gap .button > [data-after-text]{margin-left:8px}');
    expect(css).toContain('html.no-flex-gap .stack > [data-after-text]{margin-top:4px}');
  });

  it('turns centring-only grids into flex columns, which work on old Chromium buttons', () => {
    expect(run('.star{display:grid;place-items:center;width:36px}')).toBe('.star{display:flex;flex-direction:column;align-items:center;width:36px;justify-content:center}');
    expect(run('.cards{display:grid;place-items:center} .cards{grid-template-columns:1fr 1fr}')).toContain('.cards{display:grid;place-items:center}');
  });

  it('uses layout declared by another rule for the same element', () => {
    const css = run('.chips{display:flex;flex-wrap:wrap} .hasimio-tv .chips{gap:6px 12px}');
    expect(css).toContain('.no-flex-gap.hasimio-tv .chips > :not(:last-child)');
    expect(css).toContain('.no-flex-gap.hasimio-tv .chips > *{margin-top:3px}');
    expect(css).toContain('.no-flex-gap.hasimio-tv .chips > *{margin-bottom:3px}');
  });

  it('removes costly effects but keeps loading spinners', () => {
    const css = run('.a{backdrop-filter:blur(8px);filter:blur(4px);transition:opacity .2s;animation:hero-shimmer 1s infinite} .spin{animation:spin 1s linear infinite} @keyframes spin{to{transform:rotate(360deg)}}');
    expect(css).not.toMatch(/backdrop-filter|blur|transition|hero-shimmer/);
    expect(css).toContain('.spin{animation:spin 1s linear infinite}');
    expect(css).toContain('@keyframes spin');
  });

  it('lowers inset and dynamic viewport units', () => {
    expect(run('.a{inset:0;height:100dvh}')).toBe('.a{top:0;right:0;bottom:0;left:0;height:100vh}');
  });
});
