export interface CommitData {
  move: number; // 1-20
  nonce: Uint8Array; // 8 bytes
  part1: bigint; // 48-bit hash chunk + 1
  part2: bigint; // 48-bit hash chunk + 1
}

export interface RevealData {
  move: number; // 1-20
  noncePart1: bigint; // first 4 bytes of nonce + 1
  noncePart2: bigint; // last 4 bytes of nonce + 1
}

export type NoteSignalType =
  | "join" // amount = 100
  | "accept" // amount = 101
  | "draft_pick" // amount = 1-10 (championId + 1)
  | "commit_part1" // amount = 1 to 2^48 (hash chunk)
  | "commit_part2" // amount = 1 to 2^48 (hash chunk)
  | "reveal_move" // amount = 1-20
  | "reveal_nonce1" // amount = 1 to 2^32
  | "reveal_nonce2" // amount = 1 to 2^32
  | "stake"; // amount = 10_000_000 (10 MIDEN)

export interface NoteSignal {
  type: NoteSignalType;
  amount: bigint;
  sender: string;
  noteId: string;
}

export interface GameNote {
  noteId: string;
  sender: string;
  amount: bigint;
  consumed: boolean;
}
