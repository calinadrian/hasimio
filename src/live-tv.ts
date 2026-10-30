export const liveChannels=[{
  id:'cartoon-network',
  name:'Cartoon Network',
  provider:'Cool-eTv',
  servers:[
    {id:'main',name:'Server 1',url:'https://www.cool-etv.net/ch/cartoon.htm'},
    {id:'alternative',name:'Server 2',url:'https://www.cool-etv.net/ch/cartoon-s2.htm'},
  ],
},{
  id:'a1',
  name:'A1',
  provider:'Cool-eTv',
  servers:[
    {id:'main',name:'Server 1',url:'https://www.cool-etv.net/ch/an1.htm'},
    {id:'alternative',name:'Server 2',url:'https://www.cool-etv.net/ch/an1-s2.htm'},
  ],
},{
  id:'tlc',
  name:'TLC',
  provider:'Cool-eTv',
  servers:[{id:'main',name:'Server 1',url:'https://www.cool-etv.net/ch/tlc-s1.htm'}],
}] as const;
