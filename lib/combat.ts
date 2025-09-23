import { Piece } from '@/models/types';

export interface CombatEventBase { type: string; pieceId: string; }
export interface PromotionEvent extends CombatEventBase { type: 'promotion'; fromLevel: number; toLevel: number; }
export interface KillEvent extends CombatEventBase { type: 'kill'; reason: 'capture' | 'pushed-out'; }
export interface DemotionEvent extends CombatEventBase { type: 'demotion'; fromLevel: number; toLevel: number; }
export interface PushEvent extends CombatEventBase { type: 'push'; from: {x:number;y:number}; to: {x:number;y:number}; }
export interface FlagCaptureEvent extends CombatEventBase { type: 'flag-capture'; flagTeam: string; attackerTeam: string; }

export type CombatEvent = PromotionEvent | KillEvent | DemotionEvent | PushEvent | FlagCaptureEvent;

export interface ResolveResult {
  pieces: Piece[]; // updated pieces (cloned from input)
  events: CombatEvent[];
}

function clonePieces(pieces: Piece[]): Piece[] {
  return pieces.map(p => ({ ...p }));
}

function inBounds(x:number,y:number){ return x>=0 && x<8 && y>=0 && y<8; }

/**
 * Core combat + movement resolution according to current rule set:
 * - Attacker always moves into (toX,toY)
 * - If defender (enemy) present:
 *    - If defender.level === 1 => defender dies (kill event)
 *    - Else defender is demoted by exactly 1 level and pushed one square further along (dx,dy) chain pushing as needed.
 * - Chain push does NOT demote chained occupants (only original defender demoted once) per simplified rule.
 * - Any piece pushed out of bounds dies (kill event, reason 'pushed-out').
 * - Attacker only promotes (level +1 up to 3) if at least one enemy piece was killed this resolution (capture or pushed-out).
 */
export function resolveCombatAndMove(args: {
  pieces: Piece[];
  attackerId: string;
  toX: number; toY: number;
  blackHoles?: { x: number; y: number }[];
}): ResolveResult {
  const { pieces: original, attackerId, toX, toY } = args;
  const blackHoles = args.blackHoles || [];
  function isBlackHole(x:number,y:number){ return blackHoles.some(b => b.x===x && b.y===y); }
  const pieces = clonePieces(original);
  const events: CombatEvent[] = [];

  const attacker = pieces.find(p => p.id === attackerId && p.alive);
  if (!attacker) {
    return { pieces, events }; // no-op
  }
  const fromX = attacker.x; const fromY = attacker.y;
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  const defender = pieces.find(p => p.alive && p.x === toX && p.y === toY && p.id !== attacker.id && p.team !== attacker.team);

  function pushPiece(piece: Piece, vx: number, vy: number, allowDemotion: boolean, alreadyDemoted: {value:boolean}) {
    const targetX = piece.x + vx;
    const targetY = piece.y + vy;
    if (!inBounds(targetX, targetY)) {
      piece.alive = false;
      events.push({ type: 'kill', pieceId: piece.id, reason: 'pushed-out' });
      return;
    }
    const occupant = pieces.find(p => p.alive && p.x === targetX && p.y === targetY && p.id !== piece.id);
    if (occupant) {
      // chain push (no demotion for chained pieces)
      pushPiece(occupant, vx, vy, false, alreadyDemoted);
    }
    if (!piece.alive) return; // may have died during recursive push
    const from = { x: piece.x, y: piece.y };
    piece.x = targetX; piece.y = targetY;
    events.push({ type: 'push', pieceId: piece.id, from, to: { x: targetX, y: targetY } });
    if (piece.alive && isBlackHole(piece.x, piece.y)) {
      piece.alive = false;
      events.push({ type: 'kill', pieceId: piece.id, reason: 'pushed-out' });
      return;
    }
    if (allowDemotion && !alreadyDemoted.value) {
      const old = piece.level as number;
      const next = Math.max(1, old - 1);
      if (next !== old) {
        piece.level = next as Piece['level'];
        events.push({ type: 'demotion', pieceId: piece.id, fromLevel: old, toLevel: next });
        alreadyDemoted.value = true;
      }
    }
  }

  if (defender) {
    // Flag capture: instant kill + game-ending condition (represented via special kill reason 'capture')
    if (defender.isFlag) {
      defender.alive = false;
      events.push({ type: 'flag-capture', pieceId: defender.id, flagTeam: defender.team, attackerTeam: attacker.team });
      attacker.x = toX; attacker.y = toY;
      return { pieces, events };
    }
    if (defender.level === 1) {
      defender.alive = false;
      events.push({ type: 'kill', pieceId: defender.id, reason: 'capture' });
    } else {
      if (dx !== 0 || dy !== 0) {
        pushPiece(defender, dx, dy, true, { value: false });
      } else {
        const old = defender.level as number;
        const next = Math.max(1, old - 1);
        if (next !== old) {
          defender.level = next as Piece['level'];
          events.push({ type: 'demotion', pieceId: defender.id, fromLevel: old, toLevel: next });
        }
      }
    }
  }

  // Move attacker into destination
  attacker.x = toX; attacker.y = toY;
  // Attacker is allowed to stand on a black hole square (cannot move there manually in UI),
  // Only pieces pushed into black holes die (handled in pushPiece).
  // Promotion now only occurs if a kill happened during this resolution
  const anyKill = events.some(e => e.type === 'kill');
  if (anyKill) {
    const oldLevel = attacker.level as number;
    const newLevel = Math.min(3, oldLevel + 1);
    if (newLevel !== oldLevel) {
      attacker.level = newLevel as Piece['level'];
      events.push({ type: 'promotion', pieceId: attacker.id, fromLevel: oldLevel, toLevel: newLevel });
    }
  }

  return { pieces, events };
}
