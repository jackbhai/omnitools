/**
 * Arcade — Cards & Luck group. Eight original games over core/games2.js
 * logic: Tic-Tac-Toe and Connect Four and Reversi against simple AIs,
 * Higher-or-Lower, 21 (points only), Rock-Paper-Scissors streak,
 * Dice Duel, Spin Wheel, Coin Toss streak.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GameShell, useBest, sfxPlay } from './games-kit.jsx';
import {
  lineWinner, tttAi, c4New, c4Drop, c4Ai,
  rvNew, rvPlay, rvAi, rvMoves, rvScore,
  makeDeck, cardName, SUIT_NAMES, bjValue, rpsResult, WHEEL_SEGS, wheelSpin,
} from '../core/games2.js';
import { Icon } from '../ui/icons';

/* -------------------------------------------------------------- playing card */
export function CardFace({ card, small }) {
  if (!card) return <div className={`pcard ${small ? 'sm' : ''} back`}><Icon n="sparkle" size={20} /></div>;
  const red = card.s === 1 || card.s === 2;
  return (
    <div className={`pcard ${small ? 'sm' : ''} ${red ? 'red' : ''}`}>
      <b>{cardName(card)}</b>
      <span>{SUIT_NAMES[card.s]}</span>
    </div>);
}

/* -------------------------------------------------------------- tic-tac-toe */
export function TicTacToe() {
  const [board, setBoard] = useState(() => new Array(9).fill(null));
  const [level, setLevel] = useState(2);
  const [tally, setTally] = useState({ w: 0, l: 0, d: 0 });
  const [best, report] = useBest('ttt');
  const winner = lineWinner(board);
  const full = board.every(Boolean);
  const over = !!winner || full;
  useEffect(() => {
    if (winner || full) return undefined;
    const xs = board.filter((v) => v === 'X').length;
    const os = board.filter((v) => v === 'O').length;
    if (xs > os) {
      const t = setTimeout(() => {
        const i = tttAi(board, level);
        if (i >= 0) { const b = [...board]; b[i] = 'O'; setBoard(b); sfxPlay('pop'); }
      }, 420);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [board]); // eslint-disable-line
  useEffect(() => {
    if (winner === 'X') { setTally((t) => ({ ...t, w: t.w + 1 })); report(tally.w + 1); sfxPlay('success'); }
    else if (winner === 'O') { setTally((t) => ({ ...t, l: t.l + 1 })); sfxPlay('error'); }
    else if (full) { setTally((t) => ({ ...t, d: t.d + 1 })); sfxPlay('timer'); }
  }, [winner, full]); // eslint-disable-line
  const play = (i) => {
    if (over || board[i]) return;
    const b = [...board]; b[i] = 'X'; setBoard(b); sfxPlay('add');
  };
  return (<>
    <GameShell score={`${tally.w}W · ${tally.l}L · ${tally.d}D`} scoreLabel="Session"
      best={best} bestLabel="Total wins" onRestart={() => setBoard(new Array(9).fill(null))}
      how="You are X. Easy wanders, Medium blocks, Hard plays perfectly — a draw is a win there." />
    <div className="cats">
      {[1, 2, 3].map((lv) => (
        <button key={lv} className={`cat ${level === lv ? 'on' : ''}`}
          onClick={() => { setLevel(lv); setBoard(new Array(9).fill(null)); }}>
          {['Easy', 'Medium', 'Hard'][lv - 1]}
        </button>))}
    </div>
    <div className="ttt-grid">
      {board.map((v, i) => (
        <button key={i} className={`ttt-cell ${v === 'X' ? 'x' : v === 'O' ? 'o' : ''}`}
          onClick={() => play(i)} aria-label={v || `Empty square ${i + 1}`}>
          {v || ''}
        </button>))}
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {winner ? (winner === 'X' ? 'You take the round.' : 'CPU takes the round.') : full ? 'Deadlocked — a draw.' : 'Your move.'}
    </p>
  </>);
}

/* -------------------------------------------------------------- connect four */
export function ConnectFour() {
  const [st, setSt] = useState(() => c4New());
  const [wins, setWins] = useState(0);
  const [best, report] = useBest('connect4');
  useEffect(() => {
    if (st.over || st.turn !== 2) return undefined;
    const t = setTimeout(() => {
      const col = c4Ai(st);
      if (col >= 0) { setSt(c4Drop(st, col, 2).st); sfxPlay('pop'); }
    }, 460);
    return () => clearTimeout(t);
  }, [st]);
  useEffect(() => {
    if (st.winner === 1) { setWins((w) => w + 1); report(wins + 1); sfxPlay('success'); }
    else if (st.winner === 2) sfxPlay('error');
  }, [st.winner]); // eslint-disable-line
  const drop = (col) => {
    if (st.over || st.turn !== 1) return;
    const { st: next, row } = c4Drop(st, col, 1);
    if (row >= 0) { setSt(next); sfxPlay('add'); }
  };
  return (<>
    <GameShell score={wins} scoreLabel="Rounds won" best={best} bestLabel="Total wins"
      onRestart={() => setSt(c4New())}
      how="Drop a disc down any column; four of yours in a line — across, down or diagonal — takes the round. The CPU blocks what it can see." />
    <div className="c4-grid" role="grid" aria-label="Connect four board">
      {Array.from({ length: 42 }, (_, i) => {
        const v = st.grid[i];
        return <span key={i} className={`c4-cell ${v === 1 ? 'you' : v === 2 ? 'cpu' : ''} ${st.winCells.includes(i) ? 'win' : ''}`} />;
      })}
    </div>
    <div className="c4-cols">
      {Array.from({ length: 7 }, (_, c) => (
        <button key={c} className="btn ghost" aria-label={`Drop in column ${c + 1}`}
          disabled={st.over || st.turn !== 1} onClick={() => drop(c)}>
          <Icon n="down" size={17} />
        </button>))}
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {st.over ? (st.winner === 1 ? 'You connected four.' : st.winner === 2 ? 'CPU connected four.' : 'Board full — a draw.') : st.turn === 1 ? 'Your drop.' : 'CPU is thinking…'}
    </p>
  </>);
}

/* ------------------------------------------------------------------ reversi */
export function Reversi() {
  const [st, setSt] = useState(() => rvNew());
  const [best, report] = useBest('reversi');
  const legal = st.over ? [] : rvMoves(st.board, st.turn);
  const [you, cpu] = rvScore(st.board);
  useEffect(() => {
    if (st.over) {
      if (you > cpu) { sfxPlay('success'); report(you - cpu); }
      else if (cpu > you) sfxPlay('error');
      return undefined;
    }
    if (st.turn === 2) {
      const t = setTimeout(() => {
        const mv = rvAi(st);
        if (mv >= 0) { setSt(rvPlay(st, mv)); sfxPlay('pop'); }
      }, 460);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [st]); // eslint-disable-line
  const play = (i) => {
    if (st.turn !== 1 || !legal.includes(i)) return;
    setSt(rvPlay(st, i));
    sfxPlay('add');
  };
  return (<>
    <GameShell score={`${you} – ${cpu}`} scoreLabel="You – CPU" best={best} bestLabel="Best margin"
      onRestart={() => setSt(rvNew())}
      how="Trap lines of CPU discs between two of yours to flip them. Corners are gold. When neither side can move, most discs wins." />
    <div className="rv-grid">
      {st.board.map((v, i) => (
        <button key={i} className={`rv-cell ${legal.includes(i) && st.turn === 1 ? 'legal' : ''}`}
          onClick={() => play(i)} aria-label={v === 1 ? 'Your disc' : v === 2 ? 'CPU disc' : legal.includes(i) ? 'Legal move' : 'Empty'}>
          {v ? <span className={`rv-disc ${v === 1 ? 'you' : 'cpu'}`} /> : (legal.includes(i) && st.turn === 1 ? <span className="rv-dot" /> : null)}
        </button>))}
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {st.over ? (you > cpu ? `You win ${you} to ${cpu}.` : cpu > you ? `CPU wins ${cpu} to ${you}.` : 'Level — a draw.') : st.turn === 1 ? 'Your move — dotted squares are legal.' : 'CPU is thinking…'}
    </p>
  </>);
}

/* ----------------------------------------------------------- higher or lower */
export function HigherLower() {
  const [deck, setDeck] = useState(() => makeDeck());
  const [idx, setIdx] = useState(1);
  const [streak, setStreak] = useState(0);
  const [over, setOver] = useState(false);
  const [best, report] = useBest('highlow');
  const current = deck[idx - 1];
  const guess = (higher) => {
    if (over) return;
    const next = deck[idx];
    if (!next) { setOver(true); return; }
    if (next.r === current.r) { setIdx(idx + 1); sfxPlay('pop'); return; }
    const right = higher ? next.r > current.r : next.r < current.r;
    setIdx(idx + 1);
    if (right) { setStreak((s) => s + 1); sfxPlay('add'); }
    else { setOver(true); sfxPlay('error'); report(streak); }
  };
  const fresh = () => { setDeck(makeDeck()); setIdx(1); setStreak(0); setOver(false); };
  return (<>
    <GameShell score={streak} scoreLabel="Streak" best={best} bestLabel="Best streak"
      onRestart={fresh}
      how="Will the next card be higher or lower than the one showing? Equal ranks slide past for free. One wrong call ends the streak." />
    <div className="hl-stage">
      <CardFace card={deck[idx]} small />
      <span className="hl-arrow"><Icon n="chevron" size={22} /></span>
      <CardFace card={over ? deck[idx] : current} />
    </div>
    {!over && (
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => guess(true)}><Icon n="up" size={16} /> Higher</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => guess(false)}><Icon n="down" size={16} /> Lower</button>
      </div>)}
    {over && <p style={{ marginTop: 10 }}><b>Streak over at {streak}.</b> The next card was {deck[idx] ? `${cardName(deck[idx])} of ${SUIT_NAMES[deck[idx].s]}` : 'the end of the deck'}.</p>}
  </>);
}

/* --------------------------------------------------------------------- 21 */
export function TwentyOne() {
  const [bank, setBank] = useState(100);
  const [deck, setDeck] = useState([]);
  const [you, setYou] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [phase, setPhase] = useState('bet'); /* bet | play | done */
  const [msg, setMsg] = useState('You start with 100 points. Every hand costs 10 — win it back with 21.');
  const [best, report] = useBest('twentyone');
  const BET = 10;
  const deal = () => {
    if (bank < BET) { setMsg('Out of points — restart to refill the bank.'); return; }
    const d = makeDeck();
    setBank((b) => b - BET);
    setDeck(d.slice(4));
    setYou([d[0], d[2]]);
    setDealer([d[1], d[3]]);
    setPhase('play');
    setMsg('Hit for another card, or stand and let the dealer play.');
    sfxPlay('open');
    if (bjValue([d[0], d[2]]) === 21) settle([d[0], d[2]], [d[1], d[3]], d.slice(4), true);
  };
  const settle = (y, dl, rest, natural = false) => {
    let dHand = [...dl];
    let r = [...rest];
    while (bjValue(dHand) < 17 && r.length) { dHand.push(r[0]); r = r.slice(1); }
    setDealer(dHand);
    const yv = bjValue(y), dv = bjValue(dHand);
    let payout = 0, text;
    if (yv > 21) text = `Bust at ${yv} — the hand is lost.`;
    else if (natural && dv !== 21) { payout = BET * 2.5; text = 'Twenty-one on the deal — pays 25.'; }
    else if (dv > 21) { payout = BET * 2; text = `Dealer busts at ${dv} — you win 20.`; }
    else if (yv > dv) { payout = BET * 2; text = `${yv} beats the dealer's ${dv} — you win 20.`; }
    else if (yv === dv) { payout = BET; text = `Push at ${yv} — your 10 comes back.`; }
    else text = `Dealer's ${dv} beats your ${yv}.`;
    if (payout) {
      setBank((b) => { const nb = b + payout; report(nb); return nb; });
      sfxPlay('success');
    } else sfxPlay('error');
    setMsg(text);
    setPhase('done');
  };
  const hit = () => {
    const card = deck[0];
    if (!card) return;
    const y = [...you, card];
    setYou(y);
    setDeck(deck.slice(1));
    sfxPlay('add');
    if (bjValue(y) > 21) settle(y, dealer, deck.slice(1));
    else if (bjValue(y) === 21) settle(y, dealer, deck.slice(1));
  };
  const stand = () => settle(you, dealer, deck);
  return (<>
    <GameShell score={bank} scoreLabel="Points bank" best={best} bestLabel="Richest bank"
      onRestart={() => { setBank(100); setPhase('bet'); setYou([]); setDealer([]); setMsg('Fresh bank of 100. Every hand costs 10.'); }}
      how="Points only — nothing real is at stake. Aces count 11 or 1, faces count 10, the dealer must draw below 17. Bust and the hand is gone." />
    <div className="bj-table">
      <div className="bj-row">
        <span className="dim sm">Dealer {phase === 'done' || phase === 'bet' ? (dealer.length ? `· ${bjValue(dealer)}` : '') : ''}</span>
        <div className="bj-cards">
          {dealer.map((c, i) => (
            phase === 'play' && i === 1 ? <div key={i} className="pcard sm back"><Icon n="sparkle" size={18} /></div> : <CardFace key={i} card={c} small />))}
          {!dealer.length && <span className="dim sm">No hand yet</span>}
        </div>
      </div>
      <div className="bj-row">
        <span className="dim sm">You {you.length ? `· ${bjValue(you)}` : ''}</span>
        <div className="bj-cards">{you.map((c, i) => <CardFace key={i} card={c} small />)}</div>
      </div>
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>{msg}</p>
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      {phase !== 'play' && <button className="btn" style={{ flex: 1 }} onClick={deal}><Icon n="play" size={15} /> Deal a hand (10)</button>}
      {phase === 'play' && (<>
        <button className="btn" style={{ flex: 1 }} onClick={hit}>Hit</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={stand}>Stand</button>
      </>)}
    </div>
  </>);
}

/* -------------------------------------------------------- rock paper scissors */
const RPS_ICONS = { rock: 'disc', paper: 'doc', scissors: 'pen' };
export function RockPaperScissors() {
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(null);
  const [best, report] = useBest('rps');
  const pick = (mine) => {
    const theirs = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    const res = rpsResult(mine, theirs);
    setRound({ mine, theirs, res });
    if (res === 1) { setStreak((s) => s + 1); sfxPlay('add'); }
    else if (res === -1) { report(streak); setStreak(0); sfxPlay('error'); }
    else sfxPlay('pop');
  };
  return (<>
    <GameShell score={streak} scoreLabel="Win streak" best={best} bestLabel="Best streak"
      onRestart={() => { setStreak(0); setRound(null); }}
      how="Rock breaks scissors, scissors cut paper, paper wraps rock. Wins build your streak — one loss wipes it. Draws change nothing." />
    {round && (
      <div className="rps-stage">
        <div className="rps-side"><Icon n={RPS_ICONS[round.mine]} size={34} /><span>You · {round.mine}</span></div>
        <b>{round.res === 0 ? 'Draw' : round.res === 1 ? 'You win' : 'CPU wins'}</b>
        <div className="rps-side"><Icon n={RPS_ICONS[round.theirs]} size={34} /><span>CPU · {round.theirs}</span></div>
      </div>)}
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {['rock', 'paper', 'scissors'].map((c) => (
        <button key={c} className="btn ghost" style={{ flex: 1 }} onClick={() => pick(c)}>
          <Icon n={RPS_ICONS[c]} size={17} /> {c[0].toUpperCase() + c.slice(1)}
        </button>))}
    </div>
  </>);
}

/* --------------------------------------------------------------- dice duel */
function DieFace({ v }) {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <span className="die" role="img" aria-label={`Dice showing ${v}`}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={`die-pip ${PIPS[v].includes(i) ? 'on' : ''}`} />)}
    </span>);
}
export function DiceDuel() {
  const [score, setScore] = useState({ w: 0, l: 0 });
  const [dice, setDice] = useState(null);
  const [best, report] = useBest('dice');
  const over = score.w >= 5 || score.l >= 5;
  const roll = () => {
    if (over) return;
    const mine = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const theirs = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    setDice({ mine, theirs });
    const ms = mine[0] + mine[1], ts = theirs[0] + theirs[1];
    if (ms > ts) { setScore((s) => ({ ...s, w: s.w + 1 })); sfxPlay('add'); }
    else if (ts > ms) { setScore((s) => ({ ...s, l: s.l + 1 })); sfxPlay('error'); }
    else sfxPlay('pop');
    if (ms > ts && score.w + 1 >= 5) report(1);
  };
  return (<>
    <GameShell score={`${score.w} – ${score.l}`} scoreLabel="You – CPU" best={best} bestLabel="Matches won"
      onRestart={() => { setScore({ w: 0, l: 0 }); setDice(null); }}
      how="Two dice each, higher total takes the round. First to five rounds takes the match — doubles are just luck wearing a uniform." />
    {dice && (
      <div className="dice-stage">
        <div className="dice-side"><span className="dim sm">You · {dice.mine[0] + dice.mine[1]}</span><span className="dice-pair"><DieFace v={dice.mine[0]} /><DieFace v={dice.mine[1]} /></span></div>
        <div className="dice-side"><span className="dim sm">CPU · {dice.theirs[0] + dice.theirs[1]}</span><span className="dice-pair"><DieFace v={dice.theirs[0]} /><DieFace v={dice.theirs[1]} /></span></div>
      </div>)}
    <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={over} onClick={roll}>
      <Icon n="dice" size={16} /> {over ? (score.w >= 5 ? 'Match won — restart to play again' : 'Match lost — restart to try again') : 'Roll the dice'}
    </button>
  </>);
}

/* --------------------------------------------------------------- spin wheel */
export function SpinWheel() {
  const [angle, setAngle] = useState(0);
  const [total, setTotal] = useState(0);
  const [last, setLast] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [best, report] = useBest('wheel');
  const segDeg = 360 / WHEEL_SEGS.length;
  const spin = () => {
    if (spinning) return;
    const r = wheelSpin();
    const target = angle + 360 * 6 + ((r.angle - (angle % 360) + 360) % 360);
    setAngle(target);
    setSpinning(true);
    sfxPlay('open');
    setTimeout(() => {
      setSpinning(false);
      setLast(r.points);
      setTotal((t) => { const nt = t + r.points; report(nt); return nt; });
      sfxPlay(r.points ? 'success' : 'error');
    }, 4300);
  };
  const COLS = ['var(--err)', 'var(--warn)', 'var(--green)', 'var(--cyan)', 'color-mix(in srgb, var(--err) 55%, var(--cyan))', 'color-mix(in srgb, var(--cyan) 50%, var(--green))', 'var(--warn)', 'var(--err)'];
  return (<>
    <GameShell score={total} scoreLabel="Points" best={best} bestLabel="Best total"
      onRestart={() => { setTotal(0); setLast(null); }}
      how="One free spin after another — the wheel pays what the pointer lands on. Bank a session total to beat." />
    <div className="wheel-wrap">
      <span className="wheel-pin" />
      <svg viewBox="0 0 200 200" className="wheel-svg"
        style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.3s cubic-bezier(.12,.8,.16,1)' : 'none' }}>
        {WHEEL_SEGS.map((v, i) => {
          const a0 = (i * segDeg - 90) * Math.PI / 180;
          const a1 = ((i + 1) * segDeg - 90) * Math.PI / 180;
          const x0 = 100 + 96 * Math.cos(a0), y0 = 100 + 96 * Math.sin(a0);
          const x1 = 100 + 96 * Math.cos(a1), y1 = 100 + 96 * Math.sin(a1);
          const tx = 100 + 66 * Math.cos((a0 + a1) / 2), ty = 100 + 66 * Math.sin((a0 + a1) / 2);
          return (
            <g key={i}>
              <path d={`M100 100 L${x0} ${y0} A96 96 0 0 1 ${x1} ${y1} Z`} fill={COLS[i]} opacity="0.85" />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="700" fill="var(--bg)">{v}</text>
            </g>);
        })}
        <circle cx="100" cy="100" r="17" fill="var(--s1)" stroke="var(--line)" />
      </svg>
    </div>
    <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={spinning} onClick={spin}>
      <Icon n="refresh" size={15} /> {spinning ? 'Spinning…' : last !== null ? `Landed on ${last} — spin again` : 'Spin the wheel'}
    </button>
  </>);
}

/* --------------------------------------------------------------- coin toss */
export function CoinToss() {
  const [face, setFace] = useState(null);
  const [streak, setStreak] = useState(0);
  const [call, setCall] = useState('');
  const [flipping, setFlipping] = useState(false);
  const [best, report] = useBest('coin');
  const toss = (mine) => {
    if (flipping) return;
    setCall(mine);
    setFlipping(true);
    setFace(null);
    sfxPlay('open');
    setTimeout(() => {
      const landed = Math.random() < 0.5 ? 'Heads' : 'Tails';
      setFace(landed);
      setFlipping(false);
      if (landed === mine) { setStreak((s) => s + 1); sfxPlay('add'); }
      else { report(streak); setStreak(0); sfxPlay('error'); }
    }, 700);
  };
  return (<>
    <GameShell score={streak} scoreLabel="Call streak" best={best} bestLabel="Best streak"
      onRestart={() => { setStreak(0); setFace(null); }}
      how="Call the coin before it lands. Every right call stretches the streak — one wrong call and it is gone. Pure luck, honestly labelled." />
    <div className="coin-stage">
      <span className={`coin ${flipping ? 'flipping' : ''}`}>{flipping ? '?' : face ? face[0] : '?'}</span>
      <span className="dim sm">
        {flipping ? `You called ${call}…` : face ? `Landed ${face} — you called ${call}: ${face === call ? 'right.' : 'wrong.'}` : 'Heads or tails?'}
      </span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button className="btn" style={{ flex: 1 }} disabled={flipping} onClick={() => toss('Heads')}>Call Heads</button>
      <button className="btn ghost" style={{ flex: 1 }} disabled={flipping} onClick={() => toss('Tails')}>Call Tails</button>
    </div>
  </>);
}
