import { sha256, stableStringify } from "@/lib/util/ids";

export type FactUnit = "IDR" | "%" | "x" | "volume" | "price" | "date" | "text" | "count" | "ratio";

export type Fact = {
  id: string;
  label: string;
  key: string;
  valueNum?: number;
  valueText?: string;
  unit?: FactUnit;
  asOf: string;
  endpoint: string;
  args: Record<string, unknown>;
  hitId?: string;
};

export function makeFact(input: Omit<Fact, "id">): Fact {
  const id = sha256(
    [input.endpoint, stableStringify(input.args), input.key, input.asOf].join("|"),
  ).slice(0, 20);
  return { id, ...input };
}

export function factByRef(facts: Fact[], ref: string): Fact | undefined {
  return facts.find((f) => f.id === ref);
}