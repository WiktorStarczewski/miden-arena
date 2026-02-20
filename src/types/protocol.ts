export interface CommitData {
  move: number; // 1-20
  nonce: Uint8Array; // 4 bytes
  part1: bigint; // 16-bit hash chunk + 1 (max 65536)
  part2: bigint; // 16-bit hash chunk + 1 (max 65536)
}

export interface RevealData {
  move: number; // 1-20
  noncePart1: bigint; // raw first 2 bytes of nonce (max 65535)
  noncePart2: bigint; // raw last 2 bytes of nonce (max 65535)
}

export type NoteSignalType =
  | "join" // amount = 100
  | "accept" // amount = 101
  | "draft_pick" // amount = 1-10 (championId + 1)
  | "commit" // attachment: [MSG_TYPE_COMMIT, hashPart1, hashPart2]
  | "reveal" // attachment: [MSG_TYPE_REVEAL, move, noncePart1, noncePart2]
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
