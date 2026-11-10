import type { ArmorClass } from '../data/types';

let nextId = 1;

/** Common state for anything that occupies the battlefield and can be selected. */
export abstract class Entity {
  readonly id = nextId++;
  abstract readonly kind: 'unit' | 'building' | 'node';
  alive = true;
  x = 0;
  z = 0;
  /** Height above the terrain (aircraft, drop pods). */
  alt = 0;
  hp = 1;
  maxHp = 1;
  team = 0;
  radius = 1;
  height = 2;
  armor: ArmorClass = 'light';
  sight = 10;
  flying = false;
  invulnerable = false;
  /** Currently visible to the human player (fog of war). */
  visible = true;
  /** Has ever been seen by the human player (buildings stay drawn once scouted). */
  seen = false;
  lastHit = -999;
  flash = 0;
  stun = 0;
  name = '';
}

/** An Aurium crystal cluster. */
export class ResourceNode extends Entity {
  readonly kind = 'node' as const;
  amount: number;
  readonly initial: number;
  readonly rot: number;
  constructor(x: number, z: number, amount: number) {
    super();
    this.x = x;
    this.z = z;
    this.amount = amount;
    this.initial = amount;
    this.team = 2;
    this.radius = 1.3;
    this.height = 1.5;
    this.invulnerable = true;
    this.name = 'Aurium Crystal';
    this.rot = (this.id * 2.399) % 6.283;
  }
}
