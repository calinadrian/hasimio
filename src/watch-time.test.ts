import {describe,expect,it} from 'vitest';
import {formatWatchTime,runtimeSeconds} from './watch-time';
describe('watch runtime units',()=>{
  it('reads numeric minutes and labelled movie and episode lengths',()=>{
    expect(runtimeSeconds(45)).toBe(2700);
    expect(runtimeSeconds('120 min')).toBe(7200);
    expect(runtimeSeconds('2h 15m')).toBe(8100);
    expect(runtimeSeconds('1h30m')).toBe(5400);
    expect(runtimeSeconds('1 hour 5 minutes')).toBe(3900);
  });
  it('excludes invalid or unavailable lengths',()=>{
    for(const value of [undefined,'Unknown','',-5,'-30 min',Infinity])expect(runtimeSeconds(value)).toBe(0);
  });
  it('formats minutes, hours and days without rounding up unwatched minutes',()=>{
    expect(formatWatchTime(0)).toBe('0m');
    expect(formatWatchTime(30)).toBe('<1m');
    expect(formatWatchTime(3599)).toBe('59m');
    expect(formatWatchTime(3660)).toBe('1h 1m');
    expect(formatWatchTime(86400)).toBe('1d');
    expect(formatWatchTime(2*86400+3*3600+4*60)).toBe('2d 3h 4m');
  });
});
