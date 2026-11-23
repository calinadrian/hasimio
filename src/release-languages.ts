// Audio languages a release name announces, before its tracks are checked. Torrentio marks
// languages with flag emoji ("🇮🇹 / 🇬🇧"); scene names use words such as iTALiAN, FRENCH or RoDubbed.
// An untagged release names no language: usually the original audio, so it says nothing either way.

const flags:Record<string,string>={gb:'en',us:'en',au:'en',ca:'en',it:'it',fr:'fr',es:'es',mx:'es',ar:'es',de:'de',at:'de',ru:'ru',ua:'uk',ro:'ro',md:'ro',pt:'pt',br:'pt',hu:'hu',pl:'pl',cz:'cs',sk:'sk',nl:'nl',be:'nl',tr:'tr',gr:'el',bg:'bg',rs:'sr',hr:'hr',si:'sl',se:'sv',dk:'da',no:'no',fi:'fi',in:'hi',jp:'ja',kr:'ko',cn:'zh',tw:'zh',hk:'zh',th:'th',vn:'vi',id:'id',il:'he',sa:'ar',ae:'ar',ir:'fa',lt:'lt',lv:'lv',ee:'et'};
const words:[RegExp,string][]=[
  [/\b(?:english|eng)\b(?![ ._-]*subs?\b)/i,'en'],
  [/\b(?:ita|italian|italiano)\b/i,'it'],
  [/\b(?:french|truefrench|vff|vfq|vf2|vfi)\b/i,'fr'],
  [/\b(?:spanish|castellano|latino|español|espanol|esp)\b/i,'es'],
  [/\b(?:german|deutsch|ger)\b(?![ ._-]*subs?\b)/i,'de'],
  [/\b(?:russian|rus)\b(?![ ._-]*subs?\b)/i,'ru'],
  [/\b(?:ukrainian|ukr)\b(?![ ._-]*subs?\b)/i,'uk'],
  [/\b(?:romanian|rodubbed|dublat)\b/i,'ro'],
  [/\b(?:portuguese|dublado|ptbr|pt-br)\b/i,'pt'],
  [/\b(?:hungarian|hun)\b(?![ ._-]*subs?\b)/i,'hu'],
  [/\b(?:polish|dubbing[ ._-]*pl|lektor[ ._-]*pl|pldub)\b/i,'pl'],
  [/\b(?:czech|cz[ ._-]*dabing)\b/i,'cs'],
  [/\b(?:dutch)\b(?![ ._-]*subs?\b)/i,'nl'],
  [/\b(?:turkish)\b(?![ ._-]*subs?\b)/i,'tr'],
  [/\b(?:hindi)\b(?![ ._-]*subs?\b)/i,'hi'],
  [/\b(?:tamil)\b/i,'ta'],[/\b(?:telugu)\b/i,'te'],
  [/\b(?:korean)\b(?![ ._-]*subs?\b)/i,'ko'],
  [/\b(?:japanese)\b(?![ ._-]*subs?\b)/i,'ja'],
];

export type ReleaseAudio={languages:string[];multi:boolean};
export function releaseAudio(text:string):ReleaseAudio{
  const clean=text.replaceAll('_','.');
  const found=new Set<string>();
  for(const [,pair] of clean.matchAll(/((?:\uD83C[\uDDE6-\uDDFF]){2})/g)){
    const code=[...pair].map(char=>String.fromCharCode((char.codePointAt(0)??0)-0x1F1E6+97)).join('');
    if(flags[code])found.add(flags[code]);
  }
  for(const [pattern,language] of words)if(pattern.test(clean))found.add(language);
  const multi=/\b(?:dual[ ._-]*(?:audio|dub)|multi(?:[ ._-]*(?:audio|dub|lang))?)\b/i.test(clean)&&!/\bmulti[ ._-]*subs?\b/i.test(clean);
  return {languages:[...found],multi};
}
