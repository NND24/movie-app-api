// Text for accent- and punctuation-insensitive search: "Ông trùm McLintock!" -> "ong trum mclintock".
export const searchKey = (t = "") =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
