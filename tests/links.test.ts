import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCrossVaultLinks, findCrossVaultTarget, formatCrossVaultLink, linkAt, maskCode, parseCrossVaultRef
} from '../src/links/link-parser';
import { decideClick, sourceVaultUri } from '../src/links/link-actions';
import {
  buildInsertion, detectTrigger, linkNameFor, scoreMatch, suggestHeadings, suggestNotes, targetForTrigger
} from '../src/links/link-suggest-core';
import { embedDepth, extractSection, MAX_EMBED_DEPTH } from '../src/links/embed-renderer';
import { IndexedFile } from '../src/types';

function f(vaultName: string, rel: string, over: Partial<IndexedFile> = {}): IndexedFile {
  return {
    id: `${vaultName}:${rel}`, vaultId: vaultName.toLowerCase(), vaultName, absolutePath: `/x/${vaultName}/${rel}`,
    relativePath: rel, basename: (rel.split('/').pop() ?? rel).replace(/\.md$/, ''), extension: '.md', mtime: 1, size: 1, ...over
  };
}

// ---- link parser ------------------------------------------------------------------

test('parseCrossVaultRef: vault, note, heading and alias; plain wikilinks are not touched', () => {
  assert.deepEqual(parseCrossVaultRef('B::Note'), { vaultName: 'B', noteName: 'Note' });
  assert.deepEqual(parseCrossVaultRef('B::Note#Intro|shown'), { vaultName: 'B', noteName: 'Note', heading: 'Intro', alias: 'shown' });
  assert.deepEqual(parseCrossVaultRef('My Vault::dir/Sub/Note.md'), { vaultName: 'My Vault', noteName: 'Note', notePath: 'dir/Sub/Note' });
  assert.equal(parseCrossVaultRef('Note'), null);
  assert.equal(parseCrossVaultRef('::Note'), null);
  assert.equal(parseCrossVaultRef('B::'), null);
  assert.equal(parseCrossVaultRef(''), null);
});

test('findCrossVaultLinks: offsets, embed flag, alias and heading', () => {
  const text = 'see [[B::Note]] and ![[C::Other#Part]] and [[B::X|alias]]';
  const links = findCrossVaultLinks(text);
  assert.equal(links.length, 3);
  assert.equal(text.slice(links[0].start, links[0].end), '[[B::Note]]');
  assert.equal(links[0].embed, false);
  assert.equal(links[1].embed, true);
  assert.equal(text.slice(links[1].start, links[1].end), '![[C::Other#Part]]');
  assert.equal(links[1].heading, 'Part');
  assert.equal(links[2].alias, 'alias');
  assert.equal(links[2].raw, '[[B::X|alias]]');
});

test('findCrossVaultLinks ignores normal wikilinks and malformed brackets', () => {
  assert.deepEqual(findCrossVaultLinks('[[Plain]] [[A|b]] [[B::]] [[ ::x]] [[B::unclosed'), []);
});

test('findCrossVaultLinks ignores links in inline code and fenced code, keeps those after the block', () => {
  const text = ['before [[A::One]]', '`[[A::Inline]]` and ``[[A::Double]]``', '```js', '[[A::Fenced]]', '```', '~~~', '![[A::Tilde]]', '~~~', 'after [[A::Two]]'].join('\n');
  assert.deepEqual(findCrossVaultLinks(text).map(l => l.noteName), ['One', 'Two']);
});

test('an unterminated fence swallows the rest of the document (like a Markdown renderer)', () => {
  assert.deepEqual(findCrossVaultLinks('[[A::One]]\n```\n[[A::Two]]\n[[A::Three]]').map(l => l.noteName), ['One']);
});

test('maskCode keeps the text length and line structure', () => {
  const text = 'a `x` b\n```\ncode\n```\nc';
  const masked = maskCode(text);
  assert.equal(masked.length, text.length);
  assert.equal(masked.split('\n').length, text.split('\n').length);
  assert.equal(masked.includes('code'), false);
});

test('linkAt: start inclusive, end exclusive', () => {
  const links = findCrossVaultLinks('xx[[B::N]]yy');
  assert.equal(linkAt(links, 1), undefined);
  assert.equal(linkAt(links, 2)?.noteName, 'N');
  assert.equal(linkAt(links, 9)?.noteName, 'N');
  assert.equal(linkAt(links, 10), undefined);
});

test('findCrossVaultTarget: case-insensitive vault/note, path forms, wrong vault', () => {
  const files = [f('B', 'dir/Note.md'), f('B', 'Other.md'), f('C', 'Note.md')];
  assert.equal(findCrossVaultTarget(files, { vaultName: 'b', noteName: 'note' })?.relativePath, 'dir/Note.md');
  assert.equal(findCrossVaultTarget(files, { vaultName: 'C', noteName: 'Note' })?.vaultName, 'C');
  assert.equal(findCrossVaultTarget(files, { vaultName: 'B', noteName: 'dir/Note' })?.relativePath, 'dir/Note.md');
  assert.equal(findCrossVaultTarget(files, { vaultName: 'B', noteName: 'Missing' }), undefined);
  assert.equal(findCrossVaultTarget(files, { vaultName: 'Z', noteName: 'Note' }), undefined);
});

test('formatCrossVaultLink builds link and embed text', () => {
  assert.equal(formatCrossVaultLink({ vaultName: 'B', noteName: 'N' }), '[[B::N]]');
  assert.equal(formatCrossVaultLink({ vaultName: 'B', noteName: 'N', heading: 'H' }, true), '![[B::N#H]]');
});

// ---- click behaviour (T11) -------------------------------------------------------------

test('T11: plain click opens in Live Preview, Ctrl/Cmd+click opens a new tab, Source mode needs the modifier', () => {
  assert.equal(decideClick({ livePreview: true, modifier: false, cursorInsideLink: false }), 'open');
  assert.equal(decideClick({ livePreview: true, modifier: true, cursorInsideLink: false }), 'open-new-tab');
  assert.equal(decideClick({ livePreview: false, modifier: false, cursorInsideLink: false }), 'none');
  assert.equal(decideClick({ livePreview: false, modifier: true, cursorInsideLink: false }), 'open-new-tab');
});

test('T11: a click while the cursor is inside the raw link edits text instead of opening it', () => {
  assert.equal(decideClick({ livePreview: true, modifier: false, cursorInsideLink: true }), 'none');
  assert.equal(decideClick({ livePreview: true, modifier: true, cursorInsideLink: true }), 'open-new-tab');
});

test('T11: right-click target is the note in its own vault, URL-encoded', () => {
  assert.equal(sourceVaultUri({ vaultName: 'My Vault', relativePath: 'a b/Note #1.md' }),
    'obsidian://open?vault=My%20Vault&file=a%20b%2FNote%20%231.md');
});

// ---- autocomplete (T12) --------------------------------------------------------------------

test('T12: detectTrigger wakes up after "[[Vault::" and yields the typed query', () => {
  assert.deepEqual(detectTrigger('text [[B::No'), { kind: 'note', vaultTyped: 'B', query: 'No', startCh: 5 });
  assert.deepEqual(detectTrigger('[[B::'), { kind: 'note', vaultTyped: 'B', query: '', startCh: 0 });
  assert.equal(detectTrigger('![[My Vault::x')?.vaultTyped, 'My Vault');
  assert.equal(detectTrigger('![[My Vault::x')?.startCh, 1);
});

test('T12: "#" after the note switches to heading suggestions', () => {
  assert.deepEqual(detectTrigger('[[B::Note#Int'), { kind: 'heading', vaultTyped: 'B', noteTyped: 'Note', query: 'Int', startCh: 0 });
  assert.equal(detectTrigger('[[B::Note#')?.query, '');
});

test('T12: a plain "[[" (no "::"), an alias, a closed link or stray text leave Obsidian\'s own suggest alone', () => {
  assert.equal(detectTrigger('[['), null);
  assert.equal(detectTrigger('[[Plain note'), null);
  assert.equal(detectTrigger('[[B::Note|al'), null);
  assert.equal(detectTrigger('[[B::Note]] and then text'), null);
  assert.equal(detectTrigger('no brackets B::x'), null);
  assert.equal(detectTrigger('[[::x'), null);
  assert.equal(detectTrigger('[[A#h::x'), null);
});

test('scoreMatch ranks exact > prefix > word start > inside word > subsequence > none', () => {
  const s = (q: string, t: string) => scoreMatch(q, t);
  assert.ok(s('note', 'note') > s('note', 'notebook'));
  assert.ok(s('note', 'notebook') > s('note', 'my note'));
  assert.ok(s('note', 'my note') > s('note', 'denote'));
  assert.ok(s('note', 'denote') > s('nte', 'notes'));
  assert.equal(s('xyz', 'notes'), 0);
  assert.ok(s('', 'anything') > 0);
});

test('T12: suggestNotes only returns notes of that vault, best first, newest first on ties, capped at 20', () => {
  const files = [
    f('B', 'Notes.md', { mtime: 1 }), f('B', 'Note-b.md', { mtime: 5 }), f('B', 'Note-a.md', { mtime: 9 }),
    f('B', 'Unrelated.md'), f('C', 'Note-c.md')
  ];
  assert.deepEqual(suggestNotes(files, 'b', 'note').map(x => x.basename), ['Note-a', 'Note-b', 'Notes']);
  assert.equal(suggestNotes(files, 'B', 'zzz').length, 0);

  const many = Array.from({ length: 50 }, (_, i) => f('B', `n${i}.md`));
  assert.equal(suggestNotes(many, 'B', '').length, 20);
});

test('suggestHeadings filters the headings of a note and keeps document order', () => {
  const file = f('B', 'N.md', { headings: ['Intro', 'Details', 'Introduction again'] });
  assert.deepEqual(suggestHeadings(file, 'intro'), ['Intro', 'Introduction again']);
  assert.deepEqual(suggestHeadings(file, ''), ['Intro', 'Details', 'Introduction again']);
  assert.deepEqual(suggestHeadings(f('B', 'x.md'), 'a'), []);
});

test('T12: choosing a suggestion yields the full link text; duplicate names use the path', () => {
  const files = [f('B', 'a/Same.md'), f('B', 'b/Same.md'), f('B', 'Unique.md')];
  assert.equal(linkNameFor(files[2], files), 'Unique');
  assert.equal(linkNameFor(files[0], files), 'a/Same');
  assert.equal(buildInsertion('B', files[2], files), '[[B::Unique]]');
  assert.equal(buildInsertion('B', files[2], files, 'Part one'), '[[B::Unique#Part one]]');
  assert.equal(buildInsertion('B', files[1], files), '[[B::b/Same]]');
  // the inserted text round-trips through the parser and resolves to the same note
  const ref = parseCrossVaultRef(buildInsertion('B', files[1], files).slice(2, -2));
  assert.equal(ref && findCrossVaultTarget(files, ref)?.relativePath, 'b/Same.md');
});

test('targetForTrigger resolves the note of a heading trigger only', () => {
  const files = [f('B', 'Note.md')];
  assert.equal(targetForTrigger(files, detectTrigger('[[B::Note#h') as never)?.basename, 'Note');
  assert.equal(targetForTrigger(files, detectTrigger('[[B::No') as never), undefined);
  assert.equal(targetForTrigger(files, detectTrigger('[[B::Nope#h') as never), undefined);
});

// ---- embeds (T13) ---------------------------------------------------------------------------

const DOC = ['# Title', 'intro text', '', '## Part A', 'a1', '### Sub A', 'a2', '', '## Part B', 'b1', '', '# Other', 'o1'].join('\n');

test('T13: extractSection returns the heading, its body and its sub-sections up to the next heading of the same or higher level', () => {
  assert.equal(extractSection(DOC, 'Part A'), '## Part A\na1\n### Sub A\na2');
  assert.equal(extractSection(DOC, 'Sub A'), '### Sub A\na2');
  assert.equal(extractSection(DOC, 'Part B'), '## Part B\nb1');
  assert.equal(extractSection(DOC, 'Title'), '# Title\nintro text\n\n## Part A\na1\n### Sub A\na2\n\n## Part B\nb1');
});

test('T13: extractSection is case/space-insensitive, runs to the end for the last heading and returns null when missing', () => {
  assert.equal(extractSection(DOC, '  part   a '), '## Part A\na1\n### Sub A\na2');
  assert.equal(extractSection(DOC, 'Other'), '# Other\no1');
  assert.equal(extractSection(DOC, 'Missing'), null);
  assert.equal(extractSection('## Closed ##\nx', 'Closed'), '## Closed ##\nx');
});

test('extractSection ignores "headings" inside fenced code', () => {
  const doc = ['## Real', '```', '# not a heading', '```', 'tail', '## Next'].join('\n');
  assert.equal(extractSection(doc, 'Real'), '## Real\n```\n# not a heading\n```\ntail');
  assert.equal(extractSection(doc, 'not a heading'), null);
});

interface FakeEl { parentElement: FakeEl | null; classList: { contains(c: string): boolean } }
const el = (classes: string[], parent: FakeEl | null = null): FakeEl => ({ parentElement: parent, classList: { contains: (c) => classes.includes(c) } });

test('T13: embed depth counts embed ancestors; the limit is 2 so A -> B -> A loops stop', () => {
  assert.equal(MAX_EMBED_DEPTH, 2);
  const top = el([]);
  assert.equal(embedDepth(top as unknown as Element), 1);
  const inOne = el([], el(['mvn-embed'], el([])));
  assert.equal(embedDepth(inOne as unknown as Element), 2);
  const inTwo = el([], el(['mvn-embed'], el([], el(['mvn-embed']))));
  assert.equal(embedDepth(inTwo as unknown as Element), 3);
  assert.ok(embedDepth(inTwo as unknown as Element) > MAX_EMBED_DEPTH, 'third level is refused');
});
