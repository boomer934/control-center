import type { Plugin } from 'vite';

// xterm 6.0's DOM renderer generates theme/dimension styles at runtime. Keep the policy
// that rejects inline markup by creating these styles via CSSOM in the bundled dependency.
// A changed upstream layout must be reviewed instead of silently shipping blocked styles.
export function xtermCsp(): Plugin {
  return {
    name: 'xterm-csp',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/@xterm/xterm/lib/xterm.mjs')) return;

      const styles =
        /([\w$.]+)\.createElement\("style"\),[\w$.]+\.appendChild\(this\.(_styleElement|_dimensionsStyleElement|_themeStyleElement)\)/g;
      const attributes =
        /([\w$]+)\.setAttribute\("style",`\$\{\1\.getAttribute\("style"\)\|\|""\}\$\{([\w$]+)\};`\)/g;
      if ([...code.matchAll(styles)].length !== 3 || [...code.matchAll(attributes)].length !== 1) {
        this.error('Review the xterm CSSOM adapter before updating @xterm/xterm.');
      }

      const adapter = `
function ccTerminalStyles(doc) {
  const sheet = new CSSStyleSheet();
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return {
    set textContent(css) { sheet.replaceSync(css); },
    remove() { doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(item => item !== sheet); },
  };
}
`;
      return {
        code:
          adapter +
          code
            .replace(styles, 'ccTerminalStyles($1)')
            .replace(attributes, '$1.style.cssText += $2 + ";"'),
        map: null,
      };
    },
  };
}
