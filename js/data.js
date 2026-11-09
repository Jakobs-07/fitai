// Kategorijos. "slot" nurodo, kur rūbas atsiduria outfite (iš viršaus į apačią).
export const SLOTS = {
  head: { order: 0, label: 'Galva' },
  outer: { order: 1, label: 'Viršutinis' },
  top: { order: 2, label: 'Viršus' },
  onepiece: { order: 3, label: 'Suknelė' },
  bottom: { order: 4, label: 'Apačia' },
  legwear: { order: 5, label: 'Kojinės' },
  shoes: { order: 6, label: 'Batai' },
  side: { order: 7, label: 'Aksesuarai' },
};

export const GROUPS = [
  { id: 'main', label: 'Pagrindinės', emoji: '👚' },
  { id: 'outer', label: 'Viršutiniai ir batai', emoji: '🧥' },
  { id: 'sport', label: 'Sportiniai', emoji: '🏃‍♀️' },
  { id: 'under', label: 'Apatiniai', emoji: '🧦' },
  { id: 'acc', label: 'Aksesuarai', emoji: '👜' },
  { id: 'custom', label: 'Mano kategorijos', emoji: '✨' },
];

export const DEFAULT_CATEGORIES = [
  { id: 'tshirts', label: 'Maikutės', group: 'main', slot: 'top', emoji: '👕' },
  { id: 'blouses', label: 'Palaidinės', group: 'main', slot: 'top', emoji: '👚' },
  { id: 'sweaters', label: 'Megztiniai', group: 'main', slot: 'top', emoji: '🧶' },
  { id: 'pants', label: 'Kelnės', group: 'main', slot: 'bottom', emoji: '👖' },
  { id: 'shorts', label: 'Šortai', group: 'main', slot: 'bottom', emoji: '🩳' },
  { id: 'skirts', label: 'Sijonai', group: 'main', slot: 'bottom', emoji: '🌸' },
  { id: 'dresses', label: 'Suknelės', group: 'main', slot: 'onepiece', emoji: '👗' },
  { id: 'jackets', label: 'Striukės', group: 'outer', slot: 'outer', emoji: '🧥' },
  { id: 'coats', label: 'Paltai', group: 'outer', slot: 'outer', emoji: '🧥' },
  { id: 'blazers', label: 'Švarkai', group: 'outer', slot: 'outer', emoji: '🥼' },
  { id: 'shoes', label: 'Batai', group: 'outer', slot: 'shoes', emoji: '👟' },
  { id: 'sport_top', label: 'Sportiniai viršutiniai', group: 'sport', slot: 'top', emoji: '🎽' },
  { id: 'sport_bottom', label: 'Sportinės apačios', group: 'sport', slot: 'bottom', emoji: '🩱' },
  { id: 'socks', label: 'Kojinės', group: 'under', slot: 'legwear', emoji: '🧦' },
  { id: 'tights', label: 'Pėdkelnės', group: 'under', slot: 'legwear', emoji: '🦵' },
  { id: 'bags', label: 'Rankinės', group: 'acc', slot: 'side', emoji: '👜' },
  { id: 'jewelry', label: 'Papuošalai', group: 'acc', slot: 'side', emoji: '💍' },
  { id: 'hats', label: 'Kepurės', group: 'acc', slot: 'head', emoji: '👒' },
  { id: 'scarves', label: 'Šalikai', group: 'acc', slot: 'side', emoji: '🧣' },
  { id: 'glasses', label: 'Akiniai', group: 'acc', slot: 'head', emoji: '🕶️' },
];

export const SEASONS = ['Pavasaris', 'Vasara', 'Ruduo', 'Žiema'];
export const OCCASIONS = ['Kasdien', 'Darbas', 'Vakarėlis', 'Pasimatymas', 'Sportas', 'Namie', 'Šventė', 'Kelionė'];

export const VIBE_IDEAS = [
  'Sekmadienio kava',
  'Pasimatymas vakare',
  'Darbo susitikimas',
  'Pasivaikščiojimas parke',
  'Vakarėlis su draugėmis',
  'Patogiai, bet stilingai',
];
