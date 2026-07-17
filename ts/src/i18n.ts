export const LANGUAGE_CODE_LENGTH = 2;

export interface LanguageStrings {
  bestScore: string;
  bestTxt: string;
  btnContinue: string;
  btnPlay: string;
  btnSelect: string;
  defaultPlayerName: string;
  extraLife: string;
  killText: string;
  menu: string;
  messages: string[];
  newText: string;
  nosupport: string;
  placeholderText: string;
  playAgain: string;
  playersKilled: string;
  timePlayed: string;
  yourScore: string;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Language {
  lng: LanguageStrings;
  name: string;
}
export const russianLanguage: Language = {
  lng: {
    bestScore: 'ЛУЧШИЙ РЕЗУЛЬТАТ',
    bestTxt: 'ЛУЧШИЙ',
    btnContinue: 'ПРОДОЛЖИТЬ',
    btnPlay: 'ИГРАТЬ',
    btnSelect: 'ВЫБРАТЬ',
    defaultPlayerName: 'Игрок',
    extraLife: 'ДОПОЛНИТЕЛЬНАЯ ЖИЗНЬ!',
    killText: 'Убит',
    menu: 'МЕНЮ',
    messages: ['Не знаете как играть?', 'Коснитесь экрана для управления', 'Пересекайте хвосты противников и не позволяйте им пересечь свой!', 'Захватите всю карту'],
    newText: 'НОВЫЙ',
    nosupport: 'Игра не поддерживается на вашем браузере',
    placeholderText: 'Ваше имя',
    playAgain: 'ИГРАТЬ СНОВА',
    playersKilled: 'УБИТО',
    timePlayed: 'ДЛИТЕЛЬНОСТЬ',
    yourScore: 'ВАШ РЕЗУЛЬТАТ'
  },
  name: 'ru'
};

export type LanguagesData = Record<string, Partial<LanguageStrings>>;
export const list3: Language[] = [];
export function buildLanguageList(languagesData: LanguagesData): void {
  const {
    en
  } = languagesData;
  Object.keys(languagesData).forEach((languageName) => {
    const languageStrings = languagesData[languageName];
    list3.push({
      lng: ({ ...(en ?? {}), ...(languageStrings ?? {}) }) as LanguageStrings,
      name: languageName
    });
  });
}
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-optional-chain -- defensive navigator.languages feature-detection for old browsers (lib.dom types it as always-present), and an empty-string language code must fall through to the next candidate, so `||` (falsy fallback) is intentional.
export const browserLanguageCode = ((navigator.languages && navigator.languages.length && navigator.languages[0]) || navigator.userLanguage || navigator.language || navigator.browserLanguage || 'en').slice(0, LANGUAGE_CODE_LENGTH).toLowerCase();
export function findDefaultLanguage(): Language | undefined {
  return list3.find((language: Language) => language.name === browserLanguageCode) ?? list3.find((language: Language) => language.name === 'en');
}
