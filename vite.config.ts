import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {createMediaService} from './server/service.mjs';
export default defineConfig({ plugins: [react(),{
  name:'hasimio-local-streaming',
  configureServer(server) {const service=createMediaService({lan:true});server.middlewares.use((req,res,next)=>{void service.handle(req,res,next);});server.httpServer?.once('close',()=>{void service.close();});},
  configurePreviewServer(server) {const service=createMediaService({lan:true});server.middlewares.use((req,res,next)=>{void service.handle(req,res,next);});server.httpServer.once('close',()=>{void service.close();});},
}],
  // Generated folders hold locked Chromium files during packaging and smoke
  // tests; watching them crashes the dev server with EBUSY on Windows.
  server:{watch:{ignored:['**/release/**','**/.cache/**','**/dist/**']}},
});
