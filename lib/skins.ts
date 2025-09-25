export interface BoardSkinDef {
  id: string;
  name: string;
  priceEuros: number;
  cssClass: string; // class to apply to squares/board
}

export const BOARD_SKINS: BoardSkinDef[] = [
  { id: 'emerald-core', name: 'Emerald Core', priceEuros: 5, cssClass: 'skin-emerald' },
  { id: 'nebula-blue', name: 'Nebula Blue', priceEuros: 5, cssClass: 'skin-nebula' },
  { id: 'crimson-flare', name: 'Crimson Flare', priceEuros: 5, cssClass: 'skin-crimson' },
  { id: 'mono-steel', name: 'Mono Steel', priceEuros: 5, cssClass: 'skin-steel' },
  { id: 'violet-arc', name: 'Violet Arc', priceEuros: 5, cssClass: 'skin-violet' },
];

export function getBoardSkin(id: string | null | undefined) {
  return BOARD_SKINS.find(s => s.id === id);
}