// Curated selection from the verified English catalog, in the order shown to the user.
// These are recommendations, not measured IPTV audience ratings.
const names=[
  'ESPN (United States) HD','Fox News Channel','CNN','HBO Asia HD','Disney Channel (United States)',
  'Cartoon Network Asia','Nickelodeon (United Kingdom)','Discovery Channel (India)','Animal Planet (India)','Food Network (United States)',
  'Paramount Network','MTV (United States)','Fox Sports 1','NBA TV','NHL Network',
  'ESPN 2 (United States) HD','CNBC UK','BBC Earth US','Bloomberg TV','CBS News 24/7',
  'ABC News','NBC News NOW','CNN International','Al Jazeera English','France 24 English',
  'Euronews English HD','NHK World-Japan','MS NOW','Newsmax TV','Fox Business Network',
  'SYFY','Bravo','IFC','Cinemax Asia HD','HBO Family Asia HD',
  'HBO Signature Asia HD','HBO Hits Asia HD','Starz West','Starz Comedy','Starz Kids & Family',
  'Smithsonian Channel Selects (United States)','History Asia','Discovery Science','Crime + Investigation','Investigation Discovery (India)',
  'American Heroes Channel','Destination America','TLC (India)','Cooking Channel','We TV',
  'OWN','BET','CMT','Fuse','MTV Live',
  'The Weather Channel','PBS KQED','PBS Kids','Nicktoons (United States)','Boomerang',
  'Cartoonito Asia','Nick Jr. Pluto TV','SpongeBob SquarePants','Tom And Jerry','South Park (United States)',
  'Comedy Central (United States) CA','SNL Vault','The Daily Show','Key & Peele',"Chappelle's Show",
  'Star Trek: The Next Generation (United States)','Star Trek: Voyager (United States)','NCIS (United States) CA','NCIS: Los Angeles (United States)','Doctor Who Classic',
  'The Twilight Zone','Frasier (United States)','Cheers (United States)','Married with Children','I Love Lucy',
  'The Andy Griffith Show','Gunsmoke','Perry Mason','The Judge Judy Channel','Dateline 24/7',
  '48 Hours','Unsolved Mysteries','Cold Case Files','Top Gear','Anthony Bourdain: Parts Unknown',
  "Gordon Ramsay's Hell's Kitchen","America's Test Kitchen",'This Old House','Antiques Roadshow UK','Tennis Channel',
  'beIN SPORTS XTRA','Red Bull TV','FIFA+','PGA Tour','Big Ten Network',
];
const ranks=new Map(names.map((name,index)=>[name,index+1]));
export function liveTvTopRank(name:string){return ranks.get(name.replace(/ \(\d+p\)/g,''));}
