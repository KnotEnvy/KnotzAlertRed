/**
 * The announcer. Every line is classified into a category with its own synthesised earcon
 * (which plays whether or not speech is enabled). Speech itself uses the browser's
 * speechSynthesis with the best voice we can find, and is prioritised so an attack warning
 * is never cut off by "Unit ready".
 */
export type VoCategory = 'alert' | 'good' | 'bad' | 'info';

const PRIORITY: Record<VoCategory, number> = { info: 0, good: 1, bad: 2, alert: 3 };

/** Classify an announcer line. */
export function categorize(line: string): VoCategory {
  const s = line.toLowerCase();
  if (/attack|danger|warning|detected|incoming/.test(s)) return 'alert';
  if (/lost|down|failed|destroyed|insufficient|low power|defeat/.test(s)) return 'bad';
  if (/complete|ready|captured|accomplished|restored|promoted|victory/.test(s)) return 'good';
  return 'info';
}

/** Rank a speech voice: natural / neural English voices first, novelty voices never. */
function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!/^en/i.test(v.lang)) return -100;
  const n = v.name;
  let s = 0;
  if (/en[-_](US|GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 5;
  if (/natural|neural|online|premium|enhanced/i.test(n)) s += 30;
  if (/microsoft (aria|jenny|guy|sonia|ryan|libby|davis|andrew|emma|brian|ava|christopher|eric|michelle)/i.test(n)) s += 20;
  if (/google (us|uk) english/i.test(n)) s += 18;
  if (/samantha|daniel|karen|moira|serena|alex|evan|zoe|allison|susan|tom\b|ava\b/i.test(n)) s += 12;
  if (/zira|david|mark|hazel|george|susan/i.test(n)) s += 8;
  if (/espeak|fred|albert|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|hysterical|organ|superstar|jester|good news|wobble|deranged|bahh|junior|ralph|kathy|princess|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy/i.test(n)) s -= 60;
  if (v.localService) s += 3;
  if (v.default) s += 1;
  return s;
}

export class Announcer {
  /** Name of the voice in use (for the soundboard). */
  voiceName = '';
  private voice: SpeechSynthesisVoice | null = null;
  private speaking = false;
  private currentPrio = -1;
  private lastLine = '';
  private lastLineAt = -1e9;
  private lastStart = -1e9;
  private pending: number | null = null;
  private release: number | null = null;
  private readonly synth: SpeechSynthesis | null;

  constructor(private onDuck: (on: boolean) => void) {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (this.synth) {
      this.pickVoice();
      try {
        this.synth.addEventListener('voiceschanged', () => this.pickVoice());
      } catch {
        /* older engines */
      }
    }
  }

  get available(): boolean {
    return !!this.synth;
  }

  private pickVoice(): void {
    try {
      const voices = this.synth?.getVoices() ?? [];
      let best: SpeechSynthesisVoice | null = null;
      let bestScore = -50;
      for (const v of voices) {
        const s = scoreVoice(v);
        if (s > bestScore) {
          best = v;
          bestScore = s;
        }
      }
      this.voice = best;
      this.voiceName = best ? best.name : '';
    } catch {
      this.voice = null;
    }
  }

  /** Speak a line (if allowed by priority). `delayMs` lets the earcon sound first. */
  speak(line: string, cat: VoCategory, volume: number, delayMs = 130): void {
    const synth = this.synth;
    if (!synth) return;
    const now = performance.now();
    const prio = PRIORITY[cat];
    if (line === this.lastLine && now - this.lastLineAt < 4000) return;
    if (this.speaking && prio < this.currentPrio && now - this.lastStart < 3500) return;
    if (this.speaking && prio === this.currentPrio && now - this.lastStart < 1200) return;
    this.lastLine = line;
    this.lastLineAt = now;
    this.lastStart = now;
    this.currentPrio = prio;
    this.speaking = true;
    if (this.pending !== null) window.clearTimeout(this.pending);
    this.pending = window.setTimeout(() => {
      this.pending = null;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(line);
        u.rate = 1.04;
        u.pitch = 0.95;
        u.volume = Math.max(0, Math.min(1, volume));
        if (this.voice) u.voice = this.voice;
        u.onend = () => this.done();
        u.onerror = () => this.done();
        synth.speak(u);
        this.onDuck(true);
        // engines don't always fire onend (or fire it late): release the duck regardless
        if (this.release !== null) window.clearTimeout(this.release);
        this.release = window.setTimeout(() => this.done(), 900 + line.length * 75);
      } catch {
        this.done();
      }
    }, delayMs);
  }

  private done(): void {
    this.speaking = false;
    this.currentPrio = -1;
    if (this.release !== null) window.clearTimeout(this.release);
    this.release = null;
    this.onDuck(false);
  }

  cancel(): void {
    if (this.pending !== null) window.clearTimeout(this.pending);
    this.pending = null;
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
    this.done();
  }
}
