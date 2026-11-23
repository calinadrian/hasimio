// Wikipedia leads open with encyclopedia framing ("Dune is a 2021 American epic
// space opera film directed by…", "The cast includes…") before the story. A
// streaming synopsis should start with the story, so those sentences are dropped
// when what remains still describes the title.

// Split after . ! ? unless the period ends an initial ("J. J. Abrams", "U.S.")
// or a common abbreviation.
const boundary=/(?<=(?<!\b(?:[A-Z]|Jr|Sr|Dr|Mr|Mrs|Ms|St|vs|Vol|No|Mt|Ft))[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/;

const kind='(?:film|movie|documentary|docuseries|miniseries|series|sitcom|anime|animated|drama|comedy|thriller|serial|show|programme|program|special|musical)';
// "X is a 2021 American … film", "X (stylized …) was an upcoming … series"
const lead=new RegExp(`^[^.]{0,220}?\\b(?:is|was) an? (?:upcoming |forthcoming |unreleased )?(?:\\d{4} )?[^.]{0,160}?\\b${kind}\\b`,'i');
const trivia=[
  // Cast and crew credits.
  /^(?:the (?:film|movie|series|show|cast)|it) (?:stars|starring|features|co-stars|also stars)\b/i,
  /^(?:the )?(?:ensemble )?cast (?:includes|consists|features|is led)\b/i,
  /^(?:it|the (?:film|movie|series|show)) (?:was|is) (?:directed|written|produced|co-produced|created|developed|adapted|based|distributed|released|filmed|shot|announced|commissioned|ordered|renewed|executive produced)\b/i,
  /^(?:it|the (?:film|movie|series|show)) (?:premiered|debuted|received|grossed|earned|won|was nominated|is the (?:first|second|third|fourth|fifth|final|last|sequel|prequel|\w+ installment|\w+ entry))\b/i,
  /^(?:it|the (?:film|movie|series|show)) is (?:a |the )?(?:sequel|prequel|spin-?off|remake|reboot|adaptation|follow-up)\b/i,
  /^(?:directed|written|produced|starring|based on)\b/i,
  /\b(?:principal photography|filming|(?:pre-|post-)?production|development) (?:began|took place|started|commenced|wrapped)\b/i,
  // The same notes mid-sentence: "An adaptation of …, it stars an ensemble cast including …".
  /\b(?:it|the (?:film|movie|series|show)) (?:stars|co-stars)\b|\bensemble cast\b|\bstarring\b|\bcast includes\b/i,
  /\b(?:began|started|finished) (?:writing|filming|shooting|developing|production)\b|\bprincipal photography\b|\bsecured the project\b|\bat the box office\b|\bgrossed\b/i,
];

export function sentences(text:string):string[] {
  return text.replace(/\s+/g,' ').trim().split(boundary).filter(Boolean);
}

/** The story part of a description, or the description unchanged when it has no encyclopedia framing. */
export function synopsis(text:string|undefined):string {
  const source=(text??'').trim();
  if(!source)return '';
  const parts=sentences(source);
  if(parts.length<2)return source;
  const kept=parts.filter((sentence,index)=>!(index===0&&lead.test(sentence))&&!trivia.some(rule=>rule.test(sentence)));
  // Keep the original when nothing (or only a fragment) would be left.
  const result=kept.join(' ');
  return kept.length&&result.length>=40?result:source;
}
