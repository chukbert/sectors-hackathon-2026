"use client";

import { createContext, useContext } from "react";

export type CiteInfo = {
  numbers: Map<string, number>;
  audit: boolean;
};

const DEFAULT: CiteInfo = { numbers: new Map(), audit: false };

export const CiteContext = createContext<CiteInfo>(DEFAULT);

export function useCite(): CiteInfo {
  return useContext(CiteContext);
}

export function citeNo(id: string, info: CiteInfo): number | undefined {
  return info.numbers.get(id);
}
