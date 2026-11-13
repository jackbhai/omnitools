/**
 * Arcade — Brain group. Six original games over core/games2.js logic:
 * generated Sudoku with a proven-unique solution, Math Sprint, Typing
 * Speed, Word Guess (English + Hinglish banks), Number Guess, Mastermind.
 * (Memory Match, the seventh brain game, predates the arcade and lives
 * in the hub file.)
 */
import React, { useEffect, useRef, useState } from 'react';
import { GameShell, sfxPlay, useBest, loadBest, saveBestKey } from './games-kit.jsx';
import { sudokuGen, mathQuestion, typingStats, TYPIING_LINES, wgNew, wgGuess, WG_WORDS_EN, WG_WORDS_HINGLISH, WG_MAX_MISS, mmSecret, mmScore, MM_COLORS } from '../core/games2.js';
import { Icon } from '../ui/icons';

/* ------------------------------------------------------------------ sudoku */
export function Sudoku() {
  const [level, setLevel] = useState('easy');
  const [game, setGame] = useState(() => sudokuGen('easy'));
  const [cells, setCells] = useState(() => game.puzzle);
  const [sel, setSel] = useState(-1);
  const [mistakes, setMistakes] = useState(0);
  const [secs, setSecs] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState(() => loadBest()['sudoku-easy']);
  useEffect(() => { setBest(loadBest()['sudoku-' + level]); }, [level]);
  const report = (secs) => {
    const k = 'sudoku-' + level;
    const prev = loadBest()[k];
    if (prev === undefined || secs < prev) { saveBestKey(k, secs); setBest(secs); }
  };
  useEffect(() => {
    if (done) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [done, game]);
  const fresh = (lv) => {
    const g = sudokuGen(lv);
    setGame(g); setCells(g.puzzle); setSel(-1); setMistakes(0); setSecs(0); setDone(false);
  };
  const place = (v) => {
    if (sel < 0 || done || game.puzzle[sel]) return;
    if (v && v !== game.solution[sel]) {
      setMistakes((m) => m + 1);
      sfxPlay('error');
      return;
    }
    const next = [...cells];
    next[sel] = v;
    setCells(next);
    sfxPlay(v ? 'add' : 'pop');
    if (next.every((c, i) => c === game.solution[i])) {
      setDone(true);
      sfxPlay('success');
      report(secs);
    }
  };
  return (<>
    <GameShell score={`${secs}s`} scoreLabel="Time" best={best} bestLabel={`Best ${level} (sec)`}
      onRestart={() => fresh(level)}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{mistakes}</div><div className="l">Mistakes</div></div>}
      how="Every row, column and 3x3 box needs 1–9 exactly once. Wrong numbers are refused and counted — the puzzle always has exactly one solution." />
    <div className="cats">
      {['easy', 'medium', 'hard'].map((lv) => (
        <button key={lv} className={`cat ${level === lv ? 'on' : ''}`}
          onClick={() => { setLevel(lv); fresh(lv); }}>{lv[0].toUpperCase() + lv.slice(1)}</button>))}
    </div>
    <div className="sud-grid">
      {cells.map((v, i) => {
        const given = !!game.puzzle[i];
        const r = Math.floor(i / 9), c = i % 9;
        return (
          <button key={i} className={`sud-cell ${given ? 'given' : ''} ${sel === i ? 'sel' : ''} ${r % 3 === 2 && r < 8 ? 'bb' : ''} ${c % 3 === 2 && c < 8 ? 'br' : ''}`}
            onClick={() => setSel(i)} aria-label={`Row ${r + 1} column ${c + 1}${v ? `, ${v}` : ', empty'}`}>
            {v || ''}
          </button>);
      })}
    </div>
    <div className="sud-pad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => (
        <button key={v} className="btn ghost" onClick={() => place(v)}>{v}</button>))}
      <button className="btn ghost" onClick={() => place(0)}><Icon n="x" size={16} /></button>
    </div>
    {done && <p style={{ marginTop: 10 }}><b>Solved in {secs}s with {mistakes} mistakes.</b></p>}
  </>);
}
/* -------------------------------------------------------------- math sprint */
export function MathSprint() {
  const [q, setQ] = useState(() => mathQuestion(Math.random, 1));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [time, setTime] = useState(60);
  const [run, setRun] = useState(false);
  const [best, report] = useBest('mathsprint');
  useEffect(() => {
    if (!run) return undefined;
    const clock = setInterval(() => {
      setTime((t) => {
        if (t <= 0.25) {
          clearInterval(clock); setRun(false);
          setScore((s) => { report(s); return s; });
          sfxPlay('timer');
          return 0;
        }
        return +(t - 0.25).toFixed(2);
      });
    }, 250);
    return () => clearInterval(clock);
  }, [run]); // eslint-disable-line
  const answer = (v) => {
    if (!run) return;
    const right = v === q.ans;
    if (right) { setScore((s) => s + 1); setStreak((s) => s + 1); sfxPlay('add'); }
    else { setStreak(0); sfxPlay('error'); }
    setQ(mathQuestion(Math.random, 1 + Math.min(2, Math.floor(score / 8))));
  };
  const start = () => { setScore(0); setStreak(0); setTime(60); setQ(mathQuestion(Math.random, 1)); setRun(true); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{Math.ceil(time)}s</div><div className="l">Time</div></div>}
      how="Sixty seconds, as many sums as you can. Questions toughen as your score climbs — a wrong tap only breaks your streak." />
    <div className="math-card">
      <span className="math-q">{run || score ? q.text : 'Ready?'}</span>
      <span className="dim sm">Streak {streak}</span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {q.opts.map((v) => (
        <button key={v} className="btn" style={{ flex: 1 }} disabled={!run} onClick={() => answer(v)}>{v}</button>))}
    </div>
    {!run && <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={start}><Icon n="play" size={15} /> {time < 60 ? 'Play again' : 'Start'}</button>}
  </>);
}

/* ------------------------------------------------------------ typing speed */
export function TypingSpeed() {
  const [target, setTarget] = useState(() => TYPIING_LINES[Math.floor(Math.random() * TYPIING_LINES.length)]);
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [final, setFinal] = useState(null);
  const [best, report] = useBest('typing');
  const live = typed.length && startedAt
    ? typingStats(target, typed, Math.max(1, (performance.now() - startedAt) / 1000))
    : { wpm: 0, acc: 100 };
  const onType = (e) => {
    const v = e.target.value;
    if (!startedAt && v.length) setStartedAt(performance.now());
    setTyped(v);
    if (v.length >= target.length) {
      const stats = typingStats(target, v.slice(0, target.length), Math.max(1, (performance.now() - (startedAt || performance.now())) / 1000));
      setFinal(stats);
      report(stats.wpm);
      sfxPlay(stats.acc >= 90 ? 'success' : 'timer');
    }
  };
  const fresh = () => {
    let next = target;
    while (next === target) next = TYPIING_LINES[Math.floor(Math.random() * TYPIING_LINES.length)];
    setTarget(next); setTyped(''); setStartedAt(0); setFinal(null);
  };
  return (<>
    <GameShell score={final ? final.wpm : live.wpm} scoreLabel="Words / min" best={best} bestLabel="Best WPM"
      onRestart={fresh}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{final ? final.acc : live.acc}%</div><div className="l">Accuracy</div></div>}
      how="Type the line exactly as written. The clock starts on your first keypress and stops at the last letter." />
    <div className="type-line" aria-label="Line to type">
      {[...target].map((ch, i) => (
        <span key={i} className={i < typed.length ? (typed[i] === ch ? 'ok' : 'bad') : ''}>{ch}</span>))}
    </div>
    <input className="fld type-in" value={typed} onChange={onType} disabled={!!final}
      placeholder="Start typing here…" autoComplete="off" autoCapitalize="none" spellCheck="false"
      style={{ marginTop: 10, width: '100%' }} />
    {final && <p style={{ marginTop: 10 }}><b>{final.wpm} words per minute at {final.acc}% accuracy.</b></p>}
  </>);
}

/* --------------------------------------------------------------- word guess */
export function WordGuess() {
  const [bank, setBank] = useState('en');
  const [st, setSt] = useState(() => wgNew(WG_WORDS_EN[Math.floor(Math.random() * WG_WORDS_EN.length)]));
  const [best, report] = useBest('wordguess');
  const fresh = (b) => {
    const words = b === 'en' ? WG_WORDS_EN : WG_WORDS_HINGLISH;
    setSt(wgNew(words[Math.floor(Math.random() * words.length)]));
  };
  useEffect(() => { if (st.won) report(WG_MAX_MISS - st.misses + 1); }, [st.won]); // eslint-disable-line
  const guess = (ch) => {
    const next = wgGuess(st, ch);
    setSt(next);
    if (next.won) sfxPlay('success');
    else if (next.over) sfxPlay('error');
    else sfxPlay(next.misses > st.misses ? 'tick' : 'pop');
  };
  return (<>
    <GameShell score={WG_MAX_MISS - st.misses} scoreLabel="Tries left" best={best} bestLabel="Best (tries saved)"
      onRestart={() => fresh(bank)}
      how={bank === 'en'
        ? 'Guess the hidden word one letter at a time. Seven wrong letters end the round.'
        : 'Everyday Hinglish words written in Roman letters. Guess letter by letter — seven misses end it.'} />
    <div className="cats">
      <button className={`cat ${bank === 'en' ? 'on' : ''}`} onClick={() => { setBank('en'); fresh('en'); }}>English</button>
      <button className={`cat ${bank === 'hi' ? 'on' : ''}`} onClick={() => { setBank('hi'); fresh('hi'); }}>Hinglish</button>
    </div>
    <div className="wg-word">
      {[...st.word].map((ch, i) => (
        <span key={i} className={`wg-slot ${st.guessed.includes(ch) || st.over ? 'shown' : ''}`}>
          {st.guessed.includes(ch) || st.over ? ch.toUpperCase() : ''}
        </span>))}
    </div>
    <div className="wg-miss">
      {Array.from({ length: WG_MAX_MISS }, (_, i) => (
        <span key={i} className={`wg-dot ${i < st.misses ? 'spent' : ''}`} />))}
    </div>
    {st.over && <p style={{ textAlign: 'center', marginTop: 6 }}><b>{st.won ? 'You got it — ' : 'The word was '}</b>{st.word.toUpperCase()}</p>}
    <div className="wg-keys">
      {'abcdefghijklmnopqrstuvwxyz'.split('').map((ch) => {
        const used = st.guessed.includes(ch);
        const wasHit = used && st.word.includes(ch);
        return (
          <button key={ch} className={`wg-key ${used ? (wasHit ? 'hit' : 'miss') : ''}`}
            disabled={used || st.over} onClick={() => guess(ch)}>{ch.toUpperCase()}</button>);
      })}
    </div>
  </>);
}

/* -------------------------------------------------------------- number guess */
export function NumberGuess() {
  const [secret, setSecret] = useState(() => 1 + Math.floor(Math.random() * 100));
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState('I am thinking of a number between 1 and 100.');
  const [val, setVal] = useState('');
  const [won, setWon] = useState(false);
  const [best, report] = useBest('numguess', true);
  const guess = () => {
    const n = parseInt(val, 10);
    if (!n || n < 1 || n > 100 || won) return;
    const t = tries + 1;
    setTries(t);
    setVal('');
    if (n === secret) {
      setWon(true);
      setHint(`Exactly right — ${secret} in ${t} guesses.`);
      sfxPlay('success');
      report(t);
    } else {
      setHint(n < secret ? `${n} is too low — aim higher.` : `${n} is too high — aim lower.`);
      sfxPlay(n < secret ? 'pop' : 'tick');
    }
  };
  const fresh = () => { setSecret(1 + Math.floor(Math.random() * 100)); setTries(0); setWon(false); setHint('New number, 1 to 100. Halve the range every time and you will crack it in seven.'); };
  return (<>
    <GameShell score={tries} scoreLabel="Guesses" best={best} bestLabel="Best (fewest)"
      onRestart={fresh}
      how="One secret number, honest hints. The trick is halving: 50, then 25 or 75, and so on — seven guesses is a perfect game." />
    <div className="math-card"><span style={{ fontSize: 16 }}>{hint}</span></div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <input className="fld" type="number" min="1" max="100" value={val} inputMode="numeric"
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') guess(); }}
        placeholder="Your guess" style={{ flex: 1 }} />
      <button className="btn" onClick={guess} disabled={won}>Guess</button>
    </div>
  </>);
}

/* --------------------------------------------------------------- mastermind */
const MM_HEX = ['var(--err)', 'var(--warn)', 'var(--green)', 'var(--cyan)', 'color-mix(in srgb, var(--err) 55%, var(--cyan))', 'color-mix(in srgb, var(--cyan) 50%, var(--green))'];
export function Mastermind() {
  const [secretState, setSecretState] = useState(() => mmSecret());
  const [rows, setRows] = useState([]);
  const [cur, setCur] = useState([]);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [best, report] = useBest('mastermind', true);
  const fresh = () => { const s = mmSecret(); setSecretState(s); setRows([]); setCur([]); setOver(false); setWon(false); };
  const submit = () => {
    if (cur.length < 4 || over) return;
    const fb = mmScore(secretState, cur);
    const next = [...rows, { guess: cur, fb }];
    setRows(next);
    setCur([]);
    if (fb.black === 4) { setWon(true); setOver(true); sfxPlay('success'); report(next.length); }
    else if (next.length >= 10) { setOver(true); sfxPlay('error'); }
    else sfxPlay('add');
  };
  return (<>
    <GameShell score={rows.length} scoreLabel="Guesses" best={best} bestLabel="Best (fewest)"
      onRestart={fresh}
      how="Crack the hidden 4-colour code in 10 guesses. A dark peg means right colour, right slot; a light peg means right colour, wrong slot. Colours can repeat." />
    <div className="mm-rows">
      {rows.map((r, i) => (
        <div key={i} className="mm-row">
          <span className="mm-pegs">{r.guess.map((c, j) => <span key={j} className="mm-peg" style={{ background: MM_HEX[c] }} />)}</span>
          <span className="mm-fb">
            {Array.from({ length: r.fb.black }, (_, j) => <span key={'b' + j} className="mm-pin dark" />)}
            {Array.from({ length: r.fb.white }, (_, j) => <span key={'w' + j} className="mm-pin light" />)}
          </span>
        </div>))}
      {!over && (
        <div className="mm-row current">
          <span className="mm-pegs">
            {[0, 1, 2, 3].map((j) => (
              <span key={j} className="mm-peg empty" style={cur[j] !== undefined ? { background: MM_HEX[cur[j]] } : undefined} />))}
          </span>
          <button className="btn sm" disabled={cur.length < 4} onClick={submit}>Check</button>
        </div>)}
    </div>
    {!over && (
      <div className="mm-palette">
        {MM_HEX.map((c, i) => (
          <button key={i} className="mm-pal" style={{ background: c }} aria-label={`Colour ${i + 1}`}
            onClick={() => { if (cur.length < 4) { setCur([...cur, i]); sfxPlay('pop'); } }} />))}
        <button className="btn ghost sm" onClick={() => setCur(cur.slice(0, -1))}><Icon n="back" size={15} /> Undo</button>
      </div>)}
    {over && (
      <p style={{ marginTop: 10 }}>
        <b>{won ? `Cracked in ${rows.length} guesses.` : 'Out of guesses — the code was:'}</b>{' '}
        <span className="mm-pegs" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          {secretState.map((c, j) => <span key={j} className="mm-peg" style={{ background: MM_HEX[c] }} />)}
        </span>
      </p>)}
  </>);
}
