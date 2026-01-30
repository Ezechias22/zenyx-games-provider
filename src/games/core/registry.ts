import { GameEngine } from './engine.interface';

export class EngineRegistry {
  private engines = new Map<string, GameEngine>();

  register(engine: GameEngine): void {
    this.engines.set(engine.id, engine);
  }

  get(gameId: string): GameEngine {
    const e = this.engines.get(gameId);
    if (!e) throw new Error(`Unknown game: ${gameId}`);
    return e;
  }

  list(): GameEngine[] {
    return Array.from(this.engines.values());
  }
}
