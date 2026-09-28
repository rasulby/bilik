import { escape } from "./text.js";
import { icon } from "./icons.js";
export const OPTION_LABELS = ["A", "B", "C", "D", "E"];

export function quizPlayer({
  question,
  index,
  total,
  enabled,
  selectedOption,
  result,
  pending,
  ordinal,
}) {
  return `<div class="quiz-player">
    <span>Sual ${index + 1} / ${total}</span>
    <h2>${escape(question.question)}</h2>
    <p class="quiz-instruction">Bir variant seçin. Cavabınız dərhal göndəriləcək.</p>
    <div class="quiz-options" aria-label="Cavab variantları" aria-busy="${pending}">
      ${question.options
        .map((option, index) => {
          const letter = OPTION_LABELS[index],
            selected = letter === selectedOption;
          return `<button type="button" class="quiz-option ${selected ? "is-selected" : ""}"
          data-option="${letter}" aria-pressed="${selected}" ${enabled ? "" : "disabled"}>
          <span class="option-letter">${letter}</span><span class="option-text">${escape(option)}</span>
          ${selected ? `<span class="option-selected" aria-label="Seçiminiz">${icon("shield")}</span>` : ""}
        </button>`;
        })
        .join("")}
    </div>
    ${result ? `<div class="quiz-confirmation" role="status"><span class="submission-position">${result.position}</span><div><h3>Cavabınız qeydə alındı</h3><p>Siz ${ordinal(result.position)} cavab verdiniz</p></div></div><p class="quiz-after-note">Növbəti sualı gözləyin.</p>` : pending ? '<p class="quiz-pending" role="status">Cavabınız göndərilir…</p>' : ""}
  </div>`;
}

export function adminQuestionOptions(question) {
  return `<div class="admin-options">${question.options.map((option, index) => `<div class="admin-option ${index === question.correctOption ? "is-correct" : ""}"><b>${OPTION_LABELS[index]}</b><span>${escape(option)}</span>${index === question.correctOption ? "<small>Düzgün cavab</small>" : ""}</div>`).join("")}</div>`;
}

export function questionLibrary(questions) {
  return `<section class="panel"><div class="panel-heading"><div><h2>Suallar <span class="count-chip">${questions.length}</span></h2><p>Yeni suallar növbəti Sürətli sual oyununda istifadə ediləcək.</p></div></div>
    <div class="question-forms">
      <form id="add-question"><h3>Sual əlavə et</h3>
        <label for="question">Sual</label><input id="question" name="question" maxlength="500" placeholder="Sualınızı yazın" required>
        ${OPTION_LABELS.map((letter) => `<label for="option-${letter}">Variant ${letter}</label><input id="option-${letter}" name="option-${letter}" maxlength="200" placeholder="${letter} variantını yazın" required>`).join("")}
        <label for="correct-option">Düzgün cavab</label><select id="correct-option" name="correctOption">${OPTION_LABELS.map((letter, index) => `<option value="${index}">${letter}</option>`).join("")}</select>
        <button class="button primary">${icon("plus")} Sual əlavə et</button>
      </form>
      <form id="import-questions"><h3>Toplu sual əlavə et</h3>
        <label for="import">Hər sətirdə: Sual|A|B|C|D|E|DüzgünVariant</label>
        <textarea id="import" name="rows" rows="8" maxlength="90000" placeholder="Azərbaycanın paytaxtı hansıdır?|Bakı|Gəncə|Şəki|Quba|Lənkəran|A&#10;2 + 2 neçə edir?|3|4|5|6|8|B" required></textarea>
        <p class="import-hint">Hər sual üçün düz 5 variant daxil edin. Son sütunda düzgün variantı A, B, C, D və ya E ilə göstərin. Bütün sətirlər yoxlandıqdan sonra suallar birlikdə saxlanılır.</p>
        <button class="button">${icon("book")} Sualları idxal et</button>
      </form>
    </div>
    <div class="question-list">${questions.map((q, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><div class="library-question"><strong>${escape(q.question)}</strong>${adminQuestionOptions(q)}</div></div>`).join("")}</div>
  </section>`;
}
