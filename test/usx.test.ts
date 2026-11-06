import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { markerAt, offsetOfReference, referenceAt } from "../src/locate";
import { attributeInfo, documentedStyles, resolveMarker } from "../src/markers";
import { parseUsx, usxElement } from "../src/parse";
import { callerLabel, renderUsx } from "../src/render";
import { tokenizeUsx, type Token } from "../src/tokens";

const root = path.resolve(__dirname, "..");
const corpus = path.resolve(root, "../aiv-text/usx");

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<usx version="3.1">
<book code="JHN" style="id">eng</book>
<para style="mt1">John</para>
<para style="rem">status=draft secret remark</para>
<chapter number="1" style="c" sid="JHN 1"/>
<para style="s1">The Beginning</para>
<para style="r">(Genesis 1:1)</para>
<para style="p"><verse number="1" style="v" sid="JHN 1:1"/>In the beginning <char style="add">was</char> the Word. <char style="wj">“Light.”</char><note caller="+" style="f"><char style="fr" closed="false">1.1 </char><char style="ft" closed="false">Or </char><char style="fq" closed="false">lamp</char></note><verse eid="JHN 1:1"/></para>
<para style="q1"><verse number="2" style="v" sid="JHN 1:2"/>A line</para>
<para style="q2" vid="JHN 1:2">indented <verse eid="JHN 1:2"/></para>
<chapter eid="JHN 1"/>
</usx>
`;

function tokenCovering(source: string, tokens: Token[], needle: string): Token | undefined {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, needle);
  return tokens.find((token) => token.start <= index && token.end >= index + needle.length);
}

test("caller letters follow the Paratext automatic sequence", () => {
  assert.equal(callerLabel(1), "a");
  assert.equal(callerLabel(26), "z");
  assert.equal(callerLabel(27), "aa");
});

test("page render keeps published styling and hides remarks", () => {
  const page = renderUsx(sample);
  assert.equal(page.error, undefined);
  assert.equal(page.title, "John");
  assert.equal(page.bookCode, "JHN");
  assert.match(page.html, /<h1>John<\/h1>/);
  assert.match(page.html, /class="chapter-kicker">Chapter</);
  assert.match(page.html, /<p class="block p" data-style="p" data-sid="JHN 1:1">/);
  assert.match(page.html, /<h3 class="block s1"/);
  assert.match(page.html, /The Beginning/);
  assert.match(page.html, /class="block r"/);
  assert.match(page.html, /<em class="add">was<\/em>/);
  assert.match(page.html, /<span class="wj">“Light\.”<\/span>/);
  assert.match(page.html, /class="block q1"/);
  assert.match(page.html, /class="block q2"/);
  assert.match(page.html, /data-vid="JHN 1:2"/);
  assert.match(page.html, />a<\/a>/);
  assert.match(page.html, /class="fr">1\.1 <\/span>/);
  assert.match(page.html, /<em class="fq">lamp<\/em>/);
  assert.doesNotMatch(page.html, /status=draft/);
  assert.doesNotMatch(page.html, /secret remark/);
  assert.equal((page.html.match(/<sup class="verse"/g) || []).length, 2);
  assert.match(page.html, /<span class="unit" data-sid="JHN 1:1"><sup class="verse"/);
  assert.match(page.html, /<span class="unit" data-sid="JHN 1:2"><sup class="verse"/);
});

test("consecutive prose verses share one paragraph", () => {
  const page = renderUsx(`<usx>
    <chapter number="1" style="c" sid="GEN 1"/>
    <para style="p"><verse number="1" style="v" sid="GEN 1:1"/>In the beginning</para>
    <para style="p"><verse number="2" style="v" sid="GEN 1:2"/>the earth.</para>
    <para style="s1">Next</para>
    <para style="p"><verse number="3" style="v" sid="GEN 1:3"/>And God said.</para>
  </usx>`);
  assert.match(page.html, /<div class="passage"><p class="block p" data-style="p" data-sid="GEN 1:1">[\s\S]*<p class="block p" data-style="p" data-sid="GEN 1:2">[\s\S]*<\/div><h3 class="block s1"/);
  assert.match(page.html, /<\/h3><div class="passage"><p class="block p" data-style="p" data-sid="GEN 1:3">/);
});

test("verses in one paragraph stay in separate units", () => {
  const page = renderUsx(`<usx><para style="p"><verse number="1" style="v" sid="GEN 1:1"/>In the beginning <verse number="2" style="v" sid="GEN 1:2"/>the earth.</para></usx>`);
  assert.match(page.html, /<span class="unit" data-sid="GEN 1:1"><sup class="verse"[^>]*>1<\/sup>In the beginning <\/span><span class="unit" data-sid="GEN 1:2">/);
});

test("psalm chapters use the Psalm kicker and descriptive titles stay small caps", () => {
  const page = renderUsx(`<usx version="3.1">
    <book code="PSA" style="id">eng</book>
    <para style="mt1">Psalms</para>
    <chapter number="3" style="c" sid="PSA 3"/>
    <para style="d">A psalm of David.</para>
    <para style="qa">בBETH</para>
    <para style="qd"><char style="va">3:1a</char>A note.</para>
  </usx>`);
  assert.equal(page.error, undefined);
  assert.match(page.html, /class="chapter-kicker">Psalm</);
  assert.match(page.html, /class="block d"/);
  assert.match(page.html, /class="block qa"/);
  assert.match(page.html, /<sup class="va">3:1a<\/sup>/);
});

test("entities are decoded and escaped", () => {
  const page = renderUsx(`<usx><para style="mt1">A &amp; B</para><para style="p">5 &lt; 6</para></usx>`);
  assert.equal(page.title, "A & B");
  assert.match(page.html, /<h1>A &amp; B<\/h1>/);
  assert.match(page.html, /5 &lt; 6/);
});

test("a broken tag still previews the text already parsed", () => {
  const page = renderUsx(`<usx><para style="p">Hello</para></not></usx>`);
  assert.ok(page.error);
  assert.match(page.error.message, /does not match/);
  assert.match(page.html, /Hello/);
});

test("an unclosed paragraph is reported and still rendered", () => {
  const page = renderUsx(`<usx><para style="p">Hello`);
  assert.ok(page.error);
  assert.match(page.error.message, /Unclosed <para>/);
  assert.match(page.html, /Hello/);
});

test("feature tokens do not overlap and cover the marker text", () => {
  const { tokens, parsed } = tokenizeUsx(sample);
  assert.equal(parsed.error, undefined);
  for (let index = 1; index < tokens.length; index++) {
    assert.ok(tokens[index].start >= tokens[index - 1].end, `${tokens[index - 1].type} overlaps ${tokens[index].type}`);
  }
  assert.equal(tokenCovering(sample, tokens, "was")?.type, "addition");
  assert.equal(tokenCovering(sample, tokens, "“Light.”")?.type, "wordsOfJesus");
  assert.equal(tokenCovering(sample, tokens, "A line")?.type, "poetry");
  assert.equal(tokenCovering(sample, tokens, "The Beginning")?.type, "heading");
  assert.equal(tokenCovering(sample, tokens, "secret remark")?.type, "meta");
  assert.equal(tokenCovering(sample, tokens, "(Genesis 1:1)")?.type, "reference");
  assert.equal(tokenCovering(sample, tokens, "lamp")?.type, "note");

  const addStyle = sample.indexOf('style="add"') + 'style="'.length;
  assert.equal(tokens.find((token) => token.start === addStyle)?.type, "addition");
  const plain = tokenCovering(sample, tokens, "In the beginning ");
  assert.equal(plain, undefined);
});

test("hover and reference location follow the cursor", () => {
  const parsed = parseUsx(sample);
  const was = sample.indexOf("was");
  const hit = markerAt(parsed.root, was);
  assert.equal(hit?.style, "add");
  assert.equal(hit?.info.markerType, "Character");
  assert.equal(referenceAt(parsed.root, was), "JHN 1:1");
  const indented = sample.indexOf("indented");
  assert.equal(referenceAt(parsed.root, indented), "JHN 1:2");
  const offset = offsetOfReference(parsed.root, "JHN 1:2");
  assert.equal(offset, sample.indexOf('<verse number="2"'));
  assert.ok(usxElement(parsed.root));
});

test("the preview stylesheet uses the system serif and Apple colors", () => {
  const css = fs.readFileSync(path.join(root, "media/preview.css"), "utf8");
  assert.match(css, /"New York"/);
  assert.match(css, /ui-serif/);
  assert.match(css, /-apple-system/);
  assert.match(css, /--system-blue:\s*#007aff/);
  assert.match(css, /--system-red:\s*#ff3b30/);
  assert.match(css, /body\.features \.wj/);
  assert.match(css, /\.wj \{\s*color: inherit;/);
  assert.match(css, /\.block\.d,\s*\.block\.qd \{[^}]*font-style:\s*normal;[^}]*font-size:\s*17px;[^}]*color:\s*var\(--label\);[^}]*font-variant:\s*small-caps;[^}]*letter-spacing:\s*normal;/);
  assert.match(css, /\.block\.s,\s*\.block\[data-style\^="s1"\][\s\S]*?font-style:\s*italic;\s*font-weight:\s*400;/);
  assert.match(css, /\.block\.ms,\s*\.block\[data-style\^="ms1"\][\s\S]*?font-style:\s*italic;\s*font-weight:\s*700;/);
  assert.match(css, /body\.verses \.unit \{\s*display:\s*block;/);
  assert.match(css, /body:not\(\.verses\) \.passage \.block\.p \{\s*display:\s*inline;/);
});

const USFM_MARKERS = `
id usfm ide sts rem h toc toca periph
p m po pr cls pmo pm pmc pmr pi mi nb pc ph b lit
mt mte ms mr s sr r d sp sd
q qr qc qs qa qac qm qd
lh li lf lim litl lik liv
tr th thr tc tcr
imt is ip ipi im imi ipq imq ipr iq ib ili iot io ior iqt iex imte ie
add bk dc k nd ord pn png addpn qt sig sls tl wj
em bd it bdit no sc sup fig ndx rb pro w wg wh wa jmp
f fe ef fr fq fqa fk fl fw fp fv ft fdc fm
x ex xo xk xq xt xta xop xot xnt xdc rq cat
esb esbe
c ca cl cp cd v va vp pb
qt-s qt-e ts-s ts-e
`.trim().split(/\s+/);

const USFM_ATTRIBUTES = `
lemma strong srcloc gloss link-href link-title link-id
alt src size loc copy ref who sid eid vid altnumber pubnumber
caller category id code number closed
`.trim().split(/\s+/);

test("every USFM 3.0.1 marker and parameter resolves", () => {
  assert.deepEqual([...documentedStyles()].sort(), [...USFM_MARKERS].sort());
  for (const style of USFM_MARKERS) {
    assert.equal(resolveMarker(style)?.info.style, style, style);
  }
  assert.equal(resolveMarker("q")?.level, 1);
  assert.equal(resolveMarker("q2")?.info.style, "q");
  assert.equal(resolveMarker("q2")?.level, 2);
  assert.equal(resolveMarker("s")?.info.token, "heading");
  assert.equal(resolveMarker("qt1-s")?.edge, "start");
  assert.equal(resolveMarker("qt1-s")?.level, 1);
  assert.equal(resolveMarker("qt2-e")?.edge, "end");
  assert.equal(resolveMarker("qt2-e")?.level, 2);
  assert.equal(resolveMarker("ts-s")?.edge, "start");
  assert.deepEqual(resolveMarker("tcr1-2")?.columns, { start: 1, end: 2 });
  assert.equal(resolveMarker("th")?.info.layout, "table-cell");
  assert.equal(resolveMarker("h2")?.info.deprecated, true);
  assert.equal(resolveMarker("zMyMarker")?.info.name, "Private marker");
  assert.equal(resolveMarker("addpn")?.info.deprecated, true);
  for (const name of USFM_ATTRIBUTES) {
    assert.equal(attributeInfo(name)?.name, name, name);
  }
  assert.match(attributeInfo("x-myattr")?.description ?? "", /x-/);
  const grammar = fs.readFileSync(path.join(root, "syntaxes/usx.tmLanguage.json"), "utf8");
  for (const name of ["lemma", "strong", "srcloc", "gloss", "link-href", "link-title", "link-id", "altnumber", "pubnumber", "who"]) {
    assert.match(grammar, new RegExp(name));
  }
  assert.ok(grammar.includes(String.raw`qt\\d*-s`));
  assert.ok(grammar.includes(String.raw`toca\\d*`));
});

test("USFM parameters are highlighted and shown on the page", () => {
  const source = `<usx version="3.1">
    <book code="GEN" style="id"/>
    <para style="usfm">3.0</para>
    <para style="ide">UTF-8</para>
    <para style="h">Genesis</para>
    <para style="toc3">Gen</para>
    <para style="toca1">Génesis</para>
    <para style="mt1">Genesis</para>
    <para style="mt2">The First Book</para>
    <para style="cl">Section</para>
    <para style="imt1">Introduction</para>
    <para style="ip">Intro text.</para>
    <para style="ie"/>
    <chapter number="1" style="c" sid="GEN 1" altnumber="A" pubnumber="I"/>
    <para style="cd">The beginning of everything.</para>
    <para style="p"><verse number="1" style="v" sid="GEN 1:1" pubnumber="1a"/>In <char style="nd">God</char> <char style="w" lemma="create" strong="H1254,G1234" srcloc="GEN 1:1!1" x-myattr="metadata">created</char> <char style="rb" gloss="heaven:sky">sky</char>.<optbreak/></para>
    <para style="tr"><char style="th1">Day</char><char style="thr2">Work</char></para>
    <para style="tr"><char style="tc1">1</char><char style="tcr1-2">Light</char></para>
    <para style="li1">Item <char style="lik">key</char></para>
    <para style="qs">Selah</para>
    <para style="p"><ms style="qt1-s" who="God" sid="qt1"/>Let there be light.<ms style="qt1-e" eid="qt1"/></para>
    <para style="p"><char style="fig" alt="Light" src="light.jpg" size="span" loc="GEN 1:3" copy="Public domain" ref="Genesis 1:3">Caption</char></para>
    <para style="p"><char style="jmp" link-href="https://example.com/gen" link-title="Genesis" link-id="gen-link">See</char></para>
    <para style="p"><note caller="-" style="x"><char style="xo">1:1 </char><char style="xt" link-href="JHN 1:1">John 1:1</char></note><note caller="*" style="fe"><char style="ft">End.</char></note></para>
    <para style="esb" category="theme"/>
    <para style="p">Sidebar text</para>
    <para style="esbe"/>
    <para style="periph" id="foreword">Foreword</para>
    <para style="b"/>
    <para style="pb"/>
    <para style="zMy">Private note</para>
  </usx>`;
  const page = renderUsx(source);
  assert.equal(page.error, undefined);
  assert.equal(page.title, "Genesis");
  assert.match(page.html, /<h1>Genesis<\/h1>/);
  assert.match(page.html, /The First Book/);
  assert.match(page.html, /Introduction/);
  assert.match(page.html, /Intro text/);
  assert.doesNotMatch(page.html, /UTF-8/);
  assert.doesNotMatch(page.html, />Gen</);
  assert.doesNotMatch(page.html, /Génesis/);
  assert.match(page.html, /class="chapter-kicker">Section/);
  assert.match(page.html, /<h2>I<sup class="va">A<\/sup><\/h2>/);
  assert.match(page.html, /The beginning of everything/);
  assert.match(page.html, /<sup class="verse"[^>]*>1a<\/sup>/);
  assert.match(page.html, /class="char nd">God/);
  assert.match(page.html, /title="create · H1254,G1234 · GEN 1:1!1"/);
  assert.match(page.html, /data-strong="H1254,G1234"/);
  assert.match(page.html, /data-x-myattr="metadata"/);
  assert.match(page.html, /<ruby class="rb">sky<rp>\(<\/rp><rt>heaven · sky<\/rt>/);
  assert.match(page.html, /<wbr>/);
  assert.match(page.html, /<th class="cell th">Day<\/th>/);
  assert.match(page.html, /<th class="cell thr right">Work<\/th>/);
  assert.match(page.html, /colspan="2">Light<\/td>/);
  assert.match(page.html, /data-style="li1"/);
  assert.match(page.html, /class="block qs"/);
  assert.match(page.html, /class="who">God<\/span>Let there be light/);
  assert.match(page.html, /class="fig fig-span"/);
  assert.match(page.html, /alt="Light"/);
  assert.match(page.html, /src="light.jpg"/);
  assert.match(page.html, /Genesis 1:3/);
  assert.match(page.html, /Public domain/);
  assert.match(page.html, /href="https:\/\/example\.com\/gen"/);
  assert.match(page.html, /title="Genesis"/);
  assert.match(page.html, /id="link-gen-link"/);
  assert.match(page.html, /data-href="JHN 1:1"/);
  assert.match(page.html, /aria-label="Endnotes"/);
  assert.match(page.html, />\*<\/a>/);
  assert.doesNotMatch(page.html, /<sup class="caller"[^>]*><a[^>]*>-<\/a>/);
  assert.match(page.html, /<aside class="sidebar">/);
  assert.match(page.html, /class="cat">theme/);
  assert.match(page.html, /Sidebar text/);
  assert.match(page.html, /data-periph="foreword">Foreword/);
  assert.match(page.html, /class="blank"/);
  assert.match(page.html, /<hr class="pb">/);
  assert.match(page.html, /Private note/);

  const { tokens } = tokenizeUsx(source);
  for (let index = 1; index < tokens.length; index++) {
    assert.ok(tokens[index].start >= tokens[index - 1].end);
  }
  assert.equal(tokenCovering(source, tokens, "create")?.type, "attribute");
  assert.equal(tokenCovering(source, tokens, "H1254,G1234")?.type, "attribute");
  assert.equal(tokenCovering(source, tokens, "heaven:sky")?.type, "attribute");
  assert.equal(tokenCovering(source, tokens, "https://example.com/gen")?.type, "attribute");
  assert.equal(tokenCovering(source, tokens, "metadata")?.type, "attribute");
  assert.equal(tokenCovering(source, tokens, "God")?.type, "title");
  const parsed = parseUsx(source);
  const lemmaAt = source.indexOf("create");
  const hit = markerAt(parsed.root, lemmaAt);
  assert.equal(hit?.attribute?.name, "lemma");
});

test("every USX book renders its verses, notes, and title", () => {
  if (!fs.existsSync(corpus)) {
    return;
  }
  const files = fs.readdirSync(corpus).filter((name) => name.endsWith(".usx")).sort();
  assert.equal(files.length, 66);
  for (const file of files) {
    const source = fs.readFileSync(path.join(corpus, file), "utf8");
    const code = file.replace(/\.usx$/, "");
    const page = renderUsx(source);
    assert.equal(page.error, undefined, file);
    assert.equal(page.bookCode, code, file);
    const title = /<para style="mt1">([^<]*)<\/para>/.exec(source)?.[1]?.replace(/\s+/g, " ").trim();
    assert.equal(page.title, title, file);
    assert.doesNotMatch(page.html, /status=draft/, file);
    const verses = (source.match(/<verse\b[^>]*\bnumber="/g) || []).length;
    const renderedVerses = (page.html.match(/<sup class="verse"/g) || []).length;
    assert.equal(renderedVerses, verses, file);
    const notes = (source.match(/<note\b/g) || []).length;
    const renderedNotes = (page.html.match(/<sup class="caller"/g) || []).length;
    assert.equal(renderedNotes, notes, file);
    const { tokens, parsed } = tokenizeUsx(source);
    assert.equal(parsed.error, undefined, file);
    for (let index = 1; index < tokens.length; index++) {
      assert.ok(tokens[index].start >= tokens[index - 1].end, `${file} token overlap at ${tokens[index].start}`);
    }
  }
});
