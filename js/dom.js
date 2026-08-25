export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
