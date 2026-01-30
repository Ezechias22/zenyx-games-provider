import { Injectable } from '@nestjs/common';
import { randomHex, sha256Hex } from '../../common/security/crypto.util';

@Injectable()
export class FairnessService {
  generateServerSeed() {
    const serverSeed = randomHex(32);
    const serverSeedHash = sha256Hex(serverSeed);
    return { serverSeed, serverSeedHash };
  }
}
