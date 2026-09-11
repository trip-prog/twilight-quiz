export function createGame(questions, saved) {
  const game = { questions, index: 0, answers: [], score: 0, finished: false };
  if (!saved || !Array.isArray(saved.ids) || saved.ids.join('|') !== questions.map(q => q.id).join('|')) return game;
  if (!Array.isArray(saved.answers) || saved.answers.length > questions.length || !Number.isInteger(saved.index) || saved.index < 0 || saved.index >= questions.length || typeof saved.finished !== 'boolean') return game;
  if (![saved.index, saved.index + 1].includes(saved.answers.length) || (saved.finished && (saved.index !== questions.length - 1 || saved.answers.length !== questions.length))) return game;
  for (const [i, choice] of saved.answers.entries()) {
    if (!Number.isInteger(choice) || choice < 0 || choice >= questions[i].options.length) return game;
  }
  game.index = saved.index;
  game.answers = [...saved.answers];
  game.score = saved.answers.reduce((score, choice, i) => score + Number(choice === questions[i].correct), 0);
  game.finished = saved.finished;
  return game;
}

export function snapshot(game) {
  return { ids: game.questions.map(q => q.id), index: game.index, answers: [...game.answers], finished: game.finished };
}

export function answer(game, choice) {
  if (game.finished || game.answers[game.index] !== undefined || !Number.isInteger(choice) || choice < 0 || choice >= game.questions[game.index].options.length) return false;
  game.answers[game.index] = choice;
  if (choice === game.questions[game.index].correct) game.score++;
  return true;
}

export function advance(game) {
  if (game.finished || game.answers[game.index] === undefined) return false;
  if (game.index === game.questions.length - 1) game.finished = true;
  else game.index++;
  return true;
}
