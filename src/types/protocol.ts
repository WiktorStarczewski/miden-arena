export interface CommitData {
  move: number; // 1-20
  nonce: Uint8Array; // 4 bytes
  part1: bigint; // 16-bit hash chunk + 1 (max 65536)
  part2: bigint; // 16-bit hash chunk + 1 (max 65536)
}

export interface RevealData {
  move: number; // 1-20
  noncePart1: bigint; // first 2 bytes of nonce + 21 (max 65556)
  noncePart2: bigint; // last 2 bytes of nonce + 21 (max 65556)
}

export type NoteSignalType =
  | "join" // amount = 100
  | "accept" // amount = 101
  | "draft_pick" // amount = 1-10 (championId + 1)
  | "commit_part1" // amount = 100_001 to 165_536 (hash chunk + offset)
  | "commit_part2" // amount = 100_001 to 165_536 (hash chunk + offset)
  | "reveal_move" // amount = 1-20
  | "reveal_nonce1" // amount = 21 to 65556
  | "reveal_nonce2" // amount = 21 to 65556
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
