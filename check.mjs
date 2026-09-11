// One check for quiz data, media and the complete game. Run: node check.mjs
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGame, answer, advance, snapshot } from './game.mjs';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));
const questions = JSON.parse(readFileSync('questions.json', 'utf8'));
assert.equal(questions.length, 150);
assert.equal(new Set(questions.map(q => q.id)).size, 150);
assert.equal(new Set(questions.map(q => q.prompt)).size, 150);
for (const film of [1, 2, 3, 4, 5]) {
  assert.equal(questions.filter(q => q.film === film).length, 30);
  for (const type of ['memory', 'scene']) assert.equal(questions.filter(q => q.film === film && q.type === type).length, 15);
}

const expectedMedia = new Set(['cover.jpg', ...[1, 2, 3, 4, 5].map(f => `film-${f}.jpg`), 'golos.ttf', 'FONT-LICENSE.txt']);
for (const film of [1, 2, 3, 4, 5]) {
  const path = 'portraits/film-' + film + '.webp';
  const data = readFileSync('media/' + path);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', path);
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', path);
  assert(data.length > 1000 && data.length < 1500000, path);
  expectedMedia.add(path);
}
let clipCount = 0;
for (const q of questions) {
  assert.match(q.id, /^[a-z0-9-]+$/);
  assert(['memory', 'scene'].includes(q.type));
  assert(q.prompt && q.explanation && q.evidence, q.id);
  assert.equal(q.options.length, 4, q.id);
  assert.equal(new Set(q.options).size, 4, q.id);
  assert(q.options.every(option => typeof option === 'string' && option.trim()), q.id);
  assert(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, q.id);
  assert([1, 2, 3, 4, 5].includes(q.film), q.id);
  assert(q.source.filmTitle, q.id);
  assert.equal(q.source.year, 2007 + q.film, q.id);
  assert.equal(new URL(q.source.url).protocol, 'https:');
  assert.equal(q.poster, `./media/${q.id}.jpg`);
  assert(statSync(q.poster).size > 1000);
  expectedMedia.add(`${q.id}.jpg`);
  const ranges = [[q.video, q.source.start, q.source.end]];
  assert.equal(q.video, `./media/${q.id}.mp4`);
  if (q.type === 'scene') {
    assert.equal(q.intro, `./media/${q.id}-intro.mp4`);
    assert(q.intro !== q.video);
    assert(Number.isFinite(q.source.revealStart), q.id);
    assert(q.source.start <= q.source.revealStart && q.source.revealStart < q.source.end, q.id);
    assert(q.source.introEnd <= q.source.revealStart, 'Introduction must stop before the answer: ' + q.id);
    ranges.push([q.intro, q.source.introStart, q.source.introEnd]);
  } else assert.equal(q.intro, undefined, q.id);
  for (const [path, start, end] of ranges) {
    assert(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start, path);
    expectedMedia.add(path.replace('./media/', ''));
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
    const v = info.streams.find(s => s.codec_type === 'video');
    const a = info.streams.find(s => s.codec_type === 'audio');
    assert.equal(v?.codec_name, 'h264', path);
    assert.equal(v.pix_fmt, 'yuv420p', path);
    assert(v.width <= 1280 && v.height <= 720, path);
    assert.equal(a?.codec_name, 'aac', path);
    assert(Math.abs(Number(info.format.duration) - (end - start)) < 0.16, path);
    const data = readFileSync(path), atoms = [];
    for (let offset = 0; offset + 8 <= data.length;) {
      const size = data.readUInt32BE(offset);
      atoms.push(data.toString('ascii', offset + 4, offset + 8));
      if (size < 8) break;
      offset += size;
    }
    assert(atoms.indexOf('moov') >= 0 && atoms.indexOf('moov') < atoms.indexOf('mdat'), `faststart: ${path}`);
    assert(data.length < 100 * 1024 * 1024, path);
    clipCount++;
  }
}
assert.equal(clipCount, 225);
const mediaFiles = readdirSync('media', { recursive: true }).filter(name => statSync('media/' + name).isFile()).map(name => name.replaceAll('\\', '/'));
assert.deepEqual(new Set(mediaFiles), expectedMedia, 'Missing or unused media');
const bytes = [...expectedMedia].reduce((sum, name) => sum + statSync(`media/${name}`).size, 0);
assert(bytes < 900 * 1024 * 1024, 'Site media budget exceeded');

for (const film of [1, 2, 3, 4, 5]) for (const mode of ['correct', 'wrong', 'mixed']) {
  const items = questions.filter(q => q.film === film);
  let game = createGame(items);
  for (const [index, q] of items.entries()) {
    assert.equal(game.index, index);
    assert.equal(advance(game), false, 'Cannot skip an unanswered question');
    for (const invalid of [-1, 4, 1.5, '0', null]) assert.equal(answer(game, invalid), false);
    const choice = mode === 'correct' || (mode === 'mixed' && index % 2 === 0) ? q.correct : (q.correct + 1) % 4;
    assert.equal(answer(game, choice), true);
    const score = game.score;
    assert.equal(answer(game, q.correct), false, 'A second answer must not count');
    assert.equal(game.score, score);
    assert.equal(game.answers[index], choice);
    game = createGame(items, JSON.parse(JSON.stringify(snapshot(game))));
    assert.equal(game.score, score, 'Restore must recompute the same score');
    assert.equal(answer(game, q.correct), false, 'Restore must preserve the answer lock');
    assert.equal(advance(game), true);
    game = createGame(items, snapshot(game));
  }
  assert.equal(game.score, mode === 'correct' ? 30 : mode === 'wrong' ? 0 : 15);
  assert.equal(game.finished, true);
  assert.equal(answer(game, 0), false);
  assert.equal(advance(game), false);
}
const items = questions.filter(q => q.film === 1);
const fresh = createGame(items);
assert.equal(fresh.score, 0);
assert.equal(fresh.index, 0);
assert.equal(fresh.answers.length, 0);
const saved = snapshot(fresh);
for (const bad of [null, {}, { ...saved, ids: [] }, { ...saved, index: 30 }, { ...saved, index: -1 }, { ...saved, index: 1.2 }, { ...saved, finished: true }, { ...saved, answers: [9] }, { ...saved, answers: ['0'] }, { ...saved, answers: [null] }, { ...saved, answers: [0, 1] }]) {
  assert.deepEqual(createGame(items, bad), fresh, 'Invalid or stale saves must restart safely');
}
const isolated = createGame(questions.filter(q => q.film === 2), saved);
assert.equal(isolated.answers.length, 0, 'Progress belongs to one film');
answer(fresh, items[0].correct);
const completedAnswer = snapshot(fresh);
assert.equal(createGame(items, { ...completedAnswer, score: 999 }).score, 1, 'Saved score is not trusted');
fresh.answers[0] = (items[0].correct + 1) % 4;
assert.equal(completedAnswer.answers[0], items[0].correct, 'Snapshots must not share mutable answers');
console.log(`OK: 5 × 30 questions, 75 memory + 75 scene, ${clipCount} H.264/AAC clips, ${(bytes / 1024 / 1024).toFixed(1)} MiB; full games, saved progress, answer lock, invalid saves, film isolation, restart.`);
