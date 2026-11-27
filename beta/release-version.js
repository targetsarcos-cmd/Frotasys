'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function resolveVersion(env=process.env,root=path.join(__dirname,'..')){
  const commit=String(env.RENDER_GIT_COMMIT||'').trim().toLowerCase();
  if(/^[a-f0-9]{40,64}$/.test(commit))return commit;
  const hash=crypto.createHash('sha256');
  function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.name.startsWith('.')||['node_modules','uploads','test','data'].includes(entry.name))continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){
        if(dir!==root||['public','beta'].includes(entry.name))walk(file);
      }else if(entry.isFile()&&/\.(js|css|html|json|svg|webmanifest)$/i.test(entry.name)){
        hash.update(path.relative(root,file)).update('\0').update(fs.readFileSync(file)).update('\0');
      }
    }
  }
  walk(root);
  return hash.digest('hex');
}

function stampVersion(html,version){
  if(!/^[a-f0-9]{40,64}$/.test(version))throw Error('Versão inválida');
  return html.replace('</head>','<meta name="frotasys-version" content="'+version+'"></head>')
    .replace('</body>','<script src="/js/version-notice.js"></script></body>')
    .replace(/\b(src|href)="(\/?(?:js|css)\/[^"?]+)(?:\?[^"]*)?"/g,(_all,attr,url)=>attr+'="'+url+'?v='+version+'"');
}
module.exports={resolveVersion,stampVersion};
