// Optional LLM-backed MoodInterpreter. DISABLED BY DEFAULT; no keys are shipped.
// Speaks the OpenAI-compatible /chat/completions protocol with a JSON-schema response format,
// so it can point at any compatible endpoint (hosted or local). Falls back to the lexicon on error.
import type { MoodInterpreter } from './lexicon';
import { DIM_KEYS, MoodDimensions, MoodProfile, normalizeWeights } from './profile';
import { MODES, ModeId } from './scales';

/** JSON Schema for the profile the model must return. */
export const MOOD_PROFILE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'MoodProfile',
  type: 'object',
  additionalProperties: false,
  required: ['moods', 'dims', 'modes'],
  properties: {
    moods: {
      type: 'array',
      description: '1-4 moods from the allowed vocabulary with weights summing to ~1',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'weight'],
        properties: { id: { type: 'string' }, weight: { type: 'number', minimum: 0, maximum: 1 } },
      },
    },
    dims: {
      type: 'object',
      additionalProperties: false,
      description: 'Only include dimensions the text clearly implies.',
      properties: {
        brightness: { type: 'number', minimum: -1, maximum: 1, description: '-1 dark … +1 bright' },
        valence: { type: 'number', minimum: -1, maximum: 1, description: '-1 negative … +1 positive' },
        tension: { type: 'number', minimum: 0, maximum: 1 },
        chromaticism: { type: 'number', minimum: 0, maximum: 1, description: 'how unusual/chromatic the harmony should be' },
        stability: { type: 'number', minimum: 0, maximum: 1, description: '0 unresolved … 1 resolved/home' },
        energy: { type: 'number', minimum: 0, maximum: 1, description: 'arousal: 0 calm … 1 energetic' },
      },
    },
    modes: { type: 'array', maxItems: 2, items: { type: 'string', enum: MODES.map((m) => m.id) } },
    rationale: { type: 'string', description: 'one short sentence' },
  },
} as const;

export function buildMoodPrompt(text: string, vocabulary: string[]): { system: string; user: string } {
  return {
    system: [
      'You translate a songwriter\'s free-text description of a desired musical mood into a MoodProfile JSON object.',
      `Allowed mood ids (use only these): ${vocabulary.join(', ')}.`,
      `Allowed modes: ${MODES.map((m) => m.id).join(', ')}.`,
      'Return 1-4 moods with weights summing to 1, only the dimensions the text implies, and at most 2 modes when the text suggests a modal colour.',
      'Handle blends ("victorious but bittersweet"), negation ("not too dark") and imagery ("like a foggy forest").',
      'Respond with JSON only, matching the provided schema.',
    ].join('\n'),
    user: text,
  };
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Validate/clean a model response into a MoodProfile (drops unknown moods, clamps ranges). */
export function parseLlmProfile(raw: Json, vocabulary: string[], text?: string): MoodProfile {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const vocab = new Set(vocabulary);
  const moods: Record<string, number> = {};
  for (const m of Array.isArray(obj?.moods) ? obj.moods : []) {
    const id = String(m?.id ?? '').toLowerCase();
    const w = Number(m?.weight);
    if (vocab.has(id) && isFinite(w) && w > 0) moods[id] = (moods[id] ?? 0) + w;
  }
  const dims: Partial<MoodDimensions> = {};
  for (const d of DIM_KEYS) {
    const v = Number(obj?.dims?.[d]);
    if (obj?.dims?.[d] !== undefined && isFinite(v)) dims[d] = d === 'brightness' || d === 'valence' ? Math.max(-1, Math.min(1, v)) : Math.max(0, Math.min(1, v));
  }
  const modeIds = new Set<string>(MODES.map((m) => m.id));
  const modes = (Array.isArray(obj?.modes) ? obj.modes : []).filter((m: Json) => modeIds.has(m)).slice(0, 2) as ModeId[];
  return { moods: normalizeWeights(moods), dims, modes, text, source: 'llm' };
}

export interface LlmConfig {
  enabled: boolean;
  endpoint?: string; // e.g. https://your-proxy.example.com/v1/chat/completions
  model?: string;
  apiKey?: string; // never ship one; supply at runtime (ideally via your own server-side proxy)
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class LlmMoodInterpreter implements MoodInterpreter {
  readonly id = 'llm';
  readonly label = 'AI interpreter (optional)';
  constructor(private cfg: LlmConfig, private vocabulary: string[], private fallback: MoodInterpreter) {}

  available(): boolean {
    return Boolean(this.cfg.enabled && this.cfg.endpoint && this.cfg.model);
  }

  async interpret(text: string): Promise<MoodProfile> {
    if (!this.available()) return this.fallback.interpret(text);
    const f = this.cfg.fetchFn ?? fetch;
    const { system, user } = buildMoodPrompt(text, this.vocabulary);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 8000) : undefined;
    try {
      const res = await f(this.cfg.endpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_schema', json_schema: { name: 'MoodProfile', schema: MOOD_PROFILE_JSON_SCHEMA, strict: false } },
          temperature: 0.2,
        }),
        signal: ctrl?.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? data;
      return parseLlmProfile(content, this.vocabulary, text);
    } catch {
      return this.fallback.interpret(text);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
