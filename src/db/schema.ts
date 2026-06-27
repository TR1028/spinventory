export type RubberSide = "forehand" | "backhand";

export type Racket = {
  id: string;
  name: string;
  blade: string;
  forehandRubberId: string;
  backhandRubberId: string;
  sortOrder?: number;
  createdAt: string;
};

export type Rubber = {
  id: string;
  racketId: string;
  side: RubberSide;
  name: string;
  hardness?: string;
  thicknessMm?: number;
  installedAt: string;
  removedAt?: string;
  boosted: boolean;
  createdAt: string;
};

export type BoostingLog = {
  id: string;
  rubberId: string;
  date: string;
  boostNumber: number;
  layers: number;
  notes?: string;
  createdAt: string;
};

export type PlaySession = {
  id: string;
  racketId: string;
  date: string;
  durationMinutes: number;
  createdAt: string;
};

export type MetaRecord = {
  key: string;
  value: string;
};

export const rubberSideLabel: Record<RubberSide, string> = {
  forehand: "FH",
  backhand: "BH",
};
