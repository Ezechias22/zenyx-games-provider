import { fairnessU01 } from '../../core/fairness';
import { ReelStrip, SlotConfig, SpinOutcome } from './slot.types';

function pickFromStrip(strip: ReelStrip, u: number): string {
  const idx = Math.floor(u * strip.length);
  return strip[Math.min(strip.length - 1, Math.max(0, idx))];
}

export function spinSlot(config: SlotConfig, serverSeed: string, clientSeed: string, nonce: number, tag = 'spin'): SpinOutcome {
  const reels = config.reels.length;
  const rows = config.rows;

  const grid: string[][] = Array.from({ length: reels }, () => Array.from({ length: rows }, () => ''));
  // For each reel, generate row symbols by shifting a picked index to simulate strip continuity
  for (let r = 0; r < reels; r++) {
    const strip = config.reels[r];
    const u = fairnessU01(serverSeed, clientSeed, nonce, `${tag}:reel:${r}`);
    const start = Math.floor(u * strip.length);
    for (let row = 0; row < rows; row++) {
      const idx = (start + row) % strip.length;
      grid[r][row] = strip[idx];
    }
  }

  const wins: SpinOutcome['wins'] = [];
  let totalMul = 0;

  for (let li = 0; li < config.paylines.length; li++) {
    const line = config.paylines[li];
    // Determine best paying symbol from left with wild substitution
    let target = '';
    let count = 0;
    const positions: Array<{reel:number; row:number}> = [];
    for (let r = 0; r < reels; r++) {
      const row = line[r];
      const sym = grid[r][row];
      positions.push({ reel: r, row });
      if (r === 0) {
        target = sym === config.symbols.wild ? '' : sym;
        count = 1;
        continue;
      }
      const isWild = sym === config.symbols.wild;
      if (target === '') {
        if (!isWild) target = sym;
        count++;
        continue;
      }
      if (sym === target || isWild) {
        count++;
      } else {
        break;
      }
    }
    // If target never set (all wilds), set to wild
    if (target === '') target = config.symbols.wild;

    // Pay only if not scatter and paytable exists for count
    if (target !== config.symbols.scatter) {
      const pt = config.paytable[target];
      if (pt && pt[count]) {
        const mul = pt[count] * (config.baseMultiplier ?? 1);
        totalMul += mul;
        wins.push({ type: 'LINE', line: li + 1, symbol: target, count, payoutMul: mul, positions: positions.slice(0, count) });
      }
    }
  }

  // scatters anywhere
  let scatters = 0;
  for (let r = 0; r < reels; r++) {
    for (let row = 0; row < rows; row++) {
      if (grid[r][row] === config.symbols.scatter) scatters++;
    }
  }

  return { grid, wins, scatters, totalPayoutMul: totalMul };
}
