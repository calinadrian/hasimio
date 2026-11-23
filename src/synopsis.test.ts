import {describe,expect,it} from 'vitest';
import {sentences,synopsis} from './synopsis';

const dune='Dune (titled on-screen as Dune: Part One) is a 2021 American epic space opera film co-produced and directed by Denis Villeneuve, who co-wrote the screenplay with Jon Spaihts and Eric Roth. It is the first of a two-part adaptation of the 1965 novel by Frank Herbert and the first installment in Villeneuve\'s Dune film trilogy. The cast includes Timothée Chalamet, Rebecca Ferguson, Oscar Isaac, Josh Brolin, Stellan Skarsgård, Dave Bautista, Stephen McKinley Henderson, Zendaya, Chang Chen, Sharon Duncan-Brewster, Charlotte Rampling, Jason Momoa, and Javier Bardem. Set in the distant future, the film follows Paul Atreides (Chalamet) as his family, the aristocratic House Atreides, is thrust into a war for the inhospitable desert planet Arrakis.';

describe('synopsis',()=>{
  it('keeps only the story of a Wikipedia lead',()=>{
    expect(synopsis(dune)).toBe('Set in the distant future, the film follows Paul Atreides (Chalamet) as his family, the aristocratic House Atreides, is thrust into a war for the inhospitable desert planet Arrakis.');
  });
  it('drops the framing sentence of a documentary',()=>{
    expect(synopsis('You Can See Everything is a 2026 American experimental documentary film directed by Nathan Fielder and Lance Oppenheim. It follows Elizabeth Holmes, the founder of the defunct health technology company Theranos, after her release from prison.'))
      .toBe('It follows Elizabeth Holmes, the founder of the defunct health technology company Theranos, after her release from prison.');
  });
  it('drops cast and production notes in the middle of a sentence',()=>{
    expect(synopsis('The Odyssey is a 2026 American epic mythological action film written and directed by Christopher Nolan. An adaptation of Homer\'s ancient Greek epic poem the Odyssey, it stars an ensemble cast including Matt Damon, Tom Holland and Zendaya. In the film, Odysseus (Damon), the Greek king of Ithaca, undergoes a long and perilous journey home after the Trojan War. Nolan began writing the script in March 2024 and secured the project with Universal Pictures by October.'))
      .toBe('In the film, Odysseus (Damon), the Greek king of Ithaca, undergoes a long and perilous journey home after the Trojan War.');
  });
  it('drops credits that name the lead and production history',()=>{
    expect(synopsis('Project Hail Mary is a 2026 science fiction film produced and directed by Phil Lord and Christopher Miller and written by Drew Goddard, based on the 2021 novel by Andy Weir. It stars Ryan Gosling, who also produced the film, as Ryland Grace. The story follows Ryland Grace, a middle school teacher who awakens aboard an interstellar spacecraft with no memory of how he got there.\nPre-production began in 2020, before Weir\'s novel was published.'))
      .toBe('The story follows Ryland Grace, a middle school teacher who awakens aboard an interstellar spacecraft with no memory of how he got there.');
  });
  it('leaves an ordinary synopsis alone',()=>{
    const text='Lanterns follows new recruit John Stewart and Lantern legend Hal Jordan, two intergalactic cops drawn into a dark, Earth-based mystery as they investigate a murder in the American heartland.';
    expect(synopsis(text)).toBe(text);
    const two='A young boy discovers a portal. He must choose between two worlds before it closes.';
    expect(synopsis(two)).toBe(two);
  });
  it('keeps the original when only trivia would remain',()=>{
    const text='Example is a 2024 British drama film directed by Jane Doe. It stars John Smith and Ann Lee.';
    expect(synopsis(text)).toBe(text);
  });
  it('handles empty input',()=>{
    expect(synopsis(undefined)).toBe('');
    expect(synopsis('  ')).toBe('');
  });
});

describe('sentences',()=>{
  it('does not split on initials or abbreviations',()=>{
    expect(sentences('Star Trek is a 2009 film directed by J. J. Abrams. Kirk joins the U.S. Navy. Dr. Who arrives!')).toEqual(['Star Trek is a 2009 film directed by J. J. Abrams.','Kirk joins the U.S. Navy.','Dr. Who arrives!']);
  });
});
