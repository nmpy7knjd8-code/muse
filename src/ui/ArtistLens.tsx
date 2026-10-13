// Artist Lens: how artists use musical polarities, with technique chips linked to Muse's theory KB
// and "Try it" exercises that load into the progression (pedal / held bass applied).
import { useState, type FormEvent } from 'react';
import { Artist, ArtistKbRef, ArtistTechnique, ArtistTryIt, ArtistsFile, MoodLexicon, MUSE_REQUEST_MAX, buildMuseRequest, loadTryIt, sendMuseRequest, timeSigLabel, tryItText } from '../core';
import type { KbItemInfo } from './data';

interface Props {
  data: ArtistsFile;
  lex: MoodLexicon;
  kbIndex: Map<string, KbItemInfo>;
  onTryIt: (t: ArtistTryIt, artist: Artist) => void;
  onPreview: (t: ArtistTryIt) => void;
  initial?: string | null;
}

const KIND_LABEL: Record<string, string> = { chordMove: 'chord move', melodicMove: 'melodic move', mode: 'mode', progression: 'progression' };
const pretty = (id: string) => id.replace(/[_-]+/g, ' ');

function MoodChips({ moods, lex, max = 6 }: { moods: Array<{ mood: string; weight?: number }>; lex: MoodLexicon; max?: number }) {
  return (
    <div className="tags">
      {moods.slice(0, max).map((m) => (
        <span key={m.mood} className="tag" style={{ background: lex.color(m.mood), opacity: 0.45 + 0.55 * (m.weight ?? 1) }}>{lex.label(m.mood).toLowerCase()}</span>
      ))}
    </div>
  );
}

/** Wordy lean for a11y — no numbers spoken or shown. */
function leanWords(lean: number, left: string, right: string): string {
  if (lean <= 0.2) return `near ${left}`;
  if (lean < 0.4) return `toward ${left}`;
  if (lean <= 0.6) return `between ${left} and ${right}`;
  if (lean < 0.8) return `toward ${right}`;
  return `near ${right}`;
}

/** Polarity continuum: marker on a gradient between the two poles (lean 0 = left, 1 = right). */
function PolarityBars({ artist, data, compact }: { artist: Artist; data: ArtistsFile; compact?: boolean }) {
  const byId = new Map(data.polarities.map((p) => [p.id, p]));
  return (
    <div className="polbars">
      {artist.polarities.map((p) => {
        const def = byId.get(p.id);
        if (!def) return null;
        const [left, right] = def.poles;
        const lean = p.lean;
        const pct = `${Math.round(lean * 100)}%`;
        const words = leanWords(lean, left, right);
        return (
          <div key={p.id} className="polbar">
            <div className="polhead">
              <span className="pole left" aria-hidden="true">{left}</span>
              <span
                className="track"
                role="img"
                aria-label={`${left} to ${right} continuum, ${words}`}
              >
                <i className="marker" style={{ left: pct }} />
              </span>
              <span className="pole right" aria-hidden="true">{right}</span>
            </div>
            {!compact && <p className="small muted">{p.how}</p>}
          </div>
        );
      })}
      {compact && <div className="small muted">marker: where the artist sits between each pair of poles</div>}
    </div>
  );
}

function Cite({ ids, artist }: { ids: string[]; artist: Artist }) {
  const idx = new Map(artist.sources.map((s, i) => [s.id, i + 1]));
  return <sup className="cite">{ids.filter((id) => idx.has(id)).map((id) => <a key={id} href={`#src-${artist.id}-${id}`}>[{idx.get(id)}]</a>)}</sup>;
}

function TechniqueCard({ t, artist, data, lex, kbIndex }: { t: ArtistTechnique; artist: Artist; data: ArtistsFile; lex: MoodLexicon; kbIndex: Map<string, KbItemInfo> }) {
  const [open, setOpen] = useState<string | null>(null);
  const info = (r: ArtistKbRef) => kbIndex.get(`${r.kind}:${r.id}`);
  const openInfo = open ? kbIndex.get(open) : undefined;
  return (
    <div className="tech">
      <div className="tech-head">
        <b>{t.name}</b>
        <span className={'evid ' + t.evidence} title={data.meta.evidenceLevels[t.evidence] ?? t.evidence}>{t.evidence.replace('-', ' ')}</span>
      </div>
      <p className="small">{t.description}<Cite ids={t.sourceIds} artist={artist} /></p>
      <div className="chips-row">
        {t.kbRefs.map((r) => {
          const key = `${r.kind}:${r.id}`;
          return (
            <button key={key} className={'techchip' + (open === key ? ' on' : '')} onClick={() => setOpen(open === key ? null : key)} title={KIND_LABEL[r.kind]}>
              {r.kind === 'mode' ? '◐ ' : r.kind === 'melodicMove' ? '♪ ' : r.kind === 'progression' ? '⇢ ' : '♯ '}{info(r)?.name ?? pretty(r.id)}
            </button>
          );
        })}
      </div>
      {openInfo && (
        <div className="kbinfo small">
          <b>{openInfo.name}</b> <span className="muted">· {KIND_LABEL[openInfo.kind]} in Muse's theory KB</span>
          <p>{openInfo.description}</p>
          {openInfo.moods.length > 0 && <MoodChips moods={openInfo.moods.map((m) => ({ mood: m }))} lex={lex} />}
        </div>
      )}
      {t.tryInMuse && <p className="small hint">💡 {t.tryInMuse}</p>}
    </div>
  );
}

function ArtistDetail({ artist, props, onBack }: { artist: Artist; props: Props; onBack: () => void }) {
  const { data, lex, kbIndex, onTryIt, onPreview } = props;
  const cats = [...new Set(artist.techniques.map((t) => t.category))];
  return (
    <div className="artist-detail">
      <button className="back" onClick={onBack}>‹ All artists</button>
      <h2>{artist.name}</h2>
      <p className="small muted">{[artist.era, artist.origin, artist.genres.join(', ')].filter(Boolean).join(' · ')}</p>
      <MoodChips moods={artist.moodProfile} lex={lex} max={8} />
      <p>{artist.aestheticSummary}</p>

      <h4>Try it — exercises in the style of {artist.name}</h4>
      {artist.tryIt.map((t) => {
        const l = loadTryIt(t);
        return (
          <div key={t.label} className="tryit">
            <div className="tryit-head">
              <div>
                <b>{t.label}</b>
                <div className="small muted">
                  {t.key.tonic} {t.key.mode.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  {l?.timeSig && <span className="meter-badge" title={t.meter || timeSigLabel(l.timeSig)}>{timeSigLabel(l.timeSig)}</span>}
                </div>
              </div>
              <div className="row gap">
                <button className="t-mini" onClick={() => onPreview(t)} aria-label="Preview"><PlayIcon size={14} /></button>
                <button className="add" onClick={() => onTryIt(t, artist)}>Try it</button>
              </div>
            </div>
            {l && <div className="tryit-chords">{tryItText(l)}</div>}
            {t.meter && <div className="small muted">Meter: {t.meter}{l?.timeSig ? ` → loads as ${timeSigLabel(l.timeSig)}` : ''}</div>}
            {t.bassPedal && <div className="small muted">Bass note held under changing chords: {t.bassPedal}</div>}
            {t.melodyDegrees && <div className="small muted">Melody scale degrees (from home): {t.melodyDegrees.join(' ')}</div>}
            {t.drumPatternId && (
              <div className="small muted">
                Drums: loads practice pattern <code>{t.drumPatternId}</code> onto the percussion tab (simultaneous columns + Loop).
              </div>
            )}
            {t.howToPlay && (
              <div className="tryit-howto">
                <div className="tryit-howto-label">How to play</div>
                <p className="small">{t.howToPlay}</p>
              </div>
            )}
            <MoodChips moods={t.moods.map((m) => ({ mood: m }))} lex={lex} />
          </div>
        );
      })}
      <p className="small muted">{data.meta.tryItPolicy || 'Exercises are original illustrations of a technique, not song transcriptions.'}</p>

      <h4>Polarities</h4>
      <PolarityBars artist={artist} data={data} />

      <h4>Techniques</h4>
      {cats.map((c) => (
        <div key={c}>
          <div className="cat">{pretty(c)}</div>
          {artist.techniques.filter((t) => t.category === c).map((t) => <TechniqueCard key={t.id} t={t} artist={artist} data={data} lex={lex} kbIndex={kbIndex} />)}
        </div>
      ))}

      <h4>Listen to</h4>
      {artist.works.map((w) => (
        <details key={w.title} className="work">
          <summary><b>{w.title}</b> <span className="muted small">{[w.release, w.year].filter(Boolean).join(', ')}</span></summary>
          <p className="small"><b>What happens.</b> {w.whatHappens}<Cite ids={w.sourceIds} artist={artist} /></p>
          <p className="small"><b>Why it feels that way.</b> {w.whyItFeels}</p>
          {w.listenFor.length > 0 && <ul className="small">{w.listenFor.map((x) => <li key={x}>{x}</li>)}</ul>}
        </details>
      ))}

      {artist.listeningGuide.length > 0 && (
        <>
          <h4>Listening guide</h4>
          <ol className="small guide">{artist.listeningGuide.map((g) => <li key={g.step}><b>{g.title}.</b> {g.what}</li>)}</ol>
        </>
      )}

      <h4>Sources</h4>
      <ol className="small sources">
        {artist.sources.map((s) => (
          <li key={s.id} id={`src-${artist.id}-${s.id}`}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{s.type ? <span className="muted"> · {s.type}</span> : null}{s.note ? <span className="muted"> — {s.note}</span> : null}</li>
        ))}
      </ol>
    </div>
  );
}

function BandRequestBox() {
  const [text, setText] = useState('');
  const [honey, setHoney] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'sending') return;
    if (honey.trim()) { setState('sent'); setText(''); return; }
    const payload = buildMuseRequest(text, honey);
    if (!payload) return;
    setState('sending');
    const ok = await sendMuseRequest(payload);
    setState(ok ? 'sent' : 'error');
    if (ok) setText('');
  };
  return (
    <form className="band-request-stack" onSubmit={(e) => void submit(e)} aria-label="Send a request">
      <div className="band-request">
        <h4>Request something</h4>
        <p className="small muted">Missing an artist, song, technique or feature? Describe it in your own words. No account needed.</p>
        <textarea
          aria-label="Your request"
          className="band-request-song"
          placeholder="Request anything: an artist, a song, a technique, a feature…"
          value={text}
          maxLength={MUSE_REQUEST_MAX}
          onChange={(e) => { setText(e.target.value); if (state !== 'sending') setState('idle'); }}
          rows={3}
          required
        />
        <input type="text" name="_honey" value={honey} onChange={(e) => setHoney(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      </div>
      <div className="band-request-actions">
        <button type="submit" className="add" disabled={!text.trim() || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'}</button>
        {state === 'sent' && <p className="small" role="status">Thanks! Your request was sent.</p>}
        {state === 'error' && <p className="small" role="alert">Sorry, that didn't go through. Please try again in a moment.</p>}
      </div>
    </form>
  );
}

export function ArtistLens(props: Props) {
  const { data, lex } = props;
  const [sel, setSel] = useState<string | null>(props.initial ?? null);
  const artist = sel ? data.artists.find((a) => a.id === sel) : undefined;
  if (artist) return <ArtistDetail artist={artist} props={props} onBack={() => setSel(null)} />;
  return (
    <div className="artists">
      <p className="small muted">How artists use tension, darkness, stability and surprise — with techniques you can try in Muse.</p>
      {data.artists.map((a) => (
        <button key={a.id} className="artist-card" data-artist={a.id} onClick={() => { setSel(a.id); window.scrollTo({ top: 0 }); }}>
          <div className="ac-head"><b>{a.name}</b><span className="small muted">{a.genres.slice(0, 2).join(' · ')}</span></div>
          <p className="small">{a.hook}</p>
          <MoodChips moods={a.moodProfile} lex={lex} max={5} />
          <PolarityBars artist={a} data={data} compact />
          <div className="small muted">{a.techniques.length} techniques · {a.tryIt.length} try-it exercise{a.tryIt.length === 1 ? '' : 's'} · {a.sources.length} sources</div>
        </button>
      ))}
      <BandRequestBox />
    </div>
  );
}
