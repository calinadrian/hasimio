import fs from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const privateFile=path.join(root,'.cache','webos-update-signing-key.pem');
const publicFile=path.join(root,'webos','update-public-key.pem');
try{await fs.access(publicFile);throw Error('The TV update public key already exists. Keep its matching private key; replacing it would break installed TVs.');}catch(error){if(error.code!=='ENOENT')throw error;}
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
await fs.mkdir(path.dirname(privateFile),{recursive:true});
await fs.writeFile(privateFile,pair.privateKey,{mode:0o600,flag:'wx'});
await fs.writeFile(publicFile,pair.publicKey,{flag:'wx'});
console.log('Created the public TV update key and its matching private key in the ignored .cache folder. Back up that private file securely.');
