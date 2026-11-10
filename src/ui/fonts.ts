// Bundled typefaces (SIL Open Font License 1.1), latin subset only, served by Vite so the game
// works offline. Chakra Petch: display, labels and numerals. Barlow: body text.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';

/** Canvas text does not trigger web-font loading on its own, so ask for the faces up front. */
export function preloadFonts(): void {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  for (const f of ['600 12px "Chakra Petch"', '700 12px "Chakra Petch"', '500 12px "Chakra Petch"', '600 12px "Barlow"', '400 12px "Barlow"']) {
    fonts.load(f).catch(() => {});
  }
}
