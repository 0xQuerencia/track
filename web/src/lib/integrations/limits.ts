/** Limits shared by server and client code. Kept out of "use server" modules, which may export only functions. */

/** Largest pasted document. Server actions have a 1 MB body limit by default. */
export const MAX_PASTE_CHARACTERS = 900_000;
