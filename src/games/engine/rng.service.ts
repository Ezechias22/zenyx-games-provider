import { Injectable } from '@nestjs/common';
import { sha256Hex } from '../../common/security/crypto.util';

@Injectable()
export class RngService {
  // Deterministic RNG in [0,1)
  rng01(seed: string): number {
    const hex = sha256Hex(seed).slice(0, 8);
    const n = parseInt(hex, 16);
    return n / 0xffffffff;
  }
}
