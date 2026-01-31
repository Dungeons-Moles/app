# Quickstart: Solana Program Instructions Integration

**Feature**: 008-solana-program-instructions
**Branch**: `008-solana-program-instructions`

## Prerequisites

1. **Solana programs deployed** — All 6 programs must be deployed to devnet:
   - player-profile, session-manager, map-generator, gameplay-state, player-inventory, poi-system
   - Build: `cd ../solana-programs && anchor build`
   - Deploy: `anchor deploy --provider.cluster devnet`

2. **Admin accounts initialized** — One-time setup (already done if devnet programs exist):
   - `initialize_counter` on session-manager
   - `initialize_map_config` on map-generator

3. **Environment variables** — Add to `.env`:
   ```
   EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID=29DPbP1zuCCRg63PiShMjxAmZos97BR5TmhpijUYQzze
   EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID=FcMT7MzBLVQGaMATEMws3fjsL2Q77QSHmoEPdowTMxJa
   EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID=BYdGuEGf8NqtLnHpSRuZFrPGEgvdxMfGfTt71QVBxYHa
   EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID=5VAaGSSoBP4UEt3RL2EXvDwpeDxAXMndsJn7QX96nc4n
   EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID=5BtqiWegvVAgEnTRUofB9oUoQvPztYqSkMPwRpYQacP8
   EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID=6E27r1Cyo2CNPvtRsonn3uHUAdznS3cMXEBX4HRbfBQY
   ```

4. **Devnet SOL** — Main wallet needs SOL for profile creation and burner wallet funding:
   ```
   solana airdrop 2 --url devnet
   ```

## Setup Steps

1. **Switch to feature branch**:
   ```bash
   git checkout 008-solana-program-instructions
   ```

2. **Copy updated IDL files** from solana-programs:
   ```bash
   cp ../solana-programs/target/idl/gameplay_state.json src/services/solana/idl/
   cp ../solana-programs/target/idl/map_generator.json src/services/solana/idl/
   cp ../solana-programs/target/idl/player_profile.json src/services/solana/idl/
   cp ../solana-programs/target/idl/session_manager.json src/services/solana/idl/
   cp ../solana-programs/target/idl/player_inventory.json src/services/solana/idl/
   cp ../solana-programs/target/idl/poi_system.json src/services/solana/idl/
   ```

3. **Install dependencies** (if any new ones added):
   ```bash
   npm install
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Start the app**:
   ```bash
   npx expo start
   ```

## Verification

### Profile Creation
1. Open app, connect wallet
2. Enter a name and create profile
3. Verify profile PDA exists: `solana account <profile_pda> --url devnet`

### Session Start
1. Select campaign level 1
2. Verify all 6 session accounts created on-chain
3. Map should render with spawn position

### Movement
1. Tap adjacent tile
2. Position should update within 3 seconds
3. If enemy encountered, combat events should display

### POI Interaction
1. Navigate to a POI tile
2. Interact button should appear
3. Verify interaction sends correct instruction

### Run Result
1. Complete or abandon a session
2. Verify profile total_runs incremented
3. Verify available_runs decremented

## Key Files

| Area | File | Purpose |
|------|------|---------|
| IDLs | `src/services/solana/idl/*.json` | Program interface definitions |
| Config | `src/services/solana/config.ts` | Program IDs from env vars |
| Programs | `src/services/solana/programs.ts` | Anchor program factories |
| Constants | `src/services/solana/constants.ts` | PDA derivation functions |
| Move | `src/services/solana/gameplayState.ts` | move_player instruction caller |
| POI | `src/services/solana/poiSystem.ts` | POI instruction callers (NEW) |
| Events | `src/services/solana/eventParser.ts` | Transaction event parsing |
| Hook | `src/hooks/usePoiInteraction.ts` | POI interaction React hook |
| Hook | `src/hooks/useGameplayState.ts` | Gameplay state React hook |
| Context | `src/contexts/SessionContext.tsx` | Session lifecycle management |
