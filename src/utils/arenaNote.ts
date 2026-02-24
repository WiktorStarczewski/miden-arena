/**
 * arenaNote.ts — Note script loader, builders, and two-tx orchestrator for
 * arena contract interactions.
 *
 * Each arena interaction follows a two-transaction pattern:
 *  1. Session wallet creates an output note with a custom script targeting the arena
 *  2. The note is consumed against the arena account, triggering the script which
 *     calls arena procedures (join, set_team, submit_commit, submit_reveal)
 *
 * This module encapsulates the full flow in `submitArenaNote()`.
 */

import {
  AccountId,
  FeltArray,
  Felt,
  FungibleAsset,
  Note,
  NoteAndArgs,
  NoteAndArgsArray,
  NoteAssets,
  NoteMetadata,
  NoteRecipient,
  NoteScript,
  NoteStorage,
  NoteTag,
  NoteType,
  OutputNote,
  OutputNoteArray,
  Package,
  TransactionRequestBuilder,
  Word,
} from "@miden-sdk/miden-sdk";
import type { WasmWebClient } from "@miden-sdk/miden-sdk";
import { NOTE_SCRIPTS } from "../constants/contracts";
import { MIDEN_FAUCET_ID, STAKE_AMOUNT, PROTOCOL_NOTE_AMOUNT } from "../constants/miden";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Prover interface matching what useMiden() exposes. */
type Prover = Parameters<WasmWebClient["submitNewTransactionWithProver"]>[2];

export interface SubmitArenaNoteParams {
  client: WasmWebClient;
  prover: Prover;
  sessionWalletId: string;
  arenaAccountId: string;
  note: Note;
  consumeArgs?: Word | null;
}

export interface SubmitArenaNoteResult {
  /** The ID of the created note (for tracking / retry). */
  noteId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an AccountId from a bech32/hex string. */
export function parseId(id: string): AccountId {
  try {
    return AccountId.fromBech32(id);
  } catch {
    return AccountId.fromHex(id);
  }
}

/**
 * Random bigint in [0, 2^62) — safely below Miden's field modulus (~2^64).
 * Used for nonces (commitment.ts) and note serial numbers.
 */
export function randomFelt(): bigint {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >> 2n;
}

/** Generate a random Word (4 random Felts) for unique note serial numbers. */
function randomSerialNum(): Word {
  return new Word(
    BigUint64Array.from([randomFelt(), randomFelt(), randomFelt(), randomFelt()]),
  );
}

// ---------------------------------------------------------------------------
// Script loading (cached)
// ---------------------------------------------------------------------------

const scriptCache = new Map<string, NoteScript>();

/**
 * Fetch a compiled note script from a `.masp` file and cache it.
 * Subsequent calls with the same path return the cached script.
 */
export async function loadNoteScript(path: string): Promise<NoteScript> {
  const cached = scriptCache.get(path);
  if (cached) return cached;

  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error(`Failed to fetch note script at ${path}: ${resp.status}`);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const pkg = Package.deserialize(bytes);
  const script = NoteScript.fromPackage(pkg);

  scriptCache.set(path, script);
  return script;
}

// ---------------------------------------------------------------------------
// Note builders
// ---------------------------------------------------------------------------

/**
 * Build a stake note targeting the arena account.
 * Assets: FungibleAsset(faucetId, STAKE_AMOUNT)
 * No noteInputs — script uses get_assets() + get_sender().
 */
export async function buildStakeNote(
  senderAccountId: string,
  arenaAccountId: string,
): Promise<Note> {
  const script = await loadNoteScript(NOTE_SCRIPTS.processStake);
  const sender = parseId(senderAccountId);
  const arena = parseId(arenaAccountId);
  const faucet = parseId(MIDEN_FAUCET_ID);

  const assets = new NoteAssets([new FungibleAsset(faucet, STAKE_AMOUNT)]);
  const tag = NoteTag.withAccountTarget(arena);
  const metadata = new NoteMetadata(sender, NoteType.Public, tag);
  const storage = new NoteStorage(new FeltArray([]));
  const recipient = new NoteRecipient(randomSerialNum(), script, storage);

  return new Note(assets, metadata, recipient);
}

/**
 * Build a team submission note targeting the arena account.
 * Assets: dust (PROTOCOL_NOTE_AMOUNT).
 * No noteInputs — script uses arg Word at consumption time.
 */
export async function buildTeamNote(
  senderAccountId: string,
  arenaAccountId: string,
): Promise<Note> {
  const script = await loadNoteScript(NOTE_SCRIPTS.processTeam);
  const sender = parseId(senderAccountId);
  const arena = parseId(arenaAccountId);
  const faucet = parseId(MIDEN_FAUCET_ID);

  const assets = new NoteAssets([new FungibleAsset(faucet, PROTOCOL_NOTE_AMOUNT)]);
  const tag = NoteTag.withAccountTarget(arena);
  const metadata = new NoteMetadata(sender, NoteType.Public, tag);
  const storage = new NoteStorage(new FeltArray([]));
  const recipient = new NoteRecipient(randomSerialNum(), script, storage);

  return new Note(assets, metadata, recipient);
}

/**
 * Build a commit note targeting the arena account.
 * Assets: dust (PROTOCOL_NOTE_AMOUNT).
 * noteInputs: [Felt(0n)] — phase=0 for commit.
 */
export async function buildCommitNote(
  senderAccountId: string,
  arenaAccountId: string,
): Promise<Note> {
  const script = await loadNoteScript(NOTE_SCRIPTS.submitMove);
  const sender = parseId(senderAccountId);
  const arena = parseId(arenaAccountId);
  const faucet = parseId(MIDEN_FAUCET_ID);

  const assets = new NoteAssets([new FungibleAsset(faucet, PROTOCOL_NOTE_AMOUNT)]);
  const tag = NoteTag.withAccountTarget(arena);
  const metadata = new NoteMetadata(sender, NoteType.Public, tag);
  const storage = new NoteStorage(new FeltArray([new Felt(0n)]));
  const recipient = new NoteRecipient(randomSerialNum(), script, storage);

  return new Note(assets, metadata, recipient);
}

/**
 * Build a reveal note targeting the arena account.
 * Assets: dust (PROTOCOL_NOTE_AMOUNT).
 * noteInputs: [Felt(1n)] — phase=1 for reveal.
 */
export async function buildRevealNote(
  senderAccountId: string,
  arenaAccountId: string,
): Promise<Note> {
  const script = await loadNoteScript(NOTE_SCRIPTS.submitMove);
  const sender = parseId(senderAccountId);
  const arena = parseId(arenaAccountId);
  const faucet = parseId(MIDEN_FAUCET_ID);

  const assets = new NoteAssets([new FungibleAsset(faucet, PROTOCOL_NOTE_AMOUNT)]);
  const tag = NoteTag.withAccountTarget(arena);
  const metadata = new NoteMetadata(sender, NoteType.Public, tag);
  const storage = new NoteStorage(new FeltArray([new Felt(1n)]));
  const recipient = new NoteRecipient(randomSerialNum(), script, storage);

  return new Note(assets, metadata, recipient);
}

// ---------------------------------------------------------------------------
// Two-tx orchestrator
// ---------------------------------------------------------------------------

const MAX_CONSUME_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Submit an arena note via two sequential transactions:
 *  1. Create the note from the session wallet (output note on-chain)
 *  2. Consume the note against the arena account (triggers the note script)
 *
 * Handles nonce conflicts via retry with backoff.
 * Returns the created note ID for tracking/retry.
 */
export async function submitArenaNote(
  params: SubmitArenaNoteParams,
): Promise<SubmitArenaNoteResult> {
  const { client, prover, sessionWalletId, arenaAccountId, note, consumeArgs } = params;

  // --- Step 1: Create the note from session wallet ---
  const sessionId = parseId(sessionWalletId);

  // Capture the note ID before submission (Note has .id() available immediately)
  const noteId = note.id().toString();

  const createTxRequest = new TransactionRequestBuilder()
    .withOwnOutputNotes(new OutputNoteArray([OutputNote.full(note)]))
    .build();

  await client.submitNewTransactionWithProver(
    sessionId,
    createTxRequest,
    prover,
  );

  console.log("[submitArenaNote] Note created on-chain", { noteId });

  // --- Step 2: Sync so the note becomes discoverable ---
  await client.syncState();

  // --- Step 3: Consume the note against the arena account ---
  const arenaId = parseId(arenaAccountId);

  // Import the arena account if not already imported (idempotent)
  try {
    await client.importAccountById(arenaId);
  } catch {
    // Already imported — ignore
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_CONSUME_RETRIES; attempt++) {
    try {
      // Retrieve the full Note object for consumption
      const inputRecord = await client.getInputNote(noteId);
      if (!inputRecord) {
        throw new Error(`[submitArenaNote] Note ${noteId} not found after sync`);
      }
      const fullNote = inputRecord.toNote();

      // Wrap with args
      const noteAndArgs = new NoteAndArgs(fullNote, consumeArgs ?? null);
      const noteAndArgsArray = new NoteAndArgsArray([noteAndArgs]);

      const consumeTxRequest = new TransactionRequestBuilder()
        .withInputNotes(noteAndArgsArray)
        .build();

      // Submit against the arena account
      const freshArenaId = parseId(arenaAccountId);
      await client.submitNewTransactionWithProver(
        freshArenaId,
        consumeTxRequest,
        prover,
      );

      console.log("[submitArenaNote] Note consumed by arena", { noteId, attempt });

      // Sync again to reflect updated arena state
      await client.syncState();

      return { noteId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[submitArenaNote] Consume attempt ${attempt + 1}/${MAX_CONSUME_RETRIES} failed`,
        lastError.message,
      );

      if (attempt < MAX_CONSUME_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        // Re-sync before retry (picks up nonce updates from other player's tx)
        await client.syncState();
      }
    }
  }

  // All retries exhausted — log note ID for manual recovery
  console.error(
    "[submitArenaNote] All consume retries exhausted. Note exists on-chain but is not consumed.",
    { noteId },
  );
  throw lastError ?? new Error("[submitArenaNote] Consume failed after retries");
}
