# Quickstart: Core Gameplay Loop Integration

**Feature**: `007-core-loop-integration` | **Date**: 2026-01-22

## Overview

This guide covers integrating the core gameplay loop with the React Native frontend.

## Prerequisites

```bash
# Ensure programs are deployed to devnet
# From solana-programs repo
anchor build
anchor deploy --provider.cluster devnet

# Install app dependencies
cd app
npm install
```

## 1. Start a New Session

Bundle 5 instructions into a single transaction:

```typescript
import { createSessionBundle } from '@/services/solana/sessionBundle';
import { useWallet } from '@/contexts/WalletContext';
import { useBurnerWallet } from '@/hooks/useBurnerWallet';

const StartGameButton = ({ level }: { level: number }) => {
  const { publicKey, signTransaction } = useWallet();
  const { getOrCreateBurner } = useBurnerWallet();
  const { connection } = useSolanaConnection();

  const handleStart = async () => {
    // 1. Get or create burner wallet
    const burner = await getOrCreateBurner();

    // 2. Build atomic transaction
    const tx = await createSessionBundle(
      connection,
      publicKey,
      burner.publicKey,
      level,
      50_000_000, // 0.05 SOL for gameplay fees
    );

    // 3. Sign with main wallet (single signature!)
    const signedTx = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(signedTx.serialize());

    // 4. Wait for confirmation
    await connection.confirmTransaction(signature);

    // 5. Navigate to game
    navigation.navigate('Game', { level });
  };

  return <Button onPress={handleStart}>Start Level {level}</Button>;
};
```

## 2. Movement with Combat

Use burner wallet for gameplay transactions:

```typescript
import { useCombatReplay } from '@/hooks/useCombatReplay';
import { useNightMovement } from '@/hooks/useNightMovement';

const useGameplayMove = () => {
  const { burnerWallet } = useBurnerWallet();
  const { animateNightMovement } = useNightMovement();
  const { playCombatReplay, setCombatReplay } = useCombatReplay();
  const gameplayProgram = useGameplayProgram();

  const move = async (targetX: number, targetY: number, isWall: boolean) => {
    // 1. Send move_with_combat transaction (burner signs automatically)
    const signature = await gameplayProgram.methods
      .moveWithCombat(targetX, targetY, isWall)
      .accounts({
        gameState: gameStatePda,
        mapEnemies: enemiesPda,
        mapPois: poisPda,
        playerInventory: inventoryPda,
        gameSession: sessionPda,
        playerProfile: profilePda,
        player: burnerWallet.publicKey,
      })
      .signers([burnerWallet])
      .rpc();

    // 2. Parse events from transaction
    const nightMovements = await parseNightMovement(connection, gameplayProgram, signature);
    const combat = await parseCombatEvents(connection, gameplayProgram, signature);

    // 3. Animate night enemy movement (if any)
    if (nightMovements.length > 0) {
      await animateNightMovement(nightMovements);
    }

    // 4. Show combat replay (if any)
    if (combat) {
      setCombatReplay(combat);
      await playCombatReplay();
    }

    // 5. Fetch updated state
    await refetchGameState();
  };

  return { move };
};
```

## 3. Combat Replay Display

Show combat animation from events:

```typescript
import { CombatOverlay } from '@/components/combat/CombatOverlay';

const GameScreen = () => {
  const { combatReplay, replayState, clearReplay } = useCombatReplay();

  return (
    <View style={styles.container}>
      <GameCanvas />

      {combatReplay && (
        <CombatOverlay
          replay={combatReplay}
          state={replayState}
          onComplete={() => {
            if (!combatReplay.combatEnded.playerWon) {
              navigation.navigate('Death', { replay: combatReplay });
            } else if (combatReplay.isBoss && gameState.week === 3) {
              navigation.navigate('Victory', { replay: combatReplay });
            }
            clearReplay();
          }}
        />
      )}
    </View>
  );
};
```

## 4. Night Enemy Movement

Animate enemies during night phases:

```typescript
const useNightMovement = () => {
  const [movements, setMovements] = useState<EnemyMovedEvent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const animateNightMovement = async (events: EnemyMovedEvent[]) => {
    setMovements(events);

    for (let i = 0; i < events.length; i++) {
      setCurrentIndex(i);
      // Animate enemy position change (handled by EnemyMovement component)
      await delay(200); // 200ms per enemy
    }

    setMovements([]);
    setCurrentIndex(0);
  };

  return { movements, currentIndex, animateNightMovement };
};
```

## 5. POI Interaction

Interact only when on POI tile:

```typescript
const usePoiInteraction = () => {
  const { gameState, pois } = useGameplayState();
  const { burnerWallet } = useBurnerWallet();
  const poiProgram = usePoiProgram();

  const canInteract = useMemo(() => {
    return pois.some(
      (poi) => poi.x === gameState.positionX && poi.y === gameState.positionY && !poi.consumed
    );
  }, [pois, gameState.positionX, gameState.positionY]);

  const interact = async () => {
    const poiIndex = pois.findIndex(
      (poi) => poi.x === gameState.positionX && poi.y === gameState.positionY && !poi.consumed
    );

    if (poiIndex === -1) return;

    await poiProgram.methods
      .interactPoi(poiIndex)
      .accounts({
        mapPois: poisPda,
        gameState: gameStatePda,
        gameSession: sessionPda,
        playerInventory: inventoryPda,
        player: burnerWallet.publicKey,
      })
      .signers([burnerWallet])
      .rpc();

    await refetchPois();
  };

  return { canInteract, interact };
};
```

## 6. Multi-Session Management

List and switch between sessions:

```typescript
const SessionListScreen = () => {
  const { publicKey } = useWallet();
  const { data: sessions, refetch } = useQuery(
    ['sessions', publicKey?.toBase58()],
    () => fetchSessionList(connection, sessionProgram, publicKey!),
    { enabled: !!publicKey }
  );

  const handleContinue = async (sessionPda: string) => {
    const data = await switchToSession(connection, new PublicKey(sessionPda));
    setGameState(data);
    navigation.navigate('Game');
  };

  const handleAbandon = async (sessionPda: string) => {
    const confirmed = await showConfirm('Abandon this run? You will lose 1 run.');
    if (confirmed) {
      await abandonSession(connection, mainWallet, burnerWallet, new PublicKey(sessionPda));
      refetch();
    }
  };

  return (
    <FlatList
      data={sessions}
      renderItem={({ item }) => (
        <SessionCard
          session={item}
          onContinue={() => handleContinue(item.sessionPda)}
          onAbandon={() => handleAbandon(item.sessionPda)}
        />
      )}
    />
  );
};
```

## 7. Death/Victory Handling

Show result screens after session ends:

```typescript
// DeathScreen.tsx
const DeathScreen = ({ route }) => {
  const { replay } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You Died</Text>
      <Text>Killed by: {replay.combatEnded.killedBy}</Text>
      <Text>Total Moves: {gameState.totalMoves}</Text>
      <Text>Gold Earned: {replay.combatEnded.goldEarned}</Text>

      <Button onPress={() => navigation.navigate('Hub')}>
        Return to Hub
      </Button>
    </View>
  );
};

// VictoryScreen.tsx
const VictoryScreen = ({ route }) => {
  const { replay, levelUnlocked, itemUnlocked } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Victory!</Text>

      {levelUnlocked && (
        <Text>Level {levelUnlocked} Unlocked!</Text>
      )}

      {itemUnlocked && (
        <UnlockAnimation item={itemUnlocked} />
      )}

      <Button onPress={() => navigation.navigate('Hub')}>
        Return to Hub
      </Button>
    </View>
  );
};
```

## 8. Run Economy

Purchase runs when needed:

```typescript
const useRunEconomy = () => {
  const { publicKey, signTransaction } = useWallet();
  const profileProgram = useProfileProgram();

  const purchaseRuns = async () => {
    const signature = await profileProgram.methods
      .purchaseRuns()
      .accounts({
        playerProfile: profilePda,
        owner: publicKey,
        treasury: TREASURY_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await connection.confirmTransaction(signature);
    await refetchProfile();
  };

  return { purchaseRuns };
};
```

## 9. Item Collection Display

Show unlocked items:

```typescript
const useItemCollection = () => {
  const { profile } = useProfile();

  const collection = useMemo(() => {
    const unlocked = getUnlockedItems(profile.unlockedItems);
    const locked = Array.from({ length: 80 }, (_, i) => i).filter((i) => !unlocked.includes(i));

    return {
      starterItems: unlocked.filter((i) => i < 40),
      unlockedItems: unlocked,
      lockedItems: locked,
      totalUnlocked: unlocked.length,
      percentComplete: Math.round((unlocked.length / 80) * 100),
    };
  }, [profile.unlockedItems]);

  return collection;
};

// Bitmask utility
function getUnlockedItems(bitmask: Uint8Array): number[] {
  const unlocked: number[] = [];
  for (let i = 0; i < 80; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    if (bitmask[byteIndex] & (1 << bitIndex)) {
      unlocked.push(i);
    }
  }
  return unlocked;
}
```

## Testing

```bash
# Run unit tests
npm test -- --testPathPattern=session
npm test -- --testPathPattern=combat
npm test -- --testPathPattern=night

# Test specific flows
npm test -- __tests__/integration/session-creation.test.ts
npm test -- __tests__/integration/combat-replay.test.ts
```

## Key Files

| File                                      | Purpose                      |
| ----------------------------------------- | ---------------------------- |
| `src/services/solana/sessionBundle.ts`    | 5-instruction bundle builder |
| `src/services/solana/eventParser.ts`      | Combat/night event parsing   |
| `src/hooks/useCombatReplay.ts`            | Combat animation state       |
| `src/hooks/useNightMovement.ts`           | Enemy animation during night |
| `src/hooks/useSessionList.ts`             | Multi-session management     |
| `src/components/combat/CombatOverlay.tsx` | Combat animation display     |
| `src/screens/DeathScreen.tsx`             | Death result screen          |
| `src/screens/VictoryScreen.tsx`           | Victory result screen        |
