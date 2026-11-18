/** v2.1 regression corpus, owned by Sol.
 * Fixed, independently written inputs: no edit-distance algorithm generates
 * expected answers. Isolated positive cases include unrelated distractors;
 * ambiguity cases deliberately put competing answers in the same prompt.
 * Browser/Node compatible: runMatcherCorpus(matchAnswer) returns a report.
 */
export const MATCHER_CASES = [];
const answer = (name, points = 42, aliases = []) => ({ name, aliases, points });
function add(group, input, names, status, expectedName, corrected) {
  MATCHER_CASES.push({ id: `${group}-${MATCHER_CASES.length + 1}`, group, input,
    prompt: { answers: names.map(name => typeof name === 'string' ? answer(name) : name) },
    expected: { status, answerName: expectedName, corrected } });
}
const typos = `Marseille|Marsielle|Marseile|Marseillee
Bordeaux|Bordaeux|Bordeauux|Bordeau
Strasbourg|Strasburg|Strasbougr|Strasbourgg
Montpellier|Montpelier|Montpelllier|Monptellier
Grenoble|Grenbole|Grenoblee|Grenobl
Avignon|Avignno|Avignonn|Avigno
Rennes|Rennesx|Renens|Renes
Limoges|Limoge|Limgoes|Limogees
Orléans|Orlaens|Orleanss|Orlean
Hiroshima|Hiroshmia|Hiroshma|Hiroshimaa
Nagasaki|Nagaskai|Nagasakii|Nagsaki
Yokohama|Yokohmaa|Yokoham|Yokohamma
Sapporo|Sapopro|Sappor|Sapporro
Kawasaki|Kawaskai|Kawasak|Kawasakki
Kanazawa|Kanazwaa|Kanazaw|Kanazawaa
Kumamoto|Kumamtoo|Kumamto|Kumamotoo
Okayama|Okaymaa|Okayam|Okayamma
Niigata|Niigtaa|Niigat|Niigataa
Takamatsu|Takamastu|Takamatsuu|Takamats
Kagoshima|Kagoshmia|Kagoshma|Kagoshimaa
Hamamatsu|Hamamastu|Hamamatsuu|Hamamats
Himeji|Himejii|Himej|Himeij
Florianópolis|Florianoplis|Florianoplois|Florianopoliss
Curitiba|Curitbia|Curitibaa|Curitib
Recife|Recfie|Recifee|Recif
Fortaleza|Fortlaeza|Fortalezaa|Fortalez
Salvador|Salavdor|Salvadorr|Salvado
Campinas|Campnias|Campinass|Campina
Bologna|Bolgona|Bolognaa|Bologn
Palermo|Palerom|Palermoo|Palerm
Ravenna|Ravenan|Ravennaa|Ravenn
Perugia|Peruiga|Perugiaa|Perugi
Ferrara|Ferrraa|Ferraraa|Ferrar
Bergamo|Bergmao|Bergamoo|Bergam
Hamburg|H amburg|Hamburgg|Hamburgx
Stuttgart|Stutgart|Stuttgatr|Stuttgartt
Heidelberg|Heidelbrg|Heidelbegr|Heidelbergg
Regensburg|Regensbrg|Regensbugr|Regensburgg
Augsburg|Augsbrg|Augsbugr|Augsburgg
Potsdam|Potsdma|Potsdamm|Potsda
Hyderabad|Hyderbad|Hyderabda|Hyderabadd
Ahmedabad|Ahmedbad|Ahmedabda|Ahmedabadd
Bengaluru|Bengalru|Benglauru|Bengaluruu
Amritsar|Amritasr|Amritsarr|Amritsa
Coimbatore|Coimbatre|Coimbatoer|Coimbatoree
Melbourne|Melburne|Melbouren|Melbournee
Brisbane|Brisabne|Brisbanee|Brisban
Adelaide|Adelaied|Adelaidee|Adelaid
Canberra|Canberar|Canberraa|Canberr
Wollongong|Wollongng|Wollongogn|Wollongongg
Launceston|Launcestn|Launcestno|Launcestonn
Vancouver|Vancouevr|Vancouverr|Vancouvr
Winnipeg|Winnpieg|Winnipegg|Winnipe
Saskatoon|Sasktaoon|Saskatoonn|Saskatoo
Fredericton|Frederictonn|Frederictno|Frederictonx
Charlottetown|Charlottetwn|Charlottetwon|Charlottetownn
Salamanca|Salamnaca|Salamancaa|Salamanc
Zaragoza|Zaragoaz|Zaragozaa|Zaragoz
Valladolid|Valladold|Valladoild|Valladolidd
Pamplona|Pamplnoa|Pamplonaa|Pamplon
Shanghai|Shangahi|Shanghaii|Shangha
Chongqing|Chongqign|Chongqingg|Chongqin
Hangzhou|Hangzohu|Hangzhouu|Hangzho
Kunming|Kunmnig|Kunmingg|Kunmin
Luoyang|Luoyagn|Luoyangg|Luoyan
Birmingham|Birminghm|Birmingahm|Birminghamm
Liverpool|Liverpol|Liverpolo|Liverpooll
Nottingham|Nottinghm|Nottingahm|Nottinghamm
Canterbury|Canterbry|Canterb ury|Canterburr y
Sacramento|Sacramnto|Sacramenot|Sacramentoo
Tallahassee|Tallahasse|Tallahasee|Tallahasseee
Indianapolis|Indianaplis|Indianapoils|Indianapoliss
Harrisburg|Harrisbrg|Harrisb ur g|Harrisburgg
Montpelier|Montpelie|Montpeiler|Montpelierr
Hydrogen|Hydrgoen|Hydrogenn|Hydroge
Nitrogen|Nitrgoen|Nitrogenn|Nitroge
Potassium|Potassum|Potass ium|Potassiumm
Phosphorus|Phosphrus|Phosphor us|Phosphoruss
Tungsten|Tungtsen|Tungstenn|Tungste
Kyrgyzstan|Kyrgyzstna|Kyrgyzstann|Kyrgyzsta`;
for (const row of typos.split('\n')) {
  const [target, ...inputs] = row.split('|');
  for (const input of inputs) add('typo', input, [target, 'Quartz', 'Watermelon'], 'match', target, true);
}
// Normalisation is not an autocorrection: preserve the original exact-match API.
for (const [target, input] of [
 ['Café','THE CAFE!'],['São Paulo','sao paulo'],['Beyoncé','BEYONCE'],['Orléans','orleans'],
 ['Kraków','Krakow'],['Dvořák','Dvorak'],['Málaga','Malaga'],['Tromsø','Tromsø'],
 ['Howl’s Moving Castle',"Howl's Moving Castle"],['Spider-Man','spider man'],
 ['New York','  New    York  '],['The Beatles','Beatles']
]) add('normalization',input,[target],'match',target);
for (const [target,input] of [
 ['New York','York New'],['Albert Einstein','Einstein Albert'],['Santa Maria','Maria Santa'],
 ['The Lord of the Rings','Rings of the Lord'],['Black Eyed Peas','Peas Eyed Black'],
 ['Harrison Ford','Ford Harrison'],['William Shakespeare','Shakespeare William'],
 ['Spirited Away','Away Spirited'],['Belo Horizonte','Horizonte Belo'],['Baking powder','Powder baking'],
 ['New York','NewYork'],['Spider-Man','Spiderman'],['Ice cream','icecream'],
 ['Twenty One','TwentyOne'],['Rock and Roll','rock & roll'],['R&B','R and B'],
 ['Simon and Garfunkel','Simon & Garfunkel'],['Saint Louis','St. Louis'],
 ['Saint John’s',"St Johns"],['St. Moritz','Saint Moritz'],['Saint Petersburg','St Petersburg'],
 ['And','&'],['Tromsø','Tromso'],['Ægir','Aegir'],['Œuvre','Oeuvre'],['Łódź','Lodz'],['Straße','Strasse']
]) add('semantic',input,[target],'match',target,true);
for(const [target,input] of [
 ['Cat','cats'],['Box','boxes'],['Church','churches'],['Dish','dishes'],['City','cities'],
 ['Berry','berries'],['Mouse','mice'],['Goose','geese'],['Child','children'],['Man','men'],
 ['Woman','women'],['Foot','feet'],['Tooth','teeth'],['Ox','oxen'],['Leaf','leaves'],
 ['Knife','knives'],['Wolf','wolves'],['Loaf','loaves'],['Bus','buses'],['Atlas','atlases'],
 ['Species','species'],['Series','series'],['Crises','crisis'],['Fish','fishes'],
 ['Moon Knight','Moon Knights'],['Mares of Diomedes','Mare of Diomedes'],['Mice','mouse']
]) add('number-and-inflection',input,[target],'match',target,target.toLowerCase()===input?undefined:true);
for(const [target,input] of [
 ['Seven','7'],['7','seven'],['Twenty-one','21'],['42','forty two'],['One hundred','100'],
 ['101','one hundred and one'],['Two thousand','2000'],['1234','one thousand two hundred thirty four'],
 ['One million','1000000'],['1000000000','one billion'],['Apollo 11','Apollo eleven'],
 ['Toy Story 3','Toy Story three'],['Ocean’s Eleven',"Ocean's 11"],['4 x 400','four x four hundred'],
 ['Ten thousand','10000'],['0','zero'],['Sixty-four','64'],['999','nine hundred ninety nine']
]) add('numbers',input,[target],'match',target,true);
for(const [target,input] of [
 ['Definitely','definately'],['Separate','seperate'],['Accommodate','accomodate'],['Receive','recieve'],
 ['Necessary','neccessary'],['Environment','enviroment'],['Government','goverment'],
 ['Restaurant','restaraunt'],['Rhythm','rythym'],['Cemetery','cemetary'],['Vacuum','vaccuum'],
 ['Broccoli','brocolli'],['Zucchini','zuchini'],['Spaghetti','spagetti'],['Mozzarella','mozzerella'],
 ['Cappuccino','capuccino'],['Espresso','expresso'],['Cinnamon','cinammon'],['Massachusetts','massachussets'],
 ['Connecticut','conneticut'],['Philadelphia','philidelphia'],['Cincinnati','cincinatti'],
 ['Kyrgyzstan','kyrgystan'],['Tchaikovsky','tchaikovski'],['Schwarzenegger','schwartzenegger']
]) add('misspelling',input,[target],'match',target,true);
for(const [target,input] of [
 ['Mercury','mercu'],['Christopher Nolan','Christopher N'],['Montpellier','Montpell'],
 ['Physics','fiziks'],['Phone','fone'],['Night','nite'],['Stephen','Steven'],
 ['Christopher','kristofor'],['School','skool'],['Phantom','fantom'],['Cat','vat'],['Cat','car'],
 ['Dog','fog'],['Sun','dun'],['Saturn','sstrun']
]) add('suggestion',input,[target],'suggest',target);
for(const [input,names] of [
 ['nite',['Night','Knight']],['fone',['Phone','Phon']],['Steven',['Stephen','Stefan']],
 ['mercu',['Mercury','Mercure']],['Montp',['Montpellier','Montpelier']],
 ['New Yrok',['New York','New Yark']],['geese',['Goose','Geeze']],
 ['Bakers',['Baker','Bakery']],['sat',['Cat','Saturn']],
 ['York Nwe',['New York','York New!']],['Smith John',['John Smith','John Smyth']],
 ['Saint Louis',['St. Louis','Saint Louise']],['elephxnt',['Elephant','Elephont']],
 ['abcdeh',['abcdef','abcdeg']],['Red Bule',['Blue Red','Red Blue!']]
]) add('ambiguity',input,names,'unknown');
// Genuine exact answers beat nearby answers, including aliases on the same answer.
add('priority','York New',['New York','York New'],'match','York New');
add('priority','Cat',['Cat','Cats'],'match','Cat');
add('priority','Aotearoa',[answer('New Zealand',55,['Aotearoa','Aotearoa!'])],'match','New Zealand');
add('priority','Mumbai',[answer('Mumbai',55,['Bombay']),'Mumbra'],'match','Mumbai');
for(const input of ['', '   ', '!?', null]) add('empty',input,['Mercury'],'empty');
for(const [input,names] of [
 ['merc',['Mercury']],['New',['New York']],['Christopher',['Christopher Nolan']],
 ['tre',['Tree']],['qzxv',['abcde']],['qzxwv',['Mercury','Venus']],
 ['one two',['12']],['two hundred hundred',['200']],['bananas',['Mercury']],
 ['Saturn '.repeat(100),['Saturn']],['2',['Two thousand']],['Zeus',['Poseidon']]
]) add('unknown',input,names,'unknown');

export function runMatcherCorpus(matchAnswer) {
  const failures = [];
  for (const item of MATCHER_CASES) {
    try {
      const result = matchAnswer(item.prompt, item.input);
      const wanted = item.expected;
      if (result.status !== wanted.status) throw new Error(`status ${result.status}, expected ${wanted.status}`);
      if (wanted.answerName !== undefined && result.answer?.name !== wanted.answerName) throw new Error(`answer ${result.answer?.name}, expected ${wanted.answerName}`);
      if (wanted.status === 'match' || wanted.status === 'suggest') {
        if (result.points !== result.answer.points) throw new Error('points differ from answer');
        if (result.corrected !== wanted.corrected) throw new Error(`corrected ${result.corrected}, expected ${wanted.corrected}`);
        if ((wanted.corrected || wanted.status === 'suggest') && result.input !== String(item.input ?? '')) throw new Error('original input was lost');
        if (wanted.status === 'suggest' && result.corrected !== undefined) throw new Error('suggestion was silently corrected');
      } else if ('answer' in result || 'points' in result) throw new Error('unresolved input leaked an answer');
    } catch (error) { failures.push({ id:item.id, group:item.group, input:item.input, expected:item.expected, error:error.message }); }
  }
  return { passed:MATCHER_CASES.length-failures.length, total:MATCHER_CASES.length, typoCases:MATCHER_CASES.filter(c=>c.group==='typo').length, failures };
}
