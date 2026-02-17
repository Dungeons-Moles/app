/**
 * Debug script: fetch latest Pit Draft match from local validator
 * and reconstruct the combat turn by turn.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'http://127.0.0.1:8899';
const GAMEPLAY_STATE_PROGRAM_ID = new PublicKey('5VAaGSSoBP4UEt3RL2EXvDwpeDxAXMndsJn7QX96nc4n');
const PIT_DRAFT_QUEUE_SEED = 'pit_draft_queue';

// Discriminators
const PIT_DRAFT_COMBAT_VISUAL_DISC = Buffer.from([0, 40, 95, 5, 28, 192, 191, 227]);
const PIT_DRAFT_RESOLVED_DISC = Buffer.from([200, 164, 181, 53, 37, 147, 146, 7]);

// LogAction enum
const LogAction = {
  0: 'Attack',
  1: 'Heal',
  2: 'ApplyStatus',
  3: 'StatusDamage',
  4: 'ArmorChange',
  5: 'AtkChange',
  6: 'SpdChange',
  7: 'NonWeaponDamage',
  8: 'ShrapnelRetaliation',
  9: 'GoldStolen',
};

const StatusId = {
  0: 'Chill',
  1: 'Shrapnel',
  2: 'Rust',
  3: 'Bleed',
};

// Item ID bytes to string
function decodeItemId(itemId) {
  return String.fromCharCode(...itemId.filter(b => b !== 0));
}

// Tier byte to string
function decodeTier(tierByte) {
  return { 0: 'I', 1: 'II', 2: 'III' }[tierByte] ?? 'I';
}

// Decode Option<ItemInstance>
function decodeOptionItem(data, offset) {
  const tag = data.readUInt8(offset);
  if (tag === 0) return { value: null, bytesRead: 1 };
  const itemId = Array.from(data.subarray(offset + 1, offset + 9));
  const tierByte = data.readUInt8(offset + 9);
  const toolOilFlags = data.readUInt8(offset + 10);
  return {
    value: { id: decodeItemId(itemId), tier: decodeTier(tierByte), toolOilFlags },
    bytesRead: 11,
  };
}

// Decode PitDraftCombatVisual
function decodeCombatVisual(data) {
  let offset = 0;
  const playerA = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const playerB = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // playerA tool
  const aTool = decodeOptionItem(data, offset);
  offset += aTool.bytesRead;

  // playerA gear (12 slots)
  const aGear = [];
  for (let i = 0; i < 12; i++) {
    const item = decodeOptionItem(data, offset);
    aGear.push(item.value);
    offset += item.bytesRead;
  }

  // playerB tool
  const bTool = decodeOptionItem(data, offset);
  offset += bTool.bytesRead;

  // playerB gear (12 slots)
  const bGear = [];
  for (let i = 0; i < 12; i++) {
    const item = decodeOptionItem(data, offset);
    bGear.push(item.value);
    offset += item.bytesRead;
  }

  // combat_log: Vec<CombatLogEntry>
  const logCount = data.readUInt32LE(offset);
  offset += 4;

  const combatLog = [];
  for (let i = 0; i < logCount; i++) {
    combatLog.push({
      turn: data.readUInt8(offset),
      isPlayer: data.readUInt8(offset + 1) !== 0,
      action: data.readUInt8(offset + 2),
      value: data.readInt16LE(offset + 3),
      extra: data.readUInt8(offset + 5),
    });
    offset += 6;
  }

  // combat_log_truncated: bool (1 byte)
  const combatLogTruncated = data.readUInt8(offset) !== 0;
  offset += 1;
  // combat_log_total_entries: u16 (2 bytes)
  const combatLogTotalEntries = data.readUInt16LE(offset);
  offset += 2;

  const playerAWon = data.readUInt8(offset) !== 0;
  offset += 1;
  const finalPlayerAHp = data.readInt16LE(offset);
  offset += 2;
  const finalPlayerBHp = data.readInt16LE(offset);
  offset += 2;
  const turnsTaken = data.readUInt8(offset);

  return {
    playerA: playerA.toBase58(),
    playerB: playerB.toBase58(),
    playerATool: aTool.value,
    playerAGear: aGear.filter(g => g !== null),
    playerBTool: bTool.value,
    playerBGear: bGear.filter(g => g !== null),
    combatLog,
    combatLogTruncated,
    combatLogTotalEntries,
    playerAWon,
    finalPlayerAHp,
    finalPlayerBHp,
    turnsTaken,
  };
}

// Decode PitDraftResolved
function decodeResolved(data) {
  let offset = 0;
  const playerA = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const playerB = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const winner = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const entryLamports = Number(data.readBigUInt64LE(offset)); offset += 8;
  const totalPot = Number(data.readBigUInt64LE(offset)); offset += 8;
  const winnerPayout = Number(data.readBigUInt64LE(offset)); offset += 8;
  const companyFee = Number(data.readBigUInt64LE(offset)); offset += 8;
  const gauntletFee = Number(data.readBigUInt64LE(offset)); offset += 8;
  const turnsTaken = data.readUInt8(offset);

  return {
    playerA: playerA.toBase58(),
    playerB: playerB.toBase58(),
    winner: winner.toBase58(),
    entryLamports,
    totalPot,
    winnerPayout: (winnerPayout / 1e9).toFixed(4) + ' SOL',
    companyFee: (companyFee / 1e9).toFixed(4) + ' SOL',
    gauntletFee: (gauntletFee / 1e9).toFixed(4) + ' SOL',
    turnsTaken,
  };
}

// Simulate combat from log to reconstruct HP turn by turn
function simulateCombat(visual) {
  // Base PvP stats
  const BASE_HP = 10;
  const BASE_ATK = 1;

  console.log('\n=== COMBAT SIMULATION (playerA perspective, isPlayer=true means playerA) ===\n');

  let playerAHp = BASE_HP; // Will be adjusted by gear
  let playerBHp = BASE_HP;
  let playerAArm = 0;
  let playerBArm = 0;

  for (const entry of visual.combatLog) {
    const actorLabel = entry.isPlayer ? 'PlayerA' : 'PlayerB';
    const targetLabel = entry.isPlayer ? 'PlayerB' : 'PlayerA';
    const actionName = LogAction[entry.action] ?? `Unknown(${entry.action})`;
    const statusName = StatusId[entry.extra] ?? `Status(${entry.extra})`;

    let desc = '';
    switch (entry.action) {
      case 0: // Attack
        desc = `${actorLabel} attacks ${targetLabel} for ${entry.value} damage`;
        if (entry.isPlayer) playerBHp -= entry.value;
        else playerAHp -= entry.value;
        break;
      case 1: // Heal
        desc = `${actorLabel} heals self for ${entry.value}`;
        if (entry.isPlayer) playerAHp += entry.value;
        else playerBHp += entry.value;
        break;
      case 2: // ApplyStatus
        desc = `${actorLabel} applies ${entry.value} ${statusName} to ${targetLabel}`;
        break;
      case 3: // StatusDamage
        desc = `${actorLabel} takes ${entry.value} ${statusName} damage`;
        if (entry.isPlayer) playerAHp -= entry.value;
        else playerBHp -= entry.value;
        break;
      case 4: // ArmorChange
        if (entry.value > 0) {
          desc = `${actorLabel} gains ${entry.value} armor`;
          if (entry.isPlayer) playerAArm += entry.value;
          else playerBArm += entry.value;
        } else {
          desc = `${actorLabel} loses ${Math.abs(entry.value)} armor`;
          if (entry.isPlayer) playerAArm = Math.max(0, playerAArm + entry.value);
          else playerBArm = Math.max(0, playerBArm + entry.value);
        }
        break;
      case 5: // AtkChange
        desc = `${actorLabel} ATK changes by ${entry.value}`;
        break;
      case 6: // SpdChange
        desc = `${actorLabel} SPD changes by ${entry.value}`;
        break;
      case 7: // NonWeaponDamage
        desc = `${actorLabel} deals ${entry.value} non-weapon damage to ${targetLabel}`;
        if (entry.isPlayer) playerBHp -= entry.value;
        else playerAHp -= entry.value;
        break;
      case 8: // ShrapnelRetaliation
        desc = `${actorLabel} takes ${entry.value} shrapnel retaliation damage`;
        if (entry.isPlayer) playerAHp -= entry.value;
        else playerBHp -= entry.value;
        break;
      case 9: // GoldStolen
        desc = `${actorLabel} steals ${entry.value} gold from ${targetLabel}`;
        break;
      default:
        desc = `${actorLabel} ${actionName}(${entry.value}) extra=${entry.extra}`;
    }

    console.log(`  Turn ${entry.turn}: ${desc}  [A_HP=${playerAHp} B_HP=${playerBHp}]`);
  }

  console.log(`\n  Final simulated: PlayerA HP=${playerAHp}, PlayerB HP=${playerBHp}`);
  console.log(`  On-chain final:  PlayerA HP=${visual.finalPlayerAHp}, PlayerB HP=${visual.finalPlayerBHp}`);
  console.log(`  On-chain winner: ${visual.playerAWon ? 'PlayerA' : 'PlayerB'}`);

  if (playerAHp !== visual.finalPlayerAHp || playerBHp !== visual.finalPlayerBHp) {
    console.log('\n  ⚠ HP MISMATCH - initial HP likely differs from BASE_HP=10 due to gear bonuses');
  }
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Derive pit draft queue PDA
  const [queuePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PIT_DRAFT_QUEUE_SEED)],
    GAMEPLAY_STATE_PROGRAM_ID
  );

  console.log('Pit Draft Queue PDA:', queuePda.toBase58());
  console.log('Fetching signatures...\n');

  const signatures = await connection.getSignaturesForAddress(queuePda, { limit: 20 }, 'confirmed');
  console.log(`Found ${signatures.length} signatures\n`);

  // Find the latest transaction that has a combat visual event
  for (const sigInfo of signatures) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx?.meta?.logMessages) continue;

    let combatVisual = null;
    let resolved = null;

    for (const logLine of tx.meta.logMessages) {
      if (!logLine.startsWith('Program data: ')) continue;
      const buf = Buffer.from(logLine.slice('Program data: '.length), 'base64');
      if (buf.length < 8) continue;
      const disc = buf.subarray(0, 8);
      const data = buf.subarray(8);

      if (disc.equals(PIT_DRAFT_COMBAT_VISUAL_DISC)) {
        combatVisual = decodeCombatVisual(data);
      } else if (disc.equals(PIT_DRAFT_RESOLVED_DISC)) {
        resolved = decodeResolved(data);
      }
    }

    if (!combatVisual || !resolved) continue;

    // Found a match!
    console.log('=== LATEST PIT DRAFT MATCH ===');
    console.log('Signature:', sigInfo.signature);
    console.log('Slot:', sigInfo.slot);
    console.log('');

    console.log('=== RESOLVED EVENT ===');
    console.log(JSON.stringify(resolved, null, 2));

    console.log('\n=== COMBAT VISUAL ===');
    console.log('PlayerA:', combatVisual.playerA);
    console.log('PlayerB:', combatVisual.playerB);
    console.log('PlayerA Won:', combatVisual.playerAWon);
    console.log('Final PlayerA HP:', combatVisual.finalPlayerAHp);
    console.log('Final PlayerB HP:', combatVisual.finalPlayerBHp);
    console.log('Turns Taken:', combatVisual.turnsTaken);

    console.log('\n--- PlayerA Equipment ---');
    console.log('Tool:', combatVisual.playerATool ? `${combatVisual.playerATool.id} (Tier ${combatVisual.playerATool.tier}, oil=${combatVisual.playerATool.toolOilFlags})` : 'None');
    console.log('Gear:', combatVisual.playerAGear.map(g => `${g.id} (Tier ${g.tier})`).join(', ') || 'None');

    console.log('\n--- PlayerB Equipment ---');
    console.log('Tool:', combatVisual.playerBTool ? `${combatVisual.playerBTool.id} (Tier ${combatVisual.playerBTool.tier}, oil=${combatVisual.playerBTool.toolOilFlags})` : 'None');
    console.log('Gear:', combatVisual.playerBGear.map(g => `${g.id} (Tier ${g.tier})`).join(', ') || 'None');

    console.log('\n--- Raw Combat Log ---');
    console.log(`${combatVisual.combatLog.length} entries:`);
    for (const entry of combatVisual.combatLog) {
      const actionName = LogAction[entry.action] ?? `Unknown(${entry.action})`;
      const statusName = entry.action === 2 || entry.action === 3 ? ` [${StatusId[entry.extra] ?? entry.extra}]` : '';
      console.log(`  Turn ${entry.turn}: isPlayer=${entry.isPlayer} action=${actionName} value=${entry.value}${statusName} extra=${entry.extra}`);
    }

    // Simulate combat
    simulateCombat(combatVisual);

    // Now check: what does the frontend code do with isPlayer swap?
    console.log('\n=== FRONTEND PERSPECTIVE CHECK ===');
    console.log(`If YOUR wallet is PlayerA (${combatVisual.playerA.slice(0, 8)}...):`);
    console.log(`  You ${combatVisual.playerAWon ? 'WON' : 'LOST'} (from resolved event: winner=${resolved.winner.slice(0, 8)}...)`);
    console.log(`  isPlayer swap: none needed (isPlayer stays as-is)`);
    console.log(`  onChainOutcome.playerWon = ${combatVisual.playerAWon}`);
    console.log(`  finalPlayerHp = ${combatVisual.finalPlayerAHp}`);

    console.log(`\nIf YOUR wallet is PlayerB (${combatVisual.playerB.slice(0, 8)}...):`);
    console.log(`  You ${!combatVisual.playerAWon ? 'WON' : 'LOST'} (from resolved event: winner=${resolved.winner.slice(0, 8)}...)`);
    console.log(`  isPlayer swap: all isPlayer flags get flipped`);
    console.log(`  onChainOutcome.playerWon = ${!combatVisual.playerAWon}`);
    console.log(`  finalPlayerHp = ${combatVisual.finalPlayerBHp}`);

    // Check if resolved winner matches combat visual
    const resolvedWinnerIsA = resolved.winner === combatVisual.playerA;
    console.log(`\n=== CONSISTENCY CHECK ===`);
    console.log(`Resolved winner: ${resolved.winner.slice(0, 8)}...`);
    console.log(`Combat visual playerAWon: ${combatVisual.playerAWon}`);
    console.log(`Match: ${resolvedWinnerIsA === combatVisual.playerAWon ? 'YES ✓' : 'NO ✗ MISMATCH!'}`);

    break; // Only process the latest match
  }
}

main().catch(console.error);
