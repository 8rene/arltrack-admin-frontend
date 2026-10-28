// Government ID types. Same list, same wording as the customer signup form (customer frontend,
// SignUpModal.jsx GOV_ID_TYPES), so a document type saved from the admin app reads exactly like one saved at signup.
export const GOV_ID_TYPES = [
  "Philippine National ID (PhilSys)",
  "UMID",
  "SSS ID",
  "GSIS ID",
  "Voter's ID",
  "PRC ID",
  "Postal ID",
  "Senior Citizen ID",
  "OFW ID",
  "Passport",
  "TIN ID",
  "Pag-IBIG ID",
  "Barangay ID",
  "PWD ID",
];

// Options for a <select>: the list, plus the value already saved when it is not one of them (typed freely before this
// list was shared), so opening and saving never silently drops it.
export const govIdTypeOptions = (current) =>
  current && !GOV_ID_TYPES.includes(current) ? [current, ...GOV_ID_TYPES] : GOV_ID_TYPES;