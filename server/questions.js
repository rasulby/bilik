import fs from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const OPTION_LABELS = ["A", "B", "C", "D", "E"];
export const seeds = [
  [
    "Azərbaycanın paytaxtı hansıdır?",
    ["Bakı", "Gəncə", "Şəki", "Quba", "Lənkəran"],
    0,
  ],
  [
    "Dünyanın ən böyük okeanı hansıdır?",
    [
      "Atlantik okeanı",
      "Hind okeanı",
      "Sakit okean",
      "Şimal Buzlu okeanı",
      "Cənub okeanı",
    ],
    2,
  ],
  ["2 + 2 neçə edir?", ["3", "4", "5", "6", "8"], 1],
  [
    "Günəş sistemində ən böyük planet hansıdır?",
    ["Yer", "Mars", "Venera", "Yupiter", "Saturn"],
    3,
  ],
  ["Bir həftədə neçə gün var?", ["5", "6", "8", "10", "7"], 4],
  [
    "Fransanın paytaxtı hansıdır?",
    ["Berlin", "Madrid", "Paris", "Roma", "Vyana"],
    2,
  ],
  ["Suyun kimyəvi formulu nədir?", ["CO2", "O2", "NaCl", "H2O", "H2"], 3],
  ["Bir ildə neçə ay var?", ["10", "12", "11", "13", "14"], 1],
  [
    "Yer kürəsinin təbii peyki hansıdır?",
    ["Günəş", "Mars", "Venera", "Yupiter", "Ay"],
    4,
  ],
  ["Azərbaycan bayrağında neçə rəng var?", ["3", "2", "4", "5", "6"], 0],
].map(([question, options, correctOption]) => ({
  id: randomUUID(),
  question,
  options,
  correctOption,
}));

function validateQuestion(row) {
  if (
    !row ||
    typeof row.question !== "string" ||
    !row.question.trim() ||
    row.question.length > 500
  )
    throw Error("Sual 1–500 simvol olmalıdır.");
  if (
    !Array.isArray(row.options) ||
    row.options.length !== 5 ||
    Array.from(row.options).some(
      (option) =>
        typeof option !== "string" || !option.trim() || option.length > 200,
    )
  )
    throw Error("Hər sualın 1–200 simvoldan ibarət düz 5 variantı olmalıdır.");
  if (
    !Number.isInteger(row.correctOption) ||
    row.correctOption < 0 ||
    row.correctOption > 4
  )
    throw Error("Düzgün cavab A, B, C, D və ya E olmalıdır.");
  return {
    question: row.question.trim(),
    options: row.options.map((option) => option.trim()),
    correctOption: row.correctOption,
  };
}

export function parseQuestionBatch(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 90000)
    throw Error("İdxal üçün sualları daxil edin (ən çox 90 000 simvol).");
  const rows = text.trim().split(/\r?\n/);
  if (rows.length > 100) throw Error("Bir dəfəyə ən çox 100 sual idxal edin.");
  return rows.map((line, index) => {
    const fields = line.split("|").map((value) => value.trim());
    if (fields.length !== 7 || !OPTION_LABELS.includes(fields[6]))
      throw Error(
        `${index + 1}-ci sətir: Sual|A|B|C|D|E|DüzgünVariant formatından istifadə edin.`,
      );
    try {
      return validateQuestion({
        question: fields[0],
        options: fields.slice(1, 6),
        correctOption: OPTION_LABELS.indexOf(fields[6]),
      });
    } catch (error) {
      throw Error(`${index + 1}-ci sətir: ${error.message}`);
    }
  });
}

export class QuestionStore {
  constructor(file) {
    this.file = file;
    if (!file || !fs.existsSync(file)) {
      this.items = structuredClone(seeds);
      return;
    }
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
      throw Error("Sual faylı etibarlı siyahı olmalıdır.");
    // Never silently discard or invent options for an existing text-answer bank.
    if (rows.some((row) => row && typeof row.text === "string" && !row.options))
      throw Error(
        "Köhnə sual formatı aşkarlandı. Faylı qoruyaraq hər suala 5 variant və correctOption əlavə edin. README.md faylına baxın.",
      );
    this.items = rows.map((row) => {
      const fields = validateQuestion(row);
      if (typeof row.id !== "string" || !row.id || row.id.length > 100)
        throw Error("Sual kimliyi yanlışdır.");
      return { id: row.id, ...fields };
    });
    if (new Set(this.items.map((row) => row.id)).size !== this.items.length)
      throw Error("Sual kimlikləri təkrarlanmamalıdır.");
  }
  add(rows) {
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.length > 100 ||
      this.items.length + rows.length > 1000
    )
      throw Error("1–100 sual daxil edin. Ümumi limit: 1000.");
    const additions = Array.from(rows, (row) => ({
      id: randomUUID(),
      ...validateQuestion(row),
    }));
    const next = [...this.items, ...additions];
    if (this.file) {
      fs.mkdirSync(dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2));
      fs.renameSync(`${this.file}.tmp`, this.file);
    }
    this.items = next;
  }
  import(text) {
    this.add(parseQuestionBatch(text));
  }
}
