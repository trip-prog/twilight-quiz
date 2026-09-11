import { createGame, answer, advance, snapshot } from './game.mjs';

const $ = id => document.getElementById(id);
const video = $('video');
let questions, game, activeFilm = null;
const games = new Map();
const storageKey = 'twilight-progress-v1';
const letters = ['А', 'Б', 'В', 'Г'];
const chapters = ['I', 'II', 'III', 'IV', 'V'];

function showSection(id) {
  for (const section of ['welcome', 'quiz', 'result']) $(section).hidden = section !== id;
  $('back').hidden = id === 'welcome';
}

function stopVideo() {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  $('video-error').hidden = true;
}

function showVideo(path, poster) {
  $('memory-cover').hidden = true;
  $('video-error').hidden = true;
  video.poster = poster || './media/cover.jpg';
  video.src = `${path}?v=3`;
  video.hidden = false;
  video.load();
}

function updateProgress(completed) {
  $('progress-fill').style.width = `${completed / questions.length * 100}%`;
  $('progress').setAttribute('aria-valuenow', completed);
}

function renderQuestion(scrollToQuestion = false) {
  stopVideo();
  const q = questions[game.index];
  $('question-number').textContent = String(game.index + 1).padStart(2, '0');
  $('score').textContent = game.score;
  updateProgress(game.answers.length);
  $('question-title').textContent = q.prompt;
  $('answers').replaceChildren();
  q.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.className = 'answer';
    const letter = document.createElement('span');
    letter.className = 'answer-letter';
    letter.textContent = letters[index];
    letter.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'answer-label';
    label.textContent = option;
    button.append(letter, label);
    button.addEventListener('click', () => choose(index));
    $('answers').append(button);
  });
  $('feedback').hidden = true;
  $('next').hidden = true;
  $('source-caption').hidden = true;
  if (q.type === 'scene') {
    showVideo(q.intro, q.poster);
  } else {
    $('memory-cover').src = `./media/film-${activeFilm}.jpg`;
    $('memory-cover').hidden = false;
  }
  if (game.answers[game.index] !== undefined) renderAnswer(game.answers[game.index]);
  $('question-title').focus({ preventScroll: true });
  if (scrollToQuestion) $('game-content').scrollIntoView({ block: 'start', behavior: 'instant' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function choose(choice) {
  if (!answer(game, choice)) return;
  save();
  renderAnswer(choice);
}

function renderAnswer(choice) {
  const q = questions[game.index];
  const correct = choice === q.correct;
  [...$('answers').children].forEach((button, index) => {
    button.disabled = true;
    if (index === q.correct || index === choice) {
      button.classList.add(index === q.correct ? 'correct' : 'wrong');
      const mark = document.createElement('span');
      mark.className = 'answer-mark';
      mark.textContent = index === q.correct ? '✓' : '×';
      mark.setAttribute('aria-hidden', 'true');
      button.append(mark);
      button.setAttribute('aria-label', `${q.options[index]} — ${index === q.correct ? 'правильный ответ' : 'твой ответ, неверно'}`);
    }
  });
  $('score').textContent = game.score;
  updateProgress(game.index + 1);
  $('feedback').classList.toggle('is-wrong', !correct);
  $('explanation').textContent = q.explanation;
  $('feedback').hidden = false;
  showVideo(q.video, q.poster);
  $('source-caption').replaceChildren();
  const source = document.createElement('a');
  source.href = q.source.url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = `${q.source.filmTitle} · ${q.source.year}`;
  $('source-caption').append(source);
  $('source-caption').hidden = false;
  $('next').textContent = game.index === questions.length - 1 ? 'Посмотреть результат ♡' : 'Следующий вопрос →';
  $('next').hidden = false;
}

function renderResult() {
  stopVideo();
  showSection('result');
  $('final-score').textContent = game.score;
  $('result-film').textContent = questions[0].source.filmTitle;
  $('result-photo').src = './media/portraits/film-' + activeFilm + '.webp';
  $('result-total').textContent = questions.length;
  $('result-title').textContent = game.score === questions.length
    ? 'Ты помнишь каждую минуту!'
    : game.score >= questions.length * .8
      ? 'Тебя бы приняли в семью Калленов!'
      : game.score >= questions.length * .5
        ? 'Ты хорошо помнишь эту историю!'
        : 'Есть повод пересмотреть ♡';
  $('result-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ active: activeFilm, films: Object.fromEntries([...games].map(([film, state]) => [film, snapshot(state)])) }));
    $('storage-error').hidden = true;
  } catch { $('storage-error').hidden = false; }
}

function start(film) {
  if (!games.has(film)) return;
  activeFilm = film;
  game = games.get(film);
  questions = game.questions;
  $('film-title').textContent = questions[0].source.filmTitle;
  document.body.dataset.film = film;
  $('chapter-number').textContent = chapters[film - 1];
  $('chapter-photo').src = './media/portraits/film-' + film + '.webp';
  $('question-total').textContent = questions.length;
  $('progress').setAttribute('aria-valuemax', questions.length);
  save();
  if (game.finished) return renderResult();
  showSection('quiz');
  renderQuestion();
}

function showFilms() {
  if (!games.size) return;
  stopVideo();
  activeFilm = null;
  delete document.body.dataset.film;
  save();
  $('films').replaceChildren();
  for (const [film, state] of games) {
    const button = document.createElement('button');
    button.className = 'film-card';
    const cover = document.createElement('img');
    cover.src = './media/portraits/film-' + film + '.webp';
    cover.alt = '';
    cover.width = 1152;
    cover.height = 1536;
    const body = document.createElement('span');
    body.className = 'film-card-body';
    const title = document.createElement('strong');
    title.textContent = state.questions[0].source.filmTitle;
    const name = document.createElement('span');
    name.className = 'film-name';
    const order = document.createElement('span');
    order.className = 'film-order';
    order.textContent = chapters[film - 1];
    order.setAttribute('aria-hidden', 'true');
    name.append(order, title);
    const progress = document.createElement('span');
    progress.className = 'film-progress';
    progress.textContent = state.finished ? `${state.score} из ${state.questions.length} верно` : state.answers.length ? `${state.answers.length} из ${state.questions.length} · ${state.score} верно` : `${state.questions.length} вопросов`;
    const action = document.createElement('span');
    action.className = 'film-action';
    action.textContent = state.finished ? 'Результат' : state.answers.length ? 'Продолжить' : 'Начать';
    body.append(name, progress, action);
    button.append(cover, body);
    button.addEventListener('click', () => start(film));
    $('films').append(button);
  }
  showSection('welcome');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$('restart').addEventListener('click', () => {
  games.set(activeFilm, createGame(questions));
  start(activeFilm);
});
$('back').addEventListener('click', showFilms);
$('choose-film').addEventListener('click', showFilms);
document.querySelector('.wordmark').addEventListener('click', event => { event.preventDefault(); showFilms(); });
$('next').addEventListener('click', () => {
  if (!advance(game)) return;
  save();
  if (game.finished) renderResult();
  else renderQuestion(true);
});
$('retry-video').addEventListener('click', () => {
  $('video-error').hidden = true;
  video.load();
  video.play().catch(() => { $('video-error').hidden = false; });
});
video.addEventListener('error', () => { if (video.getAttribute('src')) $('video-error').hidden = false; });
video.addEventListener('playing', () => { $('video-error').hidden = true; });
window.addEventListener('pagehide', () => video.pause());

try {
  const response = await fetch('./questions.json?v=3');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) throw new Error('Вопросы не найдены');
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); }
  catch { $('storage-error').hidden = false; }
  for (const film of [1, 2, 3, 4, 5]) {
    const items = data.filter(q => q.film === film);
    if (items.length) games.set(film, createGame(items, saved?.films?.[film]));
  }
  if (games.has(saved?.active)) start(saved.active);
  else showFilms();
} catch {
  $('load-status').hidden = false;
  $('load-status').replaceChildren(document.createTextNode('Не удалось загрузить вопросы. '));
  const retry = document.createElement('button');
  retry.className = 'text-button';
  retry.textContent = 'Обновить страницу';
  retry.addEventListener('click', () => location.reload());
  $('load-status').append(retry);
}
