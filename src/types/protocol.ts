export interface CommitData {
  move: number;          // 1-20
  noncePart1: bigint;    // Felt-sized random nonce
  noncePart2: bigint;    // Felt-sized random nonce
  commitWord: bigint[];  // 4 Felts — RPO hash
}

export interface RevealData {
  move: number;          // 1-20
  noncePart1: bigint;
  noncePart2: bigint;
}

export type NoteSignalType =
  | "join"        // amount = 100
  | "accept"      // amount = 101
  | "draft_pick"; // amount = 1-10 (championId + 1)

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
