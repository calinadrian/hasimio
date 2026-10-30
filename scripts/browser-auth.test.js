import {describe,it,expect} from 'vitest';
import {authOptions,openAuthenticatedSession} from './browser-auth.mjs';
const base={loginUrl:'https://internal.example/login',checkUrl:'https://internal.example/dashboard',authenticatedSelector:'[data-testid="signed-in"]',statePath:'playwright/.auth/test.json',profileDir:'playwright/.auth/test-profile'};
describe('human browser authentication options',()=>{
  it('requires a success signal and rejects credential URLs or plaintext remote origins',()=>{
    expect(()=>authOptions({...base,authenticatedSelector:''})).toThrow('selector');
    expect(()=>authOptions({...base,loginUrl:'https://user:password@internal.example'})).toThrow('embedded credentials');
    expect(()=>authOptions({...base,loginUrl:'http://internal.example'})).toThrow('HTTPS');
    expect(authOptions({...base,loginUrl:'http://127.0.0.1:1234/login'}).mode).toBe('profile');
  });
  it('rejects hidden interactive login and honours cancellation before launching',async()=>{
    await expect(openAuthenticatedSession({...base,interactive:true,headless:true})).rejects.toThrow('visible browser');
    const controller=new AbortController();controller.abort(new Error('Cancelled before launch'));
    await expect(openAuthenticatedSession(base,{signal:controller.signal})).rejects.toThrow('Cancelled before launch');
  });
});
