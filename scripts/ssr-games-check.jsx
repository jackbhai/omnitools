/**
 * Render check for the 50-game arcade: every game component is rendered
 * to static HTML (first paint, no effects) and must produce real markup
 * without throwing. Complements verify_games.mjs (rules) with wiring.
 *   npm run verify:games-render
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GAMES, GAME_GROUPS, Games } from '../src/tools/games.jsx';
import * as Reflex from '../src/tools/games-reflex.jsx';
import * as Puzzle from '../src/tools/games-puzzle.jsx';
import * as Brain from '../src/tools/games-brain.jsx';
import * as Arcade from '../src/tools/games-arcade.jsx';
import * as Cards from '../src/tools/games-cards.jsx';
import { Game2048, GameSnake, GameMemory } from '../src/tools/games.jsx';

const DIRECT = {
  flappy: Reflex.PipeDodge, dino: Reflex.DinoRunner, whack: Reflex.WhackAMole,
  reaction: Reflex.ReactionTime, aim: Reflex.AimTrainer, stroop: Reflex.ColorMatch,
  quickdraw: Reflex.QuickDraw, bubbles: Reflex.BubblePop, catch: Reflex.CatchBasket,
  cardodge: Reflex.CarDodge, heli: Reflex.HelicopterHold, hopper: Reflex.VerticalHopper,
  roadcross: Reflex.RoadCross, stack: Reflex.StackTower, fruit: Reflex.FruitSlice,
  gravflip: Reflex.GravityFlip, tapstar: Reflex.TapTheStar,
  mines: Puzzle.Minesweeper, blockfall: Puzzle.BlockFall, slide15: Puzzle.SlidePuzzle,
  lightsout: Puzzle.LightsOut, floodit: Puzzle.FloodIt, maze: Puzzle.MazeRunner,
  hanoi: Puzzle.TowerOfHanoi, dotsboxes: Puzzle.DotsAndBoxes, simon: Puzzle.Simon,
  gridseq: Puzzle.GridSequence, g2048: Game2048,
  sudoku: Brain.Sudoku, mathsprint: Brain.MathSprint, typing: Brain.TypingSpeed,
  wordguess: Brain.WordGuess, numguess: Brain.NumberGuess, mastermind: Brain.Mastermind,
  memory: GameMemory,
  breakout: Arcade.Breakout, pong: Arcade.Pong, space: Arcade.SpaceDodge,
  wallball: Arcade.WallBall, pinball: Arcade.PinballLite, snake: GameSnake,
  ttt: Cards.TicTacToe, connect4: Cards.ConnectFour, reversi: Cards.Reversi,
  highlow: Cards.HigherLower, twentyone: Cards.TwentyOne, rps: Cards.RockPaperScissors,
  dice: Cards.DiceDuel, wheel: Cards.SpinWheel, coin: Cards.CoinToss,
};

let bad = 0;
const chk = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};

chk('registry holds exactly 50 games', GAMES.length === 50, `${GAMES.length} entries`);
chk('ids are unique', new Set(GAMES.map((g) => g.id)).size === 50);
for (const g of GAME_GROUPS) {
  chk(`group ${g} is non-empty`, GAMES.some((x) => x.g === g), `${GAMES.filter((x) => x.g === g).length} games`);
}

const hubHtml = renderToStaticMarkup(<Games />);
chk('hub renders the full grid', hubHtml.includes('Pipe Dodge') && hubHtml.includes('Coin Toss') && (hubHtml.match(/arc-card/g) || []).length === 50,
  `${(hubHtml.match(/arc-card/g) || []).length} cards`);

for (const g of GAMES) {
  const C = DIRECT[g.id];
  if (!C) { chk(`${g.n}: direct component mapped`, false); continue; }
  try {
    const html = renderToStaticMarkup(<C />);
    chk(`${g.n} renders`, html.length > 150, `${html.length} chars`);
  } catch (e) {
    chk(`${g.n} renders`, false, e.message);
  }
}

console.log(bad ? `\n${bad} FAILURES` : '\nall arcade render checks pass');
process.exit(bad ? 1 : 0);
