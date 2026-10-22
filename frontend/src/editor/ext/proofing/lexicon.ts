const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

export const SUBJ = set('i you he she it we they');
export const OBJ = set('me him her us them');
export const DET = set('the a an this that these those my your his her its our their each every another some any no both either neither all many much few several more most less least enough such what which whose');
export const PREP = set('of in on at by for with about against between into through during before after above below to from up down over under across around near off onto toward towards within without upon among beside behind beyond despite except inside outside past since until via per like');
export const CONJ = set('and or but nor so yet because although though while whereas if unless since until when whenever where wherever whether as than that which who whom whose');
export const WH = set('what who whom whose which when where why how whenever wherever whoever whatever');
export const AUX = set("am is are was were be been being have has had having do does did will would shall should can could may might must ought isn't aren't wasn't weren't haven't hasn't hadn't don't doesn't didn't won't wouldn't shouldn't couldn't can't cannot mustn't");
export const MODAL = set('can could will would shall should may might must');
export const ADV = set('very really quite rather too so just only also still always never often usually sometimes rarely seldom already even almost nearly not now then here there today tomorrow yesterday tonight again soon later ever perhaps maybe however therefore thus indeed certainly probably clearly simply finally suddenly together away back well yet once twice far');
export const PRE_ADV = set('always often never usually sometimes rarely seldom also just still really already even only almost probably certainly never ever now then');
export const INTRO = set('and but or so because if when while although though whereas whenever where wherever once until unless since as after before then than what who whom which whose why how whether yet nor whoever whatever');
export const NUM_WORDS = set('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion');
export const PLURAL_NUM = set('two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred dozens hundreds thousands millions several many numerous multiple both few countless');
export const IRREGULAR_PLURAL = set('people children men women feet teeth mice geese police cattle data media criteria phenomena bacteria alumni fungi cacti nuclei stimuli indices theses crises analyses oxen lice dice vermin');
export const NOT_S = set('is was has his this its as us yes thus plus less always sometimes perhaps besides across towards afterwards upwards backwards forwards otherwise nevertheless regardless does goes bus gas lens bias atlas canvas chaos focus virus status campus bonus corpus census genius radius series species news means physics mathematics economics politics athletics ethics');

const IRREGULAR_LINES = `go went gone
be was been
have had had
do did done
say said said
make made made
get got gotten
take took taken
come came come
see saw seen
know knew known
give gave given
find found found
think thought thought
tell told told
become became become
show showed shown
leave left left
feel felt felt
bring brought brought
begin began begun
keep kept kept
hold held held
write wrote written
stand stood stood
hear heard heard
let let let
mean meant meant
set set set
meet met met
run ran run
pay paid paid
sit sat sat
speak spoke spoken
lie lay lain
lead led led
read read read
grow grew grown
lose lost lost
fall fell fallen
send sent sent
build built built
understand understood understood
draw drew drawn
break broke broken
spend spent spent
cut cut cut
rise rose risen
drive drove driven
buy bought bought
wear wore worn
choose chose chosen
eat ate eaten
sleep slept slept
sing sang sung
swim swam swum
throw threw thrown
teach taught taught
catch caught caught
fly flew flown
forget forgot forgotten
win won won
sell sold sold
fight fought fought
hide hid hidden
ride rode ridden
shake shook shaken
steal stole stolen
wake woke woken
hit hit hit
hurt hurt hurt
put put put
shut shut shut
quit quit quit
bite bit bitten
blow blew blown
deal dealt dealt
dig dug dug
feed fed fed
forgive forgave forgiven
freeze froze frozen
hang hung hung
lend lent lent
ring rang rung
seek sought sought
shoot shot shot
sink sank sunk
slide slid slid
spin spun spun
spread spread spread
swing swung swung
tear tore torn
bear bore borne
beat beat beaten
bend bent bent
bind bound bound
bleed bled bled
cost cost cost
fit fit fit
lay laid laid
overcome overcame overcome
undo undid undone
withdraw withdrew withdrawn
foresee foresaw foreseen
mistake mistook mistaken
upset upset upset
forbid forbade forbidden`;

export const BASE_OF_PAST = new Map<string, string>();
export const IDENT = new Set<string>();
export const PAST_FORMS = new Set<string>();
export const PP_ONLY = new Map<string, string>();
const IRREG_BASES = new Set<string>();

for (const line of IRREGULAR_LINES.split('\n')) {
  const [base, past, pp] = line.trim().split(' ');
  IRREG_BASES.add(base);
  if (past === base || pp === base) IDENT.add(base);
  for (const f of [past, pp]) {
    if (f === base) continue;
    PAST_FORMS.add(f);
    if (!BASE_OF_PAST.has(f)) BASE_OF_PAST.set(f, base);
  }
  if (pp !== past && pp !== base) PP_ONLY.set(pp, base);
}

export const AMBIG_PAST = set('found saw wound ground bound lay fell rose bore left lit bit spun shot sank sunk rang rung ran run bent fed fit led lent hung sat set met');

const VERBS = set(`accept act add admit afford agree allow answer appear apply argue arrive ask attack avoid bake bark become begin believe belong borrow bother break bring build burn buy call care carry catch cause change charge check choose claim climb collect come compare complain complete consider contain continue control cook copy count create cross cry dance deal decide deliver depend describe design destroy develop die discover discuss divide do draw dream dress drink drive drop eat enjoy enter escape expect explain face fail fall feed feel fight fill find finish fix fly follow forget forgive form gain get give go grow guess handle hang happen hate have hear help hide hold hope imagine improve include increase join jump keep kick kill kiss know laugh lead learn leave lend lie like listen live look lose love make manage matter mean measure meet mention miss move need notice obtain occur offer own pass pay perform pick plan plant play prefer prepare prevent produce promise protect prove provide pull push reach realize receive recognize record reduce refuse relate remain remember remove repeat reply report represent require rest return ride rise roll run save say see seem sell send serve settle shake share shoot shout show sing sit sleep smile speak spend stand start stay steal stop study succeed suffer suggest supply support suppose surprise survive swim take talk taste teach tell tend test thank think throw touch train travel treat try turn understand use visit wait wake walk want warn wash watch wear win wish wonder work worry write cost cut hit hurt let put read set shut spread bet beat fit quit rain snow cry fry study carry copy marry hurry`);

const NOUNS = set(`dog cat man woman child boy girl book table chair house car road city town country school teacher student doctor nurse team company group family friend sister brother mother father son daughter president king queen leader worker player writer author artist driver farmer manager owner member user customer client engine machine computer phone window door room garden tree flower river mountain ocean sea lake bridge street building office store shop market bank hospital church park beach field farm ship boat plane train bus truck bike horse bird fish cow sheep pig mouse rabbit idea problem question answer reason result report study paper article story letter message email file document page word sentence paragraph chapter list number picture photo song movie film game party meeting class lesson test exam project program system service product price deal offer contract rule law policy decision choice chance event week month year day night morning evening hour minute moment weather storm rain snow wind fire sound voice music food meal dinner lunch breakfast coffee tea water bread cake apple orange hill side top bottom end edge corner center middle part piece kind sort type form shape size color name title head hand foot eye face heart mind body life world time way place thing man woman people government water air sun moon star sky cloud earth ground land sand stone rock wood paper glass metal gold silver box bag bottle cup plate bowl knife fork spoon bed bath kitchen floor wall roof ceiling lamp clock watch ring key lock card ticket map sign flag line circle square point step stair edge surface layer level scale range series pair couple bunch hundred dollar cent mile inch pound ounce gallon parent seat beer neighbor neighbour employee director engineer lawyer scientist reader visitor guest passenger patient citizen voter soldier officer clerk waiter chef pilot captain sailor judge jury author editor publisher journalist reporter artist musician singer actor dancer athlete coach fan pen pencil suitcase wallet shoe shirt coat hat dress glove sock jacket skirt bottle jar basket bucket tool hammer nail screw wheel engine motor battery cable wire switch button screen camera television radio speaker headphone printer scanner keyboard mouse monitor laptop tablet server network website site link account password email address number code script function method class object variable value error bug feature version update release goal skill habit fact opinion argument claim theory hypothesis experiment sample survey figure chart graph table row column cell field record item entry entries stage phase period season summer winter spring autumn holiday vacation trip journey tour visit flight route path trail track lane highway tunnel station airport port harbor island coast beach shore cliff valley forest desert jungle meadow pond stream waterfall cave village neighborhood suburb district region state province nation empire kingdom republic border capital court prison palace castle tower temple museum gallery library theater stadium arena studio factory warehouse farmhouse barn stable cottage cabin tent apartment flat hotel restaurant cafe pub bar bakery pharmacy clinic ward lecture seminar workshop conference session debate speech ceremony festival concert show episode scene chapter volume edition novel poem essay magazine newspaper headline diary journal notebook calendar schedule agenda budget salary wage income tax fee fine loan debt bill invoice receipt coupon discount sale deal`);

const ADJS = set(`big small large little old new young good bad great nice beautiful lovely wonderful long short high low tall red blue green black white dark bright warm cold hot loud quick fast late early happy sad hungry tired busy full sweet sour heavy strong weak rich poor important different same other first last next several many few much very quite really too just only also still always never often today tomorrow yesterday tonight here there now then pretty ugly easy hard simple clear sunny cloudy rainy windy foggy lucky unlucky special common rare popular famous quiet gentle kind rough smooth soft sharp deep wide narrow thick thin fresh ripe wet dry round flat real true false wrong right left main whole total entire final recent ancient modern local national global public private double single open closed`);

export interface Extra { verbs: Set<string>; nouns: Set<string>; adjs: Set<string>; attested: Set<string> }
let extra: Extra | null = null;

export function setExtra(v: { verbs: string[]; nouns: string[]; adjs: string[]; attested?: string[] } | null): void {
  extra = v ? { verbs: new Set(v.verbs), nouns: new Set(v.nouns), adjs: new Set(v.adjs), attested: new Set(v.attested ?? v.verbs) } : null;
}

export function maybeVerbForm(w: string): boolean {
  const has = (x: string): boolean => VERBS.has(x) || IRREG_BASES.has(x) || !!extra?.attested.has(x);
  if (has(w) || PAST_FORMS.has(w) || AMBIG_PAST.has(w)) return true;
  const cands: string[] = [];
  if (w.endsWith('ies')) cands.push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ied')) cands.push(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) cands.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('s')) cands.push(w.slice(0, -1));
  if (w.endsWith('ed')) cands.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
  if (w.endsWith('ing')) cands.push(w.slice(0, -3), `${w.slice(0, -3)}e`, w.slice(0, -4));
  return cands.some((c) => c.length > 1 && has(c));
}

export function lexiconLoaded(): boolean { return extra !== null; }

export function isVerb(w: string): boolean { return VERBS.has(w) || !!extra?.verbs.has(w); }
export function isNoun(w: string): boolean { return NOUNS.has(w) || (!VERBS.has(w) && !!extra?.nouns.has(w)); }
export function isAdj(w: string): boolean { return ADJS.has(w) || (!VERBS.has(w) && !NOUNS.has(w) && !!extra?.adjs.has(w)); }

export function isBaseVerb(w: string): boolean {
  return isVerb(w) && !MODAL.has(w) && w !== 'ought' && !PAST_FORMS.has(w) && !AMBIG_PAST.has(w) && !IDENT.has(w) && !isAdjOnly(w);
}

function isAdjOnly(w: string): boolean { return ADJS.has(w) && !VERBS.has(w); }

export function sForm(base: string): string {
  if (base === 'have') return 'has';
  if (base === 'be') return 'is';
  if (/(s|x|z|ch|sh|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

export function baseOfS(w: string): string | null {
  if (w === 'has') return 'have';
  if (w === 'does') return 'do';
  if (w === 'goes') return 'go';
  if (NOT_S.has(w) || w.length < 3 || !w.endsWith('s') || w.endsWith('ss')) return null;
  const cands: string[] = [];
  if (w.endsWith('ies')) cands.push(`${w.slice(0, -3)}y`);
  if (/(ses|xes|zes|ches|shes|oes)$/.test(w)) cands.push(w.slice(0, -2));
  cands.push(w.slice(0, -1));
  for (const c of cands) if (isBaseVerb(c) || IDENT.has(c) || (VERBS.has(c) && !PAST_FORMS.has(c))) return c;
  return null;
}

export function baseOfRegularPast(w: string): string | null {
  if (!w.endsWith('ed') || w.length < 4) return null;
  const stem = w.slice(0, -2);
  const cands = [stem, `${stem}e`, w.endsWith('ied') ? `${w.slice(0, -3)}y` : stem, stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2] ? stem.slice(0, -1) : stem];
  for (const c of cands) if (VERBS.has(c) && !isNoun(w) && !isAdj(w)) return c;
  return null;
}

export function pluralStem(w: string): string | null {
  if (w.length < 3 || !w.endsWith('s') || w.endsWith('ss') || w.endsWith('us') || w.endsWith('is') || NOT_S.has(w)) return null;
  const cands: string[] = [];
  if (w.endsWith('ies')) cands.push(`${w.slice(0, -3)}y`);
  if (/(ses|xes|zes|ches|shes|oes)$/.test(w)) cands.push(w.slice(0, -2));
  cands.push(w.slice(0, -1));
  for (const c of cands) if (NOUNS.has(c) || (!VERBS.has(c) && !!extra?.nouns.has(c))) return c;
  return null;
}

export function isPluralNoun(w: string): boolean {
  if (IRREGULAR_PLURAL.has(w)) return w !== 'data' && w !== 'media';
  return pluralStem(w) !== null;
}

export function isSingularNoun(w: string): boolean {
  if (!isNoun(w) || IRREGULAR_PLURAL.has(w)) return false;
  return !w.endsWith('s') || /(ss|us|is)$/.test(w);
}
