import {expect,it} from 'vitest';
import {withLiveSeeders} from './live-seeders';

it('replaces stale listed seeders with live tracker counts',()=>{
  const streams=[{infoHash:'A'.repeat(40),seeders:617},{infoHash:'b'.repeat(40),seeders:109},{infoHash:'c'.repeat(40),seeders:5},{url:'https://example.com/v.mp4'}];
  const live=withLiveSeeders(streams,{['a'.repeat(40)]:1,['b'.repeat(40)]:97});
  expect(live.map(stream=>stream.seeders)).toEqual([0,97,5,undefined]);
});
