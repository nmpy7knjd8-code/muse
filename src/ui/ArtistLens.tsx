// Artist Lens: how artists use musical polarities, with technique chips linked to Muse's theory KB
// and "Try it" exercises that load into the progression (pedal / held bass applied).
import { useState, type FormEvent } from 'react';
import { Artist, ArtistKbRef, ArtistTechnique, ArtistTryIt, ArtistsFile, MoodLexicon, loadTryIt, timeSigLabel, tryItText } from '../core';
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

/** Polarity bars: each polarity the artist plays with; bar length = how many of their techniques use it. */
function PolarityBars({ artist, data, compact }: { artist: Artist; data: ArtistsFile; compact?: boolean }) {
  const byId = new Map(data.polarities.map((p) => [p.id, p]));
  const count = (id: string) => artist.techniques.filter((t) => t.polarities?.includes(id)).length;
  const max = Math.max(1, ...artist.polarities.map((p) => count(p.id)));
  return (
    <div className="polbars">
      {artist.polarities.map((p) => {
        const def = byId.get(p.id);
        if (!def) return null;
        const n = count(p.id);
        return (
          <div key={p.id} className="polbar">
            <div className="polhead">
              <span className="pl">{def.poles[0]} ↔ {def.poles[1]}</span>
              <span className="track"><i style={{ width: `${Math.round(18 + 82 * (n / max))}%` }} /></span>
              <span className="n">{n}</span>
            </div>
            {!compact && <p className="small muted">{p.how}</p>}
          </div>
        );
      })}
      {compact && <div className="small muted">bars: share of techniques that work each polarity</div>}
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
                <button onClick={() => onPreview(t)} aria-label="Preview">▶</button>
                <button className="add" onClick={() => onTryIt(t, artist)}>Try it</button>
              </div>
            </div>
            {l && <div className="tryit-chords">{tryItText(l)}</div>}
            {t.meter && <div className="small muted">Meter: {t.meter}{l?.timeSig ? ` → loads as ${timeSigLabel(l.timeSig)}` : ''}</div>}
            {t.bassPedal && <div className="small muted">Bass note held under changing chords: {t.bassPedal}</div>}
            {t.melodyDegrees && <div className="small muted">Melody scale degrees (from home): {t.melodyDegrees.join(' ')}</div>}
            {t.howToPlay && <p className="small">{t.howToPlay}</p>}
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

const REQUEST_ISSUE = 'https://github.com/nmpy7knjd8-code/muse/issues/new';
const REQUEST_STORAGE = 'muse.bandRequests';
type BandRequest = { band: string; note: string; song?: string; at: number; taskUrl?: string };

function loadRequests(): BandRequest[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REQUEST_STORAGE) || '[]') as BandRequest[];
    return Array.isArray(raw) ? raw.slice(0, 20) : [];
  } catch { return []; }
}

function BandRequestBox() {
  const [name, setName] = useState('');
  const [song, setSong] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [recent, setRecent] = useState<BandRequest[]>(() => loadRequests());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const band = name.trim();
    if (!band) return;
    const songReq = song.trim();
    const title = `Artist Lens request: ${band}`;
    const body = [
      '## Band / artist request',
      '',
      `**Name:** ${band}`,
      '',
      '## Song to include in analysis (optional)',
      songReq || '(none)',
      '',
      '_Submitted from Muse Artist Lens — please add this artist to `public/artists.json`, and if a song is named, include it in the Artist Lens analysis / try-it material._',
      '',
      '### Checklist',
      '- [ ] Research techniques + sources',
      '- [ ] Add artist entry with try-it exercise',
      '- [ ] Update `tests/artists.test.ts` counts',
      songReq ? '- [ ] Include the requested song in the analysis' : '',
    ].filter(Boolean).join('\n');
    const taskUrl = `${REQUEST_ISSUE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent('artist-lens-request')}`;
    const entry: BandRequest = { band, note: '', song: songReq || undefined, at: Date.now(), taskUrl };
    const next = [entry, ...loadRequests().filter((r) => r.band.toLowerCase() !== band.toLowerCase())].slice(0, 20);
    try { localStorage.setItem(REQUEST_STORAGE, JSON.stringify(next)); } catch { /* private mode */ }
    setRecent(next);
    // Open a GitHub issue = the maintainer/agent task to add the band
    const win = window.open(taskUrl, '_blank', 'noopener,noreferrer');
    if (!win) window.location.assign(taskUrl);
    setSent(band);
    setName('');
    setSong('');
  };
  return (
    <form className="band-request-stack" onSubmit={submit} aria-label="Request a band for Artist Lens">
      <div className="band-request">
        <h4>Request a band</h4>
        <p className="small muted">Missing someone? Submit a name — we’ll add it in minutes.</p>
        <input aria-label="Band or artist name" placeholder="Band or artist name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="band-request band-request-songbox">
        <h4>Song to analyze <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></h4>
        <p className="small muted">Name a particular song to include in the Artist Lens analysis for this artist.</p>
        <textarea
          aria-label="Song to include in analysis"
          className="band-request-song"
          placeholder="e.g. Bohemian Rhapsody — focus on the ballad→opera→rock section changes"
          value={song}
          onChange={(e) => setSong(e.target.value)}
          rows={3}
        />
      </div>
      <div className="band-request-actions">
        <button type="submit" className="add" disabled={!name.trim()}>Create add-band task</button>
        {sent && <p className="small" role="status">Task created for <b>{sent}</b> — GitHub issue opened.</p>}
        {recent.length > 0 && (
          <div className="band-request-recent">
            <div className="small muted">Recent requests</div>
            <ul className="small">
              {recent.slice(0, 5).map((r) => (
                <li key={`${r.band}-${r.at}`}>
                  {r.taskUrl ? <a href={r.taskUrl} target="_blank" rel="noreferrer">{r.band}</a> : r.band}
                  {r.song ? <span className="muted"> · song requested</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
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
